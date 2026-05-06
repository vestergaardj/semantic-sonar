# MSAL / Entra ID App Registration Setup

Semantic Sonar uses **two separate Entra ID app registrations**:

| # | Registration | Purpose |
|---|---|---|
| 1 | **Dashboard app** | Authenticate users into the Next.js dashboard via Azure Static Web Apps Easy Auth |
| 2 | **Power BI service app** | Authenticate as a multi-tenant service principal to execute DAX queries via the Power BI REST API |

---

## 1. Dashboard App Registration (SWA Easy Auth)

This registration enables users to sign in to the Semantic Sonar Dashboard with their Microsoft/work account.

### 1.1 Create the registration

```bash
az ad app create \
  --display-name "Semantic Sonar Dashboard" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "https://<your-swa-hostname>/.auth/login/aad/callback" \
                       "http://localhost:3000/.auth/login/aad/callback"
```

Or via the portal:

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**
2. Name: `Semantic Sonar Dashboard`
3. Supported account types: **Accounts in this organizational directory only** (single tenant)
4. Redirect URI: **Web** → `https://<your-swa-hostname>/.auth/login/aad/callback`
5. Click **Register**

### 1.2 Configure ID tokens

1. Open the registration → **Authentication**
2. Under **Implicit grant and hybrid flows**, enable **ID tokens**
3. Save

### 1.3 Note the values

| Value | Where to find it |
|---|---|
| Application (client) ID | Registration → Overview |
| Directory (tenant) ID | Registration → Overview |

### 1.4 Create a client secret (required by SWA Easy Auth)

1. **Certificates & secrets → New client secret**
2. Description: `swa-easy-auth`, Expiry: 24 months
3. Copy the **Value** immediately — it is only shown once

### 1.5 Configure SWA Easy Auth

After deploying the Static Web App:

```bash
az staticwebapp auth update \
  --name <swa-name> \
  --resource-group <rg> \
  --provider aad \
  --client-id <dashboard-app-client-id> \
  --client-secret <dashboard-app-secret> \
  --tenant-id <your-tenant-id> \
  --openid-issuer "https://login.microsoftonline.com/<your-tenant-id>/v2.0"
```

> **Note:** The SWA auth configuration injects the `X-MS-CLIENT-PRINCIPAL` header into every authenticated request. The Functions API validates this header via `AuthHelper.IsAuthenticated()` (see `src/SemanticSonar.Functions/Helpers/AuthHelper.cs`).

### 1.6 Environment variables for local development

Update `src/SemanticSonar.Web/.env.local`:

```env
NEXT_PUBLIC_MSAL_CLIENT_ID=<dashboard-app-client-id>
NEXT_PUBLIC_MSAL_TENANT_ID=<your-tenant-id>
```

> In production (SWA), authentication is handled by Easy Auth — the MSAL variables are only used in local development (`NODE_ENV=development`) where mock auth is used. See `lib/auth.ts`.

---

## 2. Power BI Service App Registration (Multi-tenant)

This registration allows the Azure Function worker to execute DAX queries against customer Power BI semantic models across **different Entra tenants**.

### 2.1 Create the registration

```bash
az ad app create \
  --display-name "Semantic Sonar Power BI" \
  --sign-in-audience AzureADMultipleOrgs
```

Or via the portal:

1. **Azure Portal → Microsoft Entra ID → App registrations → New registration**
2. Name: `Semantic Sonar Power BI`
3. Supported account types: **Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant)**
4. Redirect URI: leave blank (no interactive login)
5. Click **Register**

### 2.2 Add Power BI API permissions

1. **API permissions → Add a permission → Power BI Service**
2. Select **Application permissions** (not Delegated)
3. Add: `Dataset.ReadWrite.All`
4. Click **Add permissions**
5. Click **Grant admin consent for \<your tenant\>**

> **Why application permissions?** The Azure Function runs as an unattended service with no user interaction. Application permissions are granted by an admin in each customer tenant.

### 2.3 Create a client secret

1. **Certificates & secrets → New client secret**
2. Description: `powerbi-service`, Expiry: 24 months
3. Copy the **Value** immediately

### 2.4 Store the secret in Key Vault

Secrets are stored **per-tenant** using the naming convention `tenant-{tenantId}-client-secret`, where `{tenantId}` is the Cosmos DB document ID (e.g. `tenant-11111111-2222-3333-4444-555555555555`):

