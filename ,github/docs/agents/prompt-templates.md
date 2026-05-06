# Agent Prompt Templates

Copy-paste these prompts to Copilot Chat (or any AI chat) when starting common tasks.
They pre-load the right context so the agent doesn't have to guess your conventions.

---

## 🆕 New Feature (Full Stack)

```
@workspace I need to add [FEATURE NAME].

Load and follow: .github/instructions/orchestrator-agent.instructions.md

Domains affected: [Bicep / Cosmos / API / Next.js — check all that apply]

Before writing code:
1. Define the Cosmos document schema in docs/contracts/cosmos-schemas.ts
2. Define the API request/response types in docs/contracts/api-schema.ts
3. Add any new env vars to docs/contracts/env-contract.ts

Then implement in order: Cosmos schema → API → Next.js UI
```

---

## 🏗️ New Azure Resource

```
@workspace Add a new [RESOURCE TYPE] to the infrastructure.

Load and follow: .github/instructions/bicep-agent.instructions.md

Requirements:
- [describe the resource and why]
- Environment: [dev / all]
- Any new outputs needed by API or frontend?

After Bicep is done, update docs/contracts/env-contract.ts with any new connection strings.
```

---

## 🗄️ New Cosmos Container

```
@workspace Add a new Cosmos DB container for [ENTITY NAME].

Load and follow: .github/instructions/cosmos-agent.instructions.md

Answer before starting:
- Partition key value: [e.g. tenantId, userId, type]
- Expected query patterns: [list the WHERE clauses you'll need]
- Expected document size: [small / medium / large]
- TTL needed? [yes/no + duration]

Deliverables:
1. Document interface in docs/contracts/cosmos-schemas.ts
2. Repository class in api/src/lib/cosmos/repositories/
3. Container definition in infra/modules/cosmos.bicep
```

---

## 🔌 New API Endpoint

```
@workspace Add a [GET/POST/PUT/DELETE] endpoint for [RESOURCE].

Load and follow: .github/instructions/api-agent.instructions.md

Before writing the handler:
1. Check docs/contracts/api-schema.ts — does the type exist? Add it if not.
2. Check docs/contracts/cosmos-schemas.ts — does the document interface exist?

Endpoint: [METHOD] /api/[route]
Auth required: [yes/no + role if applicable]
Request body: [describe or reference existing schema]
Response: [describe or reference existing schema]
```

---

## 🖥️ New Next.js Page / Feature

```
@workspace Add a [PAGE / COMPONENT] for [FEATURE].

Load and follow: .github/instructions/nextjs-agent.instructions.md

- Route: /[path]
- Auth required: [yes/no]
- Data needed: [list API endpoints from docs/contracts/api-schema.ts]
- Mutations: [list actions if any]

Import all types from docs/contracts/api-schema.ts — do not define inline types.
Use Server Components by default; only add 'use client' if interaction requires it.
```

---

## 🔒 Security Review

```
@workspace Do a security review of [AREA / FILE / FEATURE].

Check all of the following:
- [ ] No secrets or connection strings hardcoded
- [ ] All process.env references go through docs/contracts/env-contract.ts
- [ ] All API endpoints validate auth via requireAuth() middleware
- [ ] Cosmos queries always pass partition key (no unintentional cross-partition)
- [ ] Bicep: publicNetworkAccess appropriately restricted
- [ ] Bicep: no listKeys() outputs that leak into deployment history
- [ ] No NEXT_PUBLIC_ env vars that contain secrets
```

---

## 🚀 New CI/CD Pipeline or Update

```
@workspace Update the CI/CD pipeline to [DESCRIBE CHANGE].

Load and follow: .github/instructions/cicd-agent.instructions.md

Context:
- New resource/env var being added: [yes/no — if yes, describe]
- Target workflow file: [pr-validation / deploy-infra / deploy-api / deploy-frontend]
- Use OIDC for Azure auth (never store AZURE_CLIENT_SECRET as a GitHub secret)
```
