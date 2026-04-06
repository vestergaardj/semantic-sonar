# Managed Identities for Inter-Service Communication

This document describes how Semantic Sonar uses Azure Managed Identities for service-to-service authentication and the steps required to configure them.

## Architecture Overview

```
┌──────────────┐   Easy Auth header   ┌──────────────────────┐
│  Azure SWA   │ ──────────────────── │   Azure Functions    │
│  (Frontend)  │  X-MS-CLIENT-PRINCIPAL│  (System MI enabled) │
└──────────────┘                      └──────────┬───────────┘
                                                  │
                                    DefaultAzureCredential
                                                  │
                      ┌───────────┬───────────────┼───────────────┐
                      ▼           ▼               ▼               ▼
               ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐
               │  Cosmos DB │ │ Key Vault│ │  Storage  │ │ Power BI API │
               │   (RBAC)   │ │  (RBAC)  │ │  (RBAC)   │ │  (see below) │
               └────────────┘ └──────────┘ └───────────┘ └──────────────┘
```

## Current State

| Communication Path | Auth Method | Identity Used |
|---|---|---|
| SWA → Functions API | SWA Easy Auth (header-based) | User identity via Entra ID OIDC |
| Functions → Cosmos DB | **Managed Identity (RBAC)** | System-assigned MI |
| Functions → Key Vault | **Managed Identity (RBAC)** | System-assigned MI |
| Functions → Storage Queue | **Managed Identity (RBAC)** | System-assigned MI |
| Functions → Power BI API | `ClientSecretCredential` (per-tenant) | Service principal (app registration) |