```bash
az keyvault secret set \
  --vault-name <kv-name> \
  --name "tenant-tenant-<customer-entra-guid>-client-secret" \
  --value "<secret-value>"
```

The Function App reads this secret via `KeyVaultService.GetTenantClientSecretAsync(tenantId)` using its **Managed Identity** (no credentials required at the Function level). Secrets are cached in-memory for 30 minutes.

### 2.5 Register the tenant in Semantic Sonar

Add the tenant via the dashboard or directly via the API, providing the app registration `clientId`:

```bash
curl -X POST https://<swa-hostname>/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Contoso",
    "entraId": "11111111-2222-3333-4444-555555555555",
    "clientId": "<powerbi-app-client-id>"
  }'
```

The `clientId` is stored on the tenant document in Cosmos DB and used at runtime by `PowerBiQueryService` to acquire per-tenant tokens. There is no shared Function App setting for the Power BI client ID.

### 2.6 Customer tenant admin consent

Each customer tenant must grant consent to the multi-tenant app registration. Share the following URL with each customer's tenant admin. They must be a **Global Administrator** or **Privileged Role Administrator**:

```
https://login.microsoftonline.com/<customer-tenant-id>/adminconsent
  ?client_id=<powerbi-app-client-id>
  &redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient
```

Once consent is granted, the service principal is created in the customer's tenant and the Function can acquire tokens for that tenant.

---

## Architecture Summary

```
User (browser)
    │  OIDC login
    ▼
Azure SWA Easy Auth ──► Entra ID "Semantic Sonar Dashboard" app
    │  X-MS-CLIENT-PRINCIPAL header
    ▼
Azure Function API
    │  DefaultAzureCredential (Managed Identity)
    ├──► Cosmos DB ──► tenant.ClientId (per-tenant app registration client ID)
    ├──► Azure Key Vault ──► tenant-{tenantId}-client-secret (per-tenant)
    │
    │  ClientSecretCredential(customerTenantId, clientId, secret)
    ▼
Customer Entra Tenant ──► Power BI REST API
```

---

## Quick Reference

| Variable | Where set | Value |
|---|---|---|
| `NEXT_PUBLIC_MSAL_CLIENT_ID` | `.env.local` | Dashboard app client ID |
| `NEXT_PUBLIC_MSAL_TENANT_ID` | `.env.local` | Your (CatMan) tenant ID |
| `clientId` (on tenant document) | Cosmos DB `tenants` container | Power BI app client ID (per-tenant) |
| Key Vault secret name | Azure Key Vault | `tenant-{tenantId}-client-secret` (per-tenant) |
| `KEY_VAULT_URI` | Function App settings | `https://kv-semantic-sonar-<suffix>.vault.azure.net/` |

---

## CLI Reference — All Commands Ready to Run

Run the commands in **three phases** — before deployment, deployment itself, and post-deployment wiring. Each phase is a self-contained bash block that you can copy and run in one go.

> **Note on resource names:** Bicep generates names using a deterministic suffix (`uniqueString(resourceGroup().id, environmentName)`). You cannot know these names in advance — Phase 3 reads them from `azd env get-values` after the deployment completes.

---

### Prerequisite check — install once

```bash
# Azure CLI ≥ 2.60
az version --query '"azure-cli"' -o tsv

# Azure Developer CLI (azd) ≥ 1.9
# Windows:  winget install microsoft.azd
# macOS:    brew install azure/azd/azd
# Linux:    curl -fsSL https://aka.ms/install-azd.sh | bash
azd version

# .NET SDK ≥ 8.0
dotnet --version

# Node.js ≥ 18
node --version
```

---

### Phase 1 — Entra app registrations (run before `azd up`)

These steps create the two app registrations. No Azure infrastructure needs to exist yet.
**Save the IDs and secrets printed at the end — you will need them in Phase 3.**

