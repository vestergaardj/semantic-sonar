targetScope = 'resourceGroup'

@minLength(1)
@maxLength(64)
@description('Name of the environment (e.g. dev, prod)')
param environmentName string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Region for Log Analytics / App Insights (not all regions support these)')
param monitoringLocation string = 'northeurope'

@description('Region for Azure Functions (Consumption plan not available in all regions)')
param functionsLocation string = 'northeurope'

@description('Region for Static Web App (only available in westus2, centralus, eastus2, westeurope, eastasia)')
param swaLocation string = 'westeurope'

@description('Entra tenant ID that is allowed to log in to this application')
param allowedTenantId string

@description('AAD app registration client ID used by SWA Easy Auth (Semantic Sonar Dashboard app)')
param aadClientId string

var suffix = take(uniqueString(resourceGroup().id, environmentName), 8)
var tags = { 'azd-env-name': environmentName, application: 'semantic-sonar' }

// ── Monitoring ────────────────────────────────────────────────────────────────
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: monitoringLocation
    suffix: suffix
    tags: tags
  }
}

// ── Storage ───────────────────────────────────────────────────────────────────
module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    suffix: suffix
    tags: tags
  }
}

// ── Cosmos DB ─────────────────────────────────────────────────────────────────
module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  params: {
    location: location
    suffix: suffix
    tags: tags
  }
}

// ── Key Vault ─────────────────────────────────────────────────────────────────
module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    suffix: suffix
    tags: tags
  }
}

// ── Functions ─────────────────────────────────────────────────────────────────
module functions 'modules/functions.bicep' = {
  name: 'functions'
  params: {
    location: functionsLocation
    suffix: suffix
    tags: tags
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    storageAccountName: storage.outputs.storageAccountName
    storageConnectionString: storage.outputs.storageConnectionString
    cosmosAccountName: cosmos.outputs.cosmosAccountName
    cosmosDatabaseName: cosmos.outputs.cosmosDatabaseName
    keyVaultUri: keyvault.outputs.keyVaultUri
    allowedTenantId: allowedTenantId
  }
}

// ── Static Web App ────────────────────────────────────────────────────────────
module swa 'modules/swa.bicep' = {
  name: 'swa'
  params: {
    location: swaLocation
    suffix: suffix
    tags: tags
    functionAppResourceId: functions.outputs.functionAppResourceId
    backendRegion: functionsLocation
    aadClientId: aadClientId
    allowedTenantId: allowedTenantId
  }
}

// ── Role assignments (Managed Identity → dependent resources) ─────────────────

// Key Vault Secrets User
resource kvSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, suffix, 'kvSecretsUser')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: functions.outputs.functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Cosmos DB Built-in Data Contributor
resource existingCosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' existing = {
  name: 'cosmos-fabric-sonar-${suffix}'
}

resource cosmosDataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-02-15-preview' = {
  parent: existingCosmosAccount
  name: guid(resourceGroup().id, suffix, 'cosmosDataContributor')
  properties: {
    roleDefinitionId: '${existingCosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002' // Built-in Data Contributor
    principalId: functions.outputs.functionAppPrincipalId
    scope: existingCosmosAccount.id
  }
}

// Storage Queue Data Contributor (for scheduler → queue enqueue)
resource storageQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, suffix, 'storageQueueContributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88') // Storage Queue Data Contributor
    principalId: functions.outputs.functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Blob Data Owner (for Functions host storage via Managed Identity)
resource storageBlobOwnerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, suffix, 'storageBlobOwner')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b') // Storage Blob Data Owner
    principalId: functions.outputs.functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output AZURE_LOCATION string = location
output FABRIC_SONAR_FUNCTION_APP_NAME string = functions.outputs.functionAppName
output FABRIC_SONAR_SWA_URL string = swa.outputs.swaDefaultHostname
output FABRIC_SONAR_KEY_VAULT_URI string = keyvault.outputs.keyVaultUri
output FABRIC_SONAR_COSMOS_ACCOUNT string = cosmos.outputs.cosmosAccountName