**Summary:** All Azure-resource communication already uses Managed Identity. The only exception is the Power BI API, which requires a multi-tenant service principal with a client secret — this is a Power BI platform limitation (see [Power BI Exception](#power-bi-api-exception) below).

---

## How It Works

### 1. System-Assigned Managed Identity

The Function App has a system-assigned managed identity enabled via Bicep:

```bicep
// infra/modules/functions.bicep
resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  ...
  identity: {
    type: 'SystemAssigned'
  }
}
```

When deployed, Azure automatically provisions a service principal in Entra ID tied to the Function App's lifecycle. No credentials to manage or rotate.

### 2. DefaultAzureCredential in Code

`Program.cs` uses `DefaultAzureCredential` as the single credential source:

```csharp
var credential = new DefaultAzureCredential();
```

This automatically resolves to:
- **In Azure:** The Function App's system-assigned managed identity
- **Locally:** Azure CLI credentials, Visual Studio credentials, or environment variables

All SDK clients accept this credential object (Cosmos, Key Vault, Storage, etc.).

---

## RBAC Role Assignments

Each downstream service requires a specific RBAC role assigned to the Function App's managed identity.

### Cosmos DB

| Role | ID | Scope |
|---|---|---|
| Cosmos DB Built-in Data Contributor | `00000000-0000-0000-0000-000000000002` | Cosmos DB account |

Assigned via Cosmos DB's native SQL role definition system (not standard Azure RBAC):

```bicep
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, functionApp.id, '00000000-0000-0000-0000-000000000002')
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: functionApp.identity.principalId
    scope: cosmosAccount.id
  }
}
```

> **Note:** Cosmos DB uses its own RBAC system, not Azure Resource Manager RBAC. The `disableLocalAuth: true` setting enforces identity-only access (no connection strings).

### Key Vault

| Role | ID | Scope |
|---|---|---|
| Key Vault Secrets User | `4633458b-17de-408a-b874-0445c86b69e6` | Key Vault resource |

```bicep
resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, functionApp.id, '4633458b-17de-408a-b874-0445c86b69e6')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

> Key Vault is configured with `enableRbacAuthorization: true` — no access policies needed.

### Storage Account (Queues)

| Role | ID | Scope |
|---|---|---|
| Storage Queue Data Contributor | `974c5e8b-45b9-4653-ba55-5f855dd0fb88` | Storage account |
| Storage Blob Data Owner | `b7e6dc6d-f1e8-4753-8033-0f276bb0955b` | Storage account (deployment) |

```bicep
resource storageQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccount.id, functionApp.id, '974c5e8b-45b9-4653-ba55-5f855dd0fb88')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

---

## Service Configuration (Environment Variables)

Managed identity access uses **endpoints** instead of connection strings:

| Variable | Example Value | Used By |
|---|---|---|
| `COSMOS_ACCOUNT_ENDPOINT` | `https://fb-cosmos-xxx.documents.azure.com:443/` | CosmosDbService |
| `KEY_VAULT_URI` | `https://fb-kv-xxx.vault.azure.net/` | KeyVaultService |
| `STORAGE_ACCOUNT_NAME` | `fbstorexxx` | QueueService |

The code falls back to connection strings for local development when these aren't set:

```csharp
// Cosmos DB — endpoint = MI, connection string = local dev
if (!string.IsNullOrEmpty(cosmosEndpoint))
    services.AddSingleton(new CosmosClient(cosmosEndpoint, credential));
else
    services.AddSingleton(new CosmosClient(connectionString));

// Storage Queue — account name = MI, AzureWebJobsStorage = local dev
if (!string.IsNullOrEmpty(storageAccountName))
    services.AddSingleton(new QueueServiceClient(new Uri($"https://{storageAccountName}.queue.core.windows.net"), credential));
```

---

## Power BI API Exception

The Power BI / Fabric REST API **does not support managed identities** for data-plane operations (executing DAX queries, refreshing datasets, etc.). This requires:

1. A **multi-tenant Entra app registration** with `Tenant.Read.All` / `Dataset.Read.All` permissions
2. A **client secret** stored in Key Vault
3. Per-tenant `ClientSecretCredential` to acquire tokens

```
Functions → Key Vault (MI) → retrieve client secret → ClientSecretCredential → Power BI API
```

The managed identity still secures the first hop (retrieving the secret from Key Vault). The client secret is never stored in app settings or code.

> **Future:** If Microsoft adds managed identity support for Power BI service principal profiles, this path can be migrated to identity-based auth entirely.

---

## Steps to Set Up Managed Identities

### Prerequisites
- Azure subscription with Owner or User Access Administrator role
- Azure CLI installed (`az login`)
- Bicep CLI or Azure deployment tooling

### Step 1: Deploy Infrastructure with `azd up`

The Bicep templates already configure everything. Running `azd up` will:

1. Create the Function App with `identity.type: 'SystemAssigned'`
2. Create downstream resources (Cosmos, Key Vault, Storage) with identity-only settings
3. Assign all RBAC roles to the Function App's managed identity principal
4. Set endpoint-based environment variables on the Function App

```bash
azd up
```

No manual steps needed — the Bicep modules handle the full chain.

### Step 2: Verify Role Assignments

After deployment, verify the role assignments:

```bash
# Get the Function App's principal ID
PRINCIPAL_ID=$(az functionapp identity show \
  --name <function-app-name> \
  --resource-group <rg-name> \
  --query principalId -o tsv)

# Check Azure RBAC assignments
az role assignment list \
  --assignee $PRINCIPAL_ID \
  --output table

# Check Cosmos DB SQL role assignments
az cosmosdb sql role assignment list \
  --account-name <cosmos-account> \
  --resource-group <rg-name> \
  --output table
```

### Step 3: Verify No Connection Strings in Production

Confirm the Function App uses endpoint-based settings:

```bash
az functionapp config appsettings list \
  --name <function-app-name> \
  --resource-group <rg-name> \
  --query "[?contains(name, 'COSMOS') || contains(name, 'KEY_VAULT') || contains(name, 'STORAGE')]" \
  --output table
```

Expected: `COSMOS_ACCOUNT_ENDPOINT`, `KEY_VAULT_URI`, `STORAGE_ACCOUNT_NAME` — no `_CONNECTION_STRING` or `_KEY` values.

### Step 4: Store the Power BI Client Secret in Key Vault

```bash
az keyvault secret set \
  --vault-name <vault-name> \
  --name "SemanticSonarClientSecret" \
  --value "<your-client-secret>"
```

The Function App retrieves this at runtime via managed identity — it never appears in app settings.

---

## Local Development

Locally, `DefaultAzureCredential` falls back to developer credentials:

1. **Azure CLI:** Run `az login` before starting the Function App
2. **Visual Studio:** Signed-in account is used automatically
3. **Environment Variables:** Set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` for a dev service principal

For Cosmos DB and Storage, the code falls back to connection strings via `local.settings.json`:

```json
{
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "COSMOS_CONNECTION_STRING": "AccountEndpoint=https://...;AccountKey=..."
  }
}
```

> **Tip:** To test managed identity locally against real Azure resources, use `az login` and set the endpoint-based environment variables instead of connection strings.

---

## Adding a New Service with Managed Identity

If you add a new Azure service to Semantic Sonar:

1. **Bicep:** Add a role assignment from `functionApp.identity.principalId` to the new resource with the appropriate built-in role
2. **App Settings:** Add an endpoint/URI variable (not a connection string)
3. **Program.cs:** Pass `DefaultAzureCredential` to the new SDK client
4. **Service class:** Accept the SDK client via dependency injection
5. **Local fallback:** Add a connection-string fallback path in `Program.cs` for local dev

---

## Security Benefits

| Benefit | Description |
|---|---|
| **No secrets to rotate** | Managed identity tokens are issued and rotated by Azure automatically |
| **No secrets in config** | Endpoints only — no connection strings or keys in app settings |
| **Least privilege** | Each role is scoped to the specific resource, not the subscription |
| **Audit trail** | All identity-based access is logged in Entra ID and resource diagnostic logs |
| **Lifecycle-bound** | System-assigned MI is deleted when the Function App is deleted |