```bash
# ── Sign in ───────────────────────────────────────────────────────────────────
az login                        # account must have Application Administrator role
TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "Tenant: $TENANT_ID"
echo "Subscription: $SUBSCRIPTION_ID"

# ── 1. Dashboard App Registration (single-tenant, SWA Easy Auth) ──────────────

# 1a. Create the registration
# tr -d '\r' strips the carriage return that az CLI adds on Windows (Git Bash/CRLF)
DASHBOARD_APP_ID=$(az ad app create \
  --display-name "Semantic Sonar Dashboard" \
  --sign-in-audience AzureADMyOrg \
  --query appId -o tsv | tr -d '\r')
echo "Dashboard App ID: [$DASHBOARD_APP_ID]"  # brackets reveal hidden chars

# 1b. Create a service principal
# App is created in-region so it's visible immediately once the variable is clean.
# A short wait handles any transient Graph delay.
echo "Creating service principal..."
sleep 15
if az ad sp show --id "$DASHBOARD_APP_ID" --query appId -o tsv 2>/dev/null | tr -d '\r' | grep -q .; then
  echo "\u2714 SP already exists."
else
  az ad sp create --id "$DASHBOARD_APP_ID"
  echo "\u2714 SP created."
fi

# 1c. Enable ID tokens (required by SWA Easy Auth OIDC flow)
az ad app update \
  --id "$DASHBOARD_APP_ID" \
  --enable-id-token-issuance true

# 1d. Add localhost redirect URI for local development
#     The production SWA redirect URI is added in Phase 3 once the hostname is known
az ad app update \
  --id "$DASHBOARD_APP_ID" \
  --web-redirect-uris "http://localhost:3000/.auth/login/aad/callback"

# 1e. Create client secret (valid 24 months)
DASHBOARD_SECRET=$(az ad app credential reset \
  --id "$DASHBOARD_APP_ID" \
  --display-name "swa-easy-auth" \
  --years 2 \
  --query password -o tsv)

# ── 2. Power BI Service App Registration (multi-tenant, unattended service) ───

# 2a. Create the multi-tenant registration
PBI_APP_ID=$(az ad app create \
  --display-name "Semantic Sonar Power BI" \
  --sign-in-audience AzureADMultipleOrgs \
  --query appId -o tsv | tr -d '\r')
echo "Power BI App ID: [$PBI_APP_ID]"

# 2b. Create a service principal (same pattern as above)
echo "Creating service principal..."
sleep 15
if az ad sp show --id "$PBI_APP_ID" --query appId -o tsv 2>/dev/null | tr -d '\r' | grep -q .; then
  echo "\u2714 SP already exists."
else
  az ad sp create --id "$PBI_APP_ID"
  echo "\u2714 SP created."
fi

# 2c. Add Dataset.ReadWrite.All application permission
#     Power BI Service resource:  00000009-0000-0000-c000-000000000000
#     Dataset.ReadWrite.All ID:   7504609f-c495-4c64-8542-686125a5a36f
az ad app permission add \
  --id "$PBI_APP_ID" \
  --api "00000009-0000-0000-c000-000000000000" \
  --api-permissions "7504609f-c495-4c64-8542-686125a5a36f=Role"

# 2d. Grant admin consent for the home tenant
# Must wait for the SP + permission add to propagate before consent will succeed.
echo "Waiting for permission to propagate before granting admin consent..."
sleep 30
for i in $(seq 1 6); do
  az ad app permission admin-consent --id "$PBI_APP_ID" 2>/dev/null && { echo "✔ Admin consent granted."; break; }
  echo "  consent attempt $i/6 failed, retrying in 15s..."
  sleep 15
done

# 2e. Create client secret (valid 24 months)
PBI_SECRET=$(az ad app credential reset \
  --id "$PBI_APP_ID" \
  --display-name "powerbi-service" \
  --years 2 \
  --query password -o tsv)

# ── Summary — save these values ───────────────────────────────────────────────
echo ""
echo "=== SAVE THESE VALUES — needed in Phase 3 ==="
echo "TENANT_ID=$TENANT_ID"
echo "SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
echo "DASHBOARD_APP_ID=$DASHBOARD_APP_ID"
echo "DASHBOARD_SECRET=$DASHBOARD_SECRET"
echo "PBI_APP_ID=$PBI_APP_ID"
echo "PBI_SECRET=$PBI_SECRET"
echo "=============================================="
```

---

### Phase 2 — Provision and deploy with `azd`

```bash
# ── Variables — adjust environment name and location ──────────────────────────
ENV_NAME="prod"         # becomes part of the resource group name: rg-prod
LOCATION="northeurope"  # az account list-locations --output table

# ── 2.1. Initialise azd environment (first time only) ─────────────────────────
# Run from the repo root (where azure.yaml lives).
# 'azd init' detects azure.yaml and only asks for an environment name.
azd init
# If you prefer non-interactive:
#   azd env new "$ENV_NAME"
#   azd env set AZURE_SUBSCRIPTION_ID "$SUBSCRIPTION_ID"
#   azd env set AZURE_LOCATION         "$LOCATION"

# ── 2.2. Provision infrastructure AND deploy both services ────────────────────
# Creates: resource group, Key Vault, Cosmos DB, Storage, Function App,
#          Static Web App, App Insights, Log Analytics.
# Deploys: compiled .NET functions and the Next.js dashboard.
azd up
```

