param location string
param suffix string
param tags object
param functionAppResourceId string
param backendRegion string = location

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-fabric-sonar-${suffix}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

// Link the Function App as the backend API
resource swaBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: staticWebApp
  name: 'backend'
  properties: {
    backendResourceId: functionAppResourceId
    region: backendRegion
  }
}

output swaDefaultHostname string = 'https://${staticWebApp.properties.defaultHostname}'
output swaResourceId string = staticWebApp.id
output swaPrincipalId string = staticWebApp.identity.principalId
