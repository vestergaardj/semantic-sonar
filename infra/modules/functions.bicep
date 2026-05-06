param location string
param suffix string
param tags object
param appInsightsConnectionString string
param storageAccountName string
@secure()
param storageConnectionString string
param cosmosAccountName string
param cosmosDatabaseName string
param keyVaultUri string
param allowedTenantId string

resource hostingPlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-fabric-sonar-${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: true // Linux
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: 'func-fabric-sonar-${suffix}'
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNET-ISOLATED|8.0'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: storageConnectionString }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'dotnet-isolated' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'KEY_VAULT_URI', value: keyVaultUri }
        { name: 'COSMOS_DATABASE_NAME', value: cosmosDatabaseName }
        { name: 'COSMOS_ACCOUNT_ENDPOINT', value: 'https://${cosmosAccountName}.documents.azure.com:443/' }
        { name: 'STORAGE_ACCOUNT_NAME', value: storageAccountName }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'ALLOWED_TENANT_ID', value: allowedTenantId }
      ]
    }
  }
}

output functionAppName string = functionApp.name
output functionAppResourceId string = functionApp.id
output functionAppPrincipalId string = functionApp.identity.principalId
output functionAppHostname string = functionApp.properties.defaultHostName