> `azd up` = `azd provision` + `azd deploy` in one command.
> Re-run `azd deploy` (no re-provisioning) when you only change application code.

---

### Phase 3 — Post-deployment wiring (run after `azd up` succeeds)

```bash
# ── 3.0. Read actual resource names from azd outputs ─────────────────────────
# Bicep generates names with a deterministic suffix — read them back here.
eval "$(azd env get-values 2>/dev/null)"
# The following variables are now available:
#   FABRIC_BRIDGE_FUNCTION_APP_NAME  →  func-fabric-bridge-<suffix>
#   FABRIC_BRIDGE_SWA_URL            →  <random>.azurestaticapps.net
#   FABRIC_BRIDGE_KEY_VAULT_URI      →  https://kv-fabric-bridge-<suffix>.vault.azure.net/
#   AZURE_RESOURCE_GROUP             →  rg-<envName>
#   AZURE_LOCATION                   →  northeurope (or your chosen region)

RG="$AZURE_RESOURCE_GROUP"
FUNC_NAME="$FABRIC_BRIDGE_FUNCTION_APP_NAME"
KV_NAME=$(az keyvault list \
  --resource-group "$RG" \
  --query "[0].name" -o tsv)
SWA_NAME=$(az staticwebapp list \
  --resource-group "$RG" \
  --query "[0].name" -o tsv)
SWA_HOSTNAME=$(az staticwebapp show \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --query defaultHostname -o tsv)

echo "RG:       $RG"
echo "Func:     $FUNC_NAME"
echo "KV:       $KV_NAME"
echo "SWA:      $SWA_NAME"
echo "SWA URL:  https://$SWA_HOSTNAME"

# Restore IDs from Phase 1 if running in a fresh shell:
# TENANT_ID="<value from Phase 1>"
# DASHBOARD_APP_ID="<value from Phase 1>"
# DASHBOARD_SECRET="<value from Phase 1>"
# PBI_APP_ID="<value from Phase 1>"
# PBI_SECRET="<value from Phase 1>"

# ── 3.1. Grant deployer Key Vault Secrets Officer (to write secrets below) ────
CURRENT_USER_ID=$(az ad signed-in-user show --query id -o tsv)
KV_ID=$(az keyvault show \
  --name "$KV_NAME" \
  --resource-group "$RG" \
  --query id -o tsv)

if ! az role assignment list \
  --assignee "$CURRENT_USER_ID" \
  --role "Key Vault Secrets Officer" \
  --scope "$KV_ID" \
  --query "[0].id" -o tsv | grep -q "/"; then
  az role assignment create \
    --role "Key Vault Secrets Officer" \
    --assignee "$CURRENT_USER_ID" \
    --scope "$KV_ID"
  echo "✔ Key Vault Secrets Officer role assigned."
else
  echo "✔ Key Vault Secrets Officer role already assigned."
fi

# ── 3.2. Store the Power BI client secret in Key Vault (per-tenant) ──────────
# Secret name follows the convention: tenant-{tenantId}-client-secret
# where tenantId = "tenant-<customer-entra-guid>" (the Cosmos DB document ID).
# Run once per customer tenant onboarded.
CUSTOMER_ENTRA_ID="<customer-entra-guid>"   # replace per tenant
az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name "tenant-tenant-${CUSTOMER_ENTRA_ID}-client-secret" \
  --value "$PBI_SECRET"

# ── 3.3. Add the real SWA redirect URI to the Dashboard app registration ──────
az ad app update \
  --id "$DASHBOARD_APP_ID" \
  --web-redirect-uris \
    "https://${SWA_HOSTNAME}/.auth/login/aad/callback" \
    "http://localhost:3000/.auth/login/aad/callback"

# ── 3.4. Configure SWA Easy Auth ──────────────────────────────────────────────
az staticwebapp auth update \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --provider aad \
  --client-id "$DASHBOARD_APP_ID" \
  --client-secret "$DASHBOARD_SECRET" \
  --tenant-id "$TENANT_ID" \
  --openid-issuer "https://login.microsoftonline.com/${TENANT_ID}/v2.0"

# ── 3.5. Write local dev .env.local ───────────────────────────────────────────
cat > src/SemanticSonar.Web/.env.local <<EOF
NEXT_PUBLIC_MSAL_CLIENT_ID=${DASHBOARD_APP_ID}
NEXT_PUBLIC_MSAL_TENANT_ID=${TENANT_ID}
EOF
echo "✔ src/SemanticSonar.Web/.env.local written."
```

