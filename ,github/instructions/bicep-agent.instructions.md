# Bicep Agent Instructions

**Trigger**: Any file in `infra/**`, files ending in `.bicep` or `.bicepparam`, or tasks that provision Azure resources.

---

## Project Infra Structure

```
infra/
├── main.bicep               # Entry point — orchestrates all modules
├── main.bicepparam          # Parameter file (per environment)
├── modules/
│   ├── cosmos.bicep         # Cosmos DB account + databases + containers
│   ├── functionapp.bicep    # Azure Functions + App Service Plan
│   ├── keyvault.bicep       # Key Vault + secrets
│   ├── staticwebapp.bicep   # Next.js Static Web App or App Service
│   └── monitoring.bicep     # App Insights + Log Analytics
└── shared/
    └── naming.bicep         # Naming convention module (use this, don't invent names)
```

---

## Naming Convention

All resource names **must** go through `naming.bicep`. Never hardcode resource names.

```bicep
module names 'shared/naming.bicep' = {
  name: 'naming'
  params: {
    environment: environment      // 'dev' | 'staging' | 'prod'
    workload: 'myapp'
    location: location
  }
}

// Then use: names.outputs.cosmosAccountName, names.outputs.functionAppName, etc.
```

**Pattern**: `{workload}-{resource-type}-{environment}-{region-short}`
Example: `myapp-cosmos-dev-we` (West Europe = `we`)

---

## Cosmos DB Module Rules

When adding or modifying containers in `modules/cosmos.bicep`:

```bicep
resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: ['/partitionKey']   // Always explicit — never use /id as partition key
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [{ path: '/*' }]
        excludedPaths: [
          { path: '/_etag/?' }
          // Exclude high-cardinality fields not used in queries:
          { path: '/largeTextField/?' }
        ]
      }
      defaultTtl: -1               // Set explicitly; -1 = off, 0 = use item TTL
    }
    options: {
      autoscaleSettings: {
        maxThroughput: 4000         // Start with autoscale, not manual RUs
      }
    }
  }
}
```

**Always output the container name** so API agent can reference it:
```bicep
output containerName string = container.name
```

---

## Key Vault — Secrets Pattern

Never put connection strings in app settings directly. Use Key Vault references:

```bicep
// Store secret in Key Vault
resource cosmosSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'cosmos-connection-string'
  properties: {
    value: cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
  }
}

// Reference in Function App settings
{
  name: 'COSMOS_CONNECTION_STRING'
  value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=cosmos-connection-string)'
}
```

---

## Outputs Contract

`main.bicep` must always output these for CI/CD and env-contract alignment:

```bicep
output functionAppName string = functionApp.outputs.name
output staticWebAppName string = staticWebApp.outputs.name
output cosmosAccountName string = cosmos.outputs.accountName
output keyVaultName string = keyVault.outputs.name
output appInsightsConnectionString string = monitoring.outputs.connectionString
```

---

## Validation Rules

Before committing Bicep changes:
- Run `az bicep build --file infra/main.bicep` — zero errors required
- Run `az deployment sub what-if` against dev to check planned changes
- Never use `apiVersion` older than 2 years — check [aka.ms/bicep-types](https://aka.ms/bicep-types)
- All modules must have a `tags` parameter that propagates `{ environment, workload, managedBy: 'bicep' }`

---

## Do Not

- ❌ Hardcode resource names
- ❌ Use `listKeys()` outputs in `outputs` (secrets leak into deployment history)
- ❌ Set `publicNetworkAccess: 'Enabled'` on Cosmos without explicit approval
- ❌ Use manual throughput (RU/s) — always use autoscale for new containers
- ❌ Skip the `dependsOn` when a module genuinely depends on another resource existing
