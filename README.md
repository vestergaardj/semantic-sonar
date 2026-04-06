# Semantic Sonar

**Semantic Sonar** is a canary-monitoring platform for Power BI / Microsoft Fabric semantic models. It periodically executes lightweight DAX queries against customer-owned semantic models, records the latency and success status, and surfaces the results on a live dashboard. The system is designed to be multi-tenant from the ground up and runs entirely on Azure serverless infrastructure.

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [How it works](#how-it-works)
3. [Repository structure](#repository-structure)
4. [Azure infrastructure](#azure-infrastructure)
5. [Prerequisites](#prerequisites)
6. [Local development](#local-development)
7. [Deployment](#deployment)
8. [Post-deployment configuration](#post-deployment-configuration)
9. [REST API reference](#rest-api-reference)
10. [Data model](#data-model)
11. [Authentication & security](#authentication--security)
12. [Operational notes](#operational-notes)

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Azure Static Web App                      │
│   Next.js 15 (SSR/hybrid)  ──  /.auth/* Easy Auth (AAD)    │
│              ↕ /api/* proxied to Function App               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Azure Functions (v4, .NET 8)               │
│                                                             │
│  HTTP triggers          Timer trigger       Queue trigger   │
│  ┌─────────────┐       ┌─────────────┐    ┌─────────────┐  │
│  │ TenantsApi  │       │  Scheduler  │    │CanaryWorker │  │
│  │ ModelsApi   │       │(every 1 min)│    │  (per job)  │  │
│  │ ResultsApi  │       └──────┬──────┘    └──────┬──────┘  │
│  └─────────────┘              │ enqueue           │ write   │
└───────────────────────────────┼───────────────────┼─────────┘
                                │                   │
       ┌────────────────────────▼──┐    ┌───────────▼──────────┐
       │  Azure Storage Queue      │    │   Azure Cosmos DB     │
       │  "canary-jobs"            │    │   ├── tenants         │
       └───────────────────────────┘    │   ├── models          │
                                        │   └── results (90-day │
                                        │        TTL)           │
       ┌───────────────────────────┐    └──────────────────────┘
       │  Azure Key Vault          │
       │  secret: client-secret    │    ┌──────────────────────┐
       └───────────────────────────┘    │  Power BI REST API   │
                                        │  executeQueries       │
       ┌───────────────────────────┐    │  (per-tenant OAuth2) │
       │  Application Insights     │    └──────────────────────┘
       └───────────────────────────┘
```

---

## How it works

### Canary execution pipeline

1. **Scheduler** (timer trigger, every minute) — queries Cosmos DB for any active semantic model whose `nextRunTime ≤ now`. For each due model it:
   - Advances `nextRunTime` by `intervalMinutes` *before* enqueuing, preventing duplicate scheduling across scaled-out Function instances.
   - Pushes a lightweight `CanaryJob` message (modelId, tenantId) onto the `canary-jobs` Storage Queue.

2. **CanaryWorker** (queue trigger) — processes each `CanaryJob`:
   - Looks up the model and tenant from Cosmos DB.
   - Acquires an OAuth 2.0 bearer token for the *customer's* Entra tenant using the tenant's own app registration client ID (stored on the tenant document in Cosmos DB) and client secret (stored in Key Vault with the naming convention `tenant-{tenantId}-client-secret`, cached in-memory for 30 minutes).
   - Sends the configured DAX query to the Power BI `executeQueries` REST endpoint.
   - Records a `CanaryResult` in Cosmos DB: timestamp, success flag, latency (ms), row count, first-row payload (or error message).
   - Updates the model's `consecutiveFailureCount`. After **30 consecutive failures** the model is automatically disabled to prevent noise.

3. **Failure handling** — logical failures (bad DAX, permission denied) are swallowed and recorded. Infrastructure failures (Cosmos DB unreachable, Key Vault down) are re-thrown, triggering up to 3 automatic queue retries before the message is dead-lettered.

### Dashboard

The Next.js frontend calls the Function App's HTTP APIs (proxied through the Static Web App `/api/*` route) to display:
- Total / active / disabled / failing model counts.
- A recent-failures list and an at-risk models list (≥10 consecutive failures).
- Per-model latency charts (Recharts) and full result history.

---

## Repository structure

```
Semantic Sonar/
├── azure.yaml                         # Azure Developer CLI service definitions
├── Semantic Sonar.sln                  # Solution file
├── infra/
│   ├── main.bicep                     # Root Bicep template
│   └── modules/
│       ├── cosmos.bicep               # Cosmos DB account + database
│       ├── functions.bicep            # Function App + hosting plan
│       ├── keyvault.bicep             # Key Vault
│       ├── monitoring.bicep           # Log Analytics + Application Insights
│       ├── storage.bicep              # Storage account (queues + webjobs)
│       └── swa.bicep                  # Static Web App + backend link
└── src/
    ├── SemanticSonar.Functions/        # Azure Functions project (.NET 8 isolated)
    │   ├── Functions/
    │   │   ├── CanaryWorkerFunction.cs # Queue-triggered canary executor
    │   │   ├── ModelsApi.cs           # CRUD for SemanticModelConfig
    │   │   ├── ResultsApi.cs          # Read-only results & summary
    │   │   ├── SchedulerFunction.cs   # Timer-driven job scheduler
    │   │   └── TenantsApi.cs          # CRUD for TenantConfig
    │   ├── Helpers/
    │   │   └── AuthHelper.cs          # SWA Easy Auth validation
    │   ├── Models/
    │   │   ├── CanaryJob.cs           # Queue message DTO
    │   │   ├── CanaryResult.cs        # Cosmos DB result document
    │   │   ├── DashboardModels.cs     # Summary / chart DTOs
    │   │   ├── SemanticModelConfig.cs # Cosmos DB model document
    │   │   └── TenantConfig.cs        # Cosmos DB tenant document
    │   ├── Services/
    │   │   ├── CosmosDbService.cs     # All Cosmos DB read/write logic
    │   │   ├── KeyVaultService.cs     # Cached secret retrieval
    │   │   ├── PowerBiQueryService.cs # DAX execution via Power BI REST API
    │   │   └── QueueService.cs        # Storage Queue enqueue helper
    │   ├── host.json                  # Queue batch size, retry, encoding
    │   ├── local.settings.json        # Local dev configuration (not committed)
    │   └── Program.cs                 # DI wiring, credential setup
    └── SemanticSonar.Web/              # Next.js 15 frontend
        ├── app/
        │   ├── layout.tsx             # Shell nav, global metadata
        │   ├── page.tsx               # Dashboard home
        │   ├── api-test/page.tsx      # Interactive GET API test tool
        │   ├── models/                # Model list + detail pages
        │   └── tenants/               # Tenant list page
        ├── components/
        │   ├── LatencyChart.tsx       # Recharts latency over time
        │   ├── ModelCard.tsx          # Model summary card
        │   ├── SchedulePicker.tsx     # Interval selector component
        │   └── StatusBadge.tsx        # Active / disabled / failing badge
        ├── lib/
        │   ├── api.ts                 # Typed fetch wrappers for all endpoints
        │   ├── auth.ts                # MSAL browser auth helpers
        │   └── types.ts               # TypeScript interfaces matching C# models
        ├── next.config.ts             # standalone output, images unoptimized
        └── staticwebapp.config.json   # Route rules, Easy Auth redirect, CSP headers
```

---

## Azure infrastructure

All infrastructure is declared as Bicep and deployed via the Azure Developer CLI (`azd`).

| Resource | SKU | Purpose |
|---|---|---|
| Azure Static Web App | Standard | Hosts the Next.js frontend; proxies `/api/*` to the Function App; provides Easy Auth (AAD) |
| Azure Functions | Consumption (Y1, Linux) | Runs all backend logic |
| Azure Cosmos DB | Serverless | Stores tenants, models, and results |
| Azure Storage Account | LRS | Storage Queue for canary jobs; webjobs storage for Functions |
| Azure Key Vault | Standard | Stores per-tenant app registration client secrets (`tenant-{id}-client-secret`) |
| Log Analytics + Application Insights | Pay-as-you-go | Distributed tracing and live metrics |

Cosmos DB containers and their partition keys:

| Container | Partition key | TTL |
|---|---|---|
| `tenants` | `/id` | None |
| `models` | `/tenantId` | None |
| `results` | `/modelId` | 90 days (per-item) |

The `models` container has a composite index on `(isActive ASC, nextRunTime ASC)` to efficiently support the scheduler's due-model query.

---

## Prerequisites

### Common

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) ≥ 2.58
- [Azure Developer CLI (`azd`)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) ≥ 1.9
- An Azure subscription

### Backend

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (Storage Queue emulator for local dev)

### Frontend

- Node.js ≥ 20 LTS
- npm ≥ 10

### Per-tenant app registration

Each customer tenant requires its own Entra ID app registration (or a shared multi-tenant app that has been consented in each customer tenant). The **client ID** is stored on the tenant document in Cosmos DB, and the **client secret** is stored in Azure Key Vault. See [Post-deployment configuration](#post-deployment-configuration) for detailed setup steps.

---

## Local development

### 1. Clone and install

```bash
git clone <repo-url>
cd "Semantic Sonar"

# Frontend dependencies
cd src/SemanticSonar.Web
npm install
```

### 2. Configure the Functions app

Copy and populate `local.settings.json` (already present; never committed):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "AZURE_FUNCTIONS_ENVIRONMENT": "Development",
    "KEY_VAULT_URI": "https://<your-keyvault>.vault.azure.net/",
    "COSMOS_CONNECTION_STRING": "AccountEndpoint=https://<cosmos>.documents.azure.com:443/;AccountKey=<key>",
    "COSMOS_DATABASE_NAME": "FabricSonar"
  }
}
```

> **Tip:** When `AZURE_FUNCTIONS_ENVIRONMENT` is `Development`, the `AuthHelper` bypasses the Easy-Auth header check, so the APIs are accessible without a deployed SWA.

### 3. Start the Storage emulator

```bash
# Using Azurite via npx
npx azurite --silent --location .azurite --debug .azurite/debug.log
```

### 4. Start the Function App

```bash
cd src/SemanticSonar.Functions
func start
# Listens on http://localhost:7071
```

### 5. Start the Next.js dev server

In a separate terminal:

```bash
cd src/SemanticSonar.Web
# Point the frontend at the local Function App
NEXT_PUBLIC_API_URL=http://localhost:7071/api npm run dev
# Listens on http://localhost:3000
```

### 6. Test the APIs

Open **http://localhost:3000/api-test** to use the built-in API test page, or call the Functions directly:

```bash
# List all tenants
curl http://localhost:7071/api/tenants

# Get dashboard summary
curl http://localhost:7071/api/summary
```

---

## Deployment

Semantic Sonar uses the Azure Developer CLI for a single-command deploy.

### First-time setup

```bash
# Log in
azd auth login

# Initialise (only needed once)
azd init

# Provision infrastructure + deploy code
azd up
```

`azd up` does the following in order:
1. Runs the `preprovision` hook (a no-op greeting message).
2. Deploys `infra/main.bicep` to a resource group.
3. Builds and publishes the Function App (`src/SemanticSonar.Functions`).
4. Builds and publishes the Next.js app to the Static Web App (`src/SemanticSonar.Web`).

### Subsequent deployments

```bash
# Redeploy everything
azd deploy

# Redeploy only the API
azd deploy api

# Redeploy only the frontend
azd deploy web
```

### Region notes

The Bicep template uses separate `location` parameters for resources that are not available in all regions:

| Parameter | Default | Affected resources |
|---|---|---|
| `location` | Resource group location | Cosmos DB, Storage |
| `monitoringLocation` | `northeurope` | Log Analytics, App Insights |
| `functionsLocation` | `northeurope` | Function App, hosting plan |
| `swaLocation` | `westeurope` | Static Web App |

Override at deploy time:
```bash
azd up --parameter swaLocation=eastus2
```

---

## Post-deployment configuration

### 1. Create an app registration for each customer tenant

You need one Entra ID app registration per customer tenant (or a single multi-tenant app registration that each customer grants admin consent to). For each registration:

1. In the [Azure Portal](https://portal.azure.com) go to **Entra ID → App registrations → New registration**.
2. Choose the appropriate **Supported account types**:
   - *Single tenant* — if you create a dedicated registration in each customer's Entra directory.
   - *Multi-tenant* — if you share one registration and have each customer grant admin consent.
3. Note the **Application (client) ID** — you will enter this in the Semantic Sonar tenant form.
4. Under **Certificates & secrets → Client secrets**, create a new secret and note its value.
5. Under **API permissions**, add:
   - `Dataset.Read.All` (Power BI Service — application permission is required for daemon flows).
   - Grant **admin consent** in the tenant.

> **Example:** You create an app registration in `contoso.onmicrosoft.com` and get client ID `aabbccdd-1234-5678-abcd-112233445566`. You create a client secret with value `s3cr3t~abc...`.

### 2. Register the tenant in Semantic Sonar

Add the tenant via the **Tenants** page in the dashboard, or directly via the API:

```bash
curl -X POST https://<swa-hostname>/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Contoso",
    "entraId": "11111111-2222-3333-4444-555555555555",
    "clientId": "aabbccdd-1234-5678-abcd-112233445566"
  }'
```

This creates a tenant document in Cosmos DB with ID `tenant-11111111-2222-3333-4444-555555555555`.

### 3. Store the client secret in Key Vault

Each tenant's client secret is stored in Azure Key Vault using the naming convention:

```
tenant-{tenantId}-client-secret
```

where `{tenantId}` is the full Cosmos document ID (e.g. `tenant-11111111-2222-3333-4444-555555555555`).

```bash
# Store the client secret for the Contoso tenant
az keyvault secret set \
  --vault-name kv-semantic-sonar-dev \
  --name "tenant-tenant-11111111-2222-3333-4444-555555555555-client-secret" \
  --value "s3cr3t~abc..."
```

At runtime, `KeyVaultService.GetTenantClientSecretAsync(tenantId)` fetches this secret and caches it in-memory for 30 minutes.

> **Tip:** You can list all tenant secrets in your vault with:
> ```bash
> az keyvault secret list --vault-name kv-semantic-sonar-dev \
>   --query "[?starts_with(name, 'tenant-')].{name:name, enabled:attributes.enabled}" -o table
> ```

### 4. Configure Easy Auth on the Static Web App

In the Portal, navigate to the Static Web App → **Authentication** → add an identity provider (**Microsoft / Entra ID**). This activates the `/.auth/login/aad` flow defined in `staticwebapp.config.json`.

### 5. Grant the Function App Managed Identity access to Azure resources

The Bicep modules create the resources but do not automatically assign RBAC roles (to avoid requiring Owner permissions during deployment). Assign these roles manually or add them to the Bicep:

| Resource | Role | Assignee |
|---|---|---|
| Cosmos DB account | Cosmos DB Built-in Data Contributor | Function App managed identity |
| Storage account | Storage Queue Data Contributor | Function App managed identity |
| Key Vault | Key Vault Secrets User | Function App managed identity |

```bash
# Get the Function App's managed identity principal ID
FUNC_PRINCIPAL=$(az functionapp identity show \
  --name func-semantic-sonar-mb43627h \
  --resource-group semantic-sonar \
  --query principalId -o tsv)

# Cosmos DB — Built-in Data Contributor
az cosmosdb sql role assignment create \
  --account-name cosmos-semantic-sonar-mb43627h \
  --resource-group semantic-sonar \
  --role-definition-id 00000000-0000-0000-0000-000000000002 \
  --principal-id $FUNC_PRINCIPAL \
  --scope "/"

# Storage — Queue Data Contributor
STORAGE_ID=$(az storage account show \
  --name stfabricsonarmb43627h \
  --resource-group semantic-sonar \
  --query id -o tsv)
az role assignment create \
  --role "Storage Queue Data Contributor" \
  --assignee-object-id $FUNC_PRINCIPAL \
  --scope $STORAGE_ID

# Key Vault — Secrets User
KV_ID=$(az keyvault show \
  --name kv-semantic-sonar-dev \
  --resource-group semantic-sonar \
  --query id -o tsv)
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee-object-id $FUNC_PRINCIPAL \
  --scope $KV_ID
```

### 6. Add semantic models to monitor

Once a tenant is registered and its Key Vault secret is stored, add models via the **Models** page or the API:

```bash
curl -X POST https://<swa-hostname>/api/models \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-11111111-2222-3333-4444-555555555555",
    "workspaceId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "datasetId": "ffffffff-0000-1111-2222-333333333333",
    "displayName": "Sales Model – Prod",
    "daxQuery": "EVALUATE ROW(\\"Rows\\", COUNTROWS(Sales))",
    "intervalMinutes": 60
  }'
```

The scheduler will pick it up within 1 minute and start running canary queries.

### 7. Grant admin consent (multi-tenant app registrations)

If you use a **multi-tenant** app registration, each customer's Entra admin must grant consent:

```
https://login.microsoftonline.com/<customer-tenant-id>/adminconsent?client_id=<client-id>
```

### Complete onboarding checklist

| Step | Where | What |
|---|---|---|
| 1 | Entra ID (customer tenant) | Create app registration, note client ID |
| 2 | Entra ID (customer tenant) | Create client secret, note value |
| 3 | Entra ID (customer tenant) | Add `Dataset.Read.All` permission, grant admin consent |
| 4 | Semantic Sonar UI / API | Create tenant with `displayName`, `entraId`, and `clientId` |
| 5 | Azure Key Vault | Store secret as `tenant-{tenantId}-client-secret` |
| 6 | Semantic Sonar UI / API | Add semantic models to monitor |

---

## REST API reference

All endpoints are prefixed `/api`. In production they are only accessible through the Static Web App proxy to authenticated users. The `Authorization` check relies on the `X-MS-CLIENT-PRINCIPAL` header injected by Easy Auth.

### Tenants

| Method | Path | Description |
|---|---|---|
| `GET` | `/tenants` | List all tenants |
| `GET` | `/tenants/{id}` | Get a tenant by ID |
| `POST` | `/tenants` | Create a tenant |
| `PUT` | `/tenants/{id}` | Update a tenant |
| `DELETE` | `/tenants/{id}` | Delete a tenant |

**Create body:**
```json
{
  "displayName": "Contoso",
  "entraId": "11111111-2222-3333-4444-555555555555",
  "clientId": "aabbccdd-1234-5678-abcd-112233445566"
}
```

**Update body** (all fields optional — only provided fields are updated):
```json
{
  "displayName": "Contoso Ltd",
  "clientId": "aabbccdd-1234-5678-abcd-112233445566",
  "isActive": false
}
```

### Models

| Method | Path | Query params | Description |
|---|---|---|---|
| `GET` | `/models` | `tenantId` (optional) | List all models, optionally filtered by tenant |
| `GET` | `/models/{id}` | `tenantId` (required) | Get a model by ID |
| `POST` | `/models` | — | Create a model |
| `PUT` | `/models/{id}` | — | Update a model |
| `DELETE` | `/models/{id}` | `tenantId` (required) | Delete a model |

**Create body:**
```json
{
  "tenantId": "tenant-<entra-guid>",
  "workspaceId": "<power-bi-workspace-guid>",
  "datasetId": "<power-bi-dataset-guid>",
  "displayName": "Sales Model – Prod",
  "daxQuery": "EVALUATE ROW(\"Rows\", COUNTROWS(Sales))",
  "intervalMinutes": 60
}
```

`intervalMinutes` must be between **60** (1 hour) and **43200** (30 days).

### Results

| Method | Path | Query params | Description |
|---|---|---|---|
| `GET` | `/results` | `modelId` (required), `limit` (1–200, default 50) | List canary results for a model |
| `GET` | `/summary` | — | Dashboard summary (totals, recent failures, at-risk models) |

### Interactive API test page

Navigate to `/api-test` in the dashboard to test all GET endpoints interactively from a browser. Each endpoint card lets you fill in the required parameters, hit **Run**, and inspect the raw JSON response.

---

## Data model

### TenantConfig

```typescript
{
  id: string;           // "tenant-{entraId.toLowerCase()}"
  displayName: string;
  entraId: string;      // Customer's Entra tenant GUID
  clientId: string;     // App registration client ID (GUID) — used to acquire Power BI tokens
  isActive: boolean;
  addedAt: string;      // ISO 8601 UTC
}
```

### SemanticModelConfig

```typescript
{
  id: string;                     // UUID
  tenantId: string;               // references TenantConfig.id (partition key)
  workspaceId: string;            // Power BI workspace GUID
  datasetId: string;              // Power BI dataset/semantic model GUID
  displayName: string;
  daxQuery: string;               // DAX query to execute
  intervalMinutes: number;        // 60 – 43200
  nextRunTime: string;            // ISO 8601 UTC — when the scheduler fires next
  isActive: boolean;              // false = scheduler skips; auto-disabled after 30 failures
  consecutiveFailureCount: number;
  createdAt: string;
  lastRunAt?: string;
  lastRunSuccess?: boolean;
}
```

### CanaryResult

```typescript
{
  id: string;            // UUID
  modelId: string;       // partition key
  tenantId: string;
  executedAt: string;    // ISO 8601 UTC
  success: boolean;
  latencyMs: number;     // wall-clock time for the DAX call
  rowCount?: number;
  firstRowJson?: string; // JSON of the first returned row
  errorMessage?: string;
  ttl: number;           // 7776000 (90 days) — Cosmos DB auto-deletes after this
}
```

### DashboardSummary

```typescript
{
  totalModels: number;
  activeModels: number;
  disabledModels: number;
  failingModels: number;        // models with lastRunSuccess = false
  recentFailures: {
    modelId: string;
    modelName: string;
    tenantId: string;
    failedAt: string;
    errorMessage?: string;
    latencyMs: number;
  }[];
  atRiskModels: {
    modelId: string;
    modelName: string;
    tenantId: string;
    consecutiveFailureCount: number; // ≥ 10
  }[];
}
```

---

## Authentication & security

### Frontend authentication

The Static Web App uses **Easy Auth** with Azure AD as the identity provider. All routes except `/.auth/*` require the `authenticated` role (`staticwebapp.config.json`). Unauthenticated requests are automatically redirected to the AAD login page.

### Backend authentication

Each HTTP-triggered function calls `AuthHelper.IsAuthenticated()`, which validates that the `X-MS-CLIENT-PRINCIPAL` header (injected by Easy Auth) is present. This is a defence-in-depth measure — in production the SWA layer already blocks unauthenticated requests before they reach the Function App.

In **local development** (`AZURE_FUNCTIONS_ENVIRONMENT = Development`) the check is skipped to allow testing without a deployed SWA.

### Infrastructure security

- The Function App uses a **system-assigned Managed Identity** for all Azure service access (Cosmos DB, Storage, Key Vault). No connection strings or keys are stored in app settings in production.
- The multi-tenant app registration client secret is stored exclusively in **Azure Key Vault** and fetched at runtime, cached in-memory for 30 minutes.
- HTTP responses include `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, and `Strict-Transport-Security` headers (set in `staticwebapp.config.json`).
- The Function App is configured with `httpsOnly: true`.

### Token acquisition for Power BI

The `PowerBiQueryService` acquires tokens per-tenant using `ClientSecretCredential`:

1. **Client ID** — read from `tenant.ClientId` (stored in Cosmos DB on the tenant document).
2. **Client Secret** — fetched from Key Vault via `KeyVaultService.GetTenantClientSecretAsync(tenantId)`, which looks up the secret named `tenant-{tenantId}-client-secret`. The secret value is cached in-memory for 30 minutes to avoid Key Vault throttling.
3. **Tenant ID** — the customer's `entraId` from the tenant document, used as the `authority` for the token request.

The resulting token (scoped to `https://analysis.windows.net/powerbi/api/.default`) is cached per-tenant with a 5-minute expiry buffer to avoid repeated AAD round-trips under high load.

---

## Operational notes

### Queue configuration (`host.json`)

| Setting | Value | Meaning |
|---|---|---|
| `batchSize` | 16 | Up to 16 canary jobs processed concurrently per instance |
| `maxDequeueCount` | 3 | A job is dead-lettered after 3 infrastructure failures |
| `visibilityTimeout` | 90 seconds | Message becomes visible again if the worker crashes mid-execution |
| `messageEncoding` | base64 | Required by the Azure.Storage.Queues SDK default |

### Cosmos DB throughput

The deployment uses the **serverless** tier, which is pay-per-request with no minimum. For high model counts (>500) or polling intervals < 5 minutes, consider switching to provisioned throughput to avoid rate-limiting and the associated retry latency.

The `CosmosClient` is configured with:
- `ConnectionMode.Direct` for lower latency in production.
- Up to 9 automatic retries on HTTP 429 (rate limited), wait up to 30 seconds.
- Camel-case JSON serialisation to match the `[JsonPropertyName]` annotations on models.

### Result retention

`CanaryResult` documents have a `ttl` field of `7776000` (90 days). The Cosmos DB `results` container is created with `defaultTtl = -1` (TTL enabled; no default expiry). Expired documents are automatically deleted by Cosmos DB without user intervention.

### Scaling

The Consumption-plan Function App scales horizontally based on queue depth. The Scheduler writes a small pessimistic timestamp update before enqueuing (not after), which eliminates the most common double-scheduling window when two instances fire simultaneously. A rare duplicate execution is possible only if the process crashes between the Cosmos write and the queue enqueue — this is an acceptable trade-off for a monitoring workload.

### Monitoring

Application Insights is connected via `APPLICATIONINSIGHTS_CONNECTION_STRING`. Request sampling is enabled (all non-request telemetry is sampled; requests are excluded from sampling to ensure 100% request visibility). Live Metrics is enabled for real-time debugging.