---

### Phase 4 — Verify everything is wired up

```bash
# Both app registrations exist
az ad app list \
  --filter "startsWith(displayName,'Semantic Sonar')" \
  --query "[].{Name:displayName, AppId:appId, Audience:signInAudience}" \
  --output table

# Function App settings — KEY_VAULT_URI and COSMOS_ACCOUNT_ENDPOINT
az functionapp config appsettings list \
  --name "$FUNC_NAME" \
  --resource-group "$RG" \
  --query "[?name=='KEY_VAULT_URI' || name=='COSMOS_ACCOUNT_ENDPOINT']" \
  --output table

# KV secret for a specific tenant is present and enabled
# Replace CUSTOMER_ENTRA_ID with the tenant GUID
az keyvault secret show \
  --vault-name "$KV_NAME" \
  --name "tenant-tenant-${CUSTOMER_ENTRA_ID}-client-secret" \
  --query "{Name:name, Enabled:attributes.enabled, Expires:attributes.expires}" \
  --output table

# Dashboard is reachable
echo "Dashboard URL: https://${SWA_HOSTNAME}"
```

---

### Phase 5 — Customer admin consent URLs

For each customer tenant, share the URL below with their **Global Administrator** or **Privileged Role Administrator**:

```bash
# Replace CUSTOMER_TENANT_ID with the customer's Entra tenant ID
CUSTOMER_TENANT_ID="<customer-tenant-id>"
echo "https://login.microsoftonline.com/${CUSTOMER_TENANT_ID}/adminconsent?client_id=${PBI_APP_ID}&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient"
```

Once the admin approves, the service principal is created in their tenant and the Function can acquire tokens for it.

---

### Suggested resource naming

> Bicep appends an 8-character suffix derived from `uniqueString(resourceGroup().id, environmentName)`. The names below show the prefix pattern — the actual deployed names will include the suffix.

| Resource | Name pattern | Notes |
|---|---|---|
| Resource group | `rg-<envName>` | Created by `azd up`; use `azd env set AZURE_RESOURCE_GROUP` to override |
| Static Web App | `swa-semantic-sonar-<suffix>` | Auto-named by Bicep |
| Function App | `func-fabric-sonar-<suffix>` | Auto-named by Bicep |
| Key Vault | `kv-fabric-sonar-<suffix>` | Max 24 chars |
| Cosmos DB account | `cosmos-fabric-sonar-<suffix>` | Auto-named by Bicep |
| Storage account | `stsemanticsonar<suffix>` | No hyphens; max 24 chars |
| App Insights | `appi-fabric-sonar-<suffix>` | Auto-named by Bicep |
| Log Analytics | `log-fabric-sonar-<suffix>` | Auto-named by Bicep |
| Dashboard app registration | `Semantic Sonar Dashboard` | Display name in Entra ID |
| Power BI app registration | `Semantic Sonar Power BI` | Display name in Entra ID |
| Dashboard client secret | `swa-easy-auth` | Description in Certificates & secrets |
| Power BI client secret | `powerbi-service` | Description in Certificates & secrets |
| KV secret name (per tenant) | `tenant-{tenantId}-client-secret` | e.g. `tenant-tenant-<guid>-client-secret` |

---

## Security Notes

- **Never** commit client secrets to source control — use Key Vault or environment variables
- Rotate both client secrets before expiry; set calendar reminders for 23 months after creation
- The Power BI service app has `Dataset.ReadWrite.All` — scope is intentionally broad to support any model; admin consent required per customer tenant
- SWA Easy Auth validates Entra ID tokens automatically; no token validation code is needed in the dashboard
- In local development, `AuthHelper.IsAuthenticated()` bypasses the `X-MS-CLIENT-PRINCIPAL` check (controlled by `AZURE_FUNCTIONS_ENVIRONMENT=Development`)
