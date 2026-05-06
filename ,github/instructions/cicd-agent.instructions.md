# CI/CD Agent Instructions

**Trigger**: Tasks in `.github/workflows/**`, deployment pipeline changes, or adding new resources/env vars that need wiring into CI.

---

## Pipeline Structure

```
.github/workflows/
├── pr-validation.yml          # Runs on every PR — fast checks only
├── deploy-infra.yml           # Bicep deployment (manual trigger + main branch)
├── deploy-api.yml             # Azure Functions deployment
├── deploy-frontend.yml        # Next.js deployment
└── nightly-integration.yml    # Full E2E tests (scheduled)
```

---

## PR Validation (Fast — <5 min target)

```yaml
# .github/workflows/pr-validation.yml
name: PR Validation

on:
  pull_request:
    branches: [main, develop]

jobs:
  validate-infra:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.changed_files, 'infra/')
    steps:
      - uses: actions/checkout@v4
      - name: Bicep Build (lint)
        run: az bicep build --file infra/main.bicep

  validate-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci --workspace=api
      - run: npm run typecheck --workspace=api
      - run: npm run lint --workspace=api
      - run: npm run test:unit --workspace=api

  validate-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci --workspace=frontend
      - run: npm run typecheck --workspace=frontend
      - run: npm run lint --workspace=frontend
      - run: npm run build --workspace=frontend
```

---

## Infra Deployment

```yaml
# .github/workflows/deploy-infra.yml
name: Deploy Infrastructure

on:
  push:
    branches: [main]
    paths: ['infra/**']
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [dev, staging, prod]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'dev' }}
    permissions:
      id-token: write    # OIDC — no stored secrets
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: What-If (safety check)
        run: |
          az deployment group what-if \
            --resource-group ${{ vars.RESOURCE_GROUP }} \
            --template-file infra/main.bicep \
            --parameters infra/main.${{ env.ENVIRONMENT }}.bicepparam

      - name: Deploy Bicep
        id: deploy
        run: |
          OUTPUT=$(az deployment group create \
            --resource-group ${{ vars.RESOURCE_GROUP }} \
            --template-file infra/main.bicep \
            --parameters infra/main.${{ env.ENVIRONMENT }}.bicepparam \
            --query properties.outputs)
          echo "outputs=$OUTPUT" >> $GITHUB_OUTPUT

      - name: Update GitHub Env Vars from outputs
        # Propagate Bicep outputs → GitHub Actions environment vars
        run: |
          FUNCTION_APP=$(echo '${{ steps.deploy.outputs.outputs }}' | jq -r '.functionAppName.value')
          echo "FUNCTION_APP_NAME=$FUNCTION_APP" >> $GITHUB_ENV
```

---

## API Deployment

```yaml
# .github/workflows/deploy-api.yml
name: Deploy API

on:
  push:
    branches: [main]
    paths: ['api/**']

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment: dev

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }

      - run: npm ci --workspace=api
      - run: npm run build --workspace=api

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy to Azure Functions
        uses: azure/functions-action@v1
        with:
          app-name: ${{ vars.FUNCTION_APP_NAME }}
          package: api/dist
          respect-funcignore: true
```

---

## Secrets vs Variables Convention

| Type | Use | Example |
|---|---|---|
| `secrets.*` | Sensitive — Azure credentials, API keys | `AZURE_CLIENT_ID` |
| `vars.*` | Non-sensitive config — resource names, URLs | `RESOURCE_GROUP`, `FUNCTION_APP_NAME` |
| `env:` in step | Computed during run — Bicep outputs | `FUNCTION_APP_NAME` from deployment output |

**Never** put secrets in `vars.*`. **Never** echo secrets in logs.

---

## OIDC Authentication (No Stored Credentials)

Always use OIDC federated identity — never store `AZURE_CLIENT_SECRET` in GitHub:

```bash
# One-time setup (run locally):
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:YOUR_ORG/YOUR_REPO:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

---

## Checklist — When Adding a New Resource or Env Var

- [ ] Bicep module updated with new resource
- [ ] New resource name exported from `main.bicep` outputs
- [ ] `deploy-infra.yml` captures and propagates the new output
- [ ] New env var added to `docs/contracts/env-contract.ts`
- [ ] New env var added to GitHub Actions environment (`vars` or `secrets`)
- [ ] New env var added to `local.settings.json.example` with a placeholder value
- [ ] `pr-validation.yml` still passes with new var (use a dummy in test env)
