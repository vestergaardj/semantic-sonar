param location string
param suffix string
param tags object
param functionAppResourceId string
param backendRegion string = location
param aadClientId string
param allowedTenantId string

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

// Lock Easy Auth to the configured Entra tenant
resource swaAuth 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'authsettingsV2'
  properties: {
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureActiveDirectory'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: 'https://login.microsoftonline.com/${allowedTenantId}/v2.0'
          clientId: aadClientId
          clientSecretSettingName: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
        }
        validation: {
          allowedAudiences: [
            'api://${aadClientId}'
            aadClientId
          ]
          defaultAuthorizationPolicy: {
            allowedPrincipals: {}
          }
          jwtClaimChecks: {
            allowedClientApplications: []
          }
        }
        login: {
          loginParameters: [ 'scope=openid profile email', 'prompt=select_account' ]
          disableWWWAuthenticate: false
        }
      }
    }
    login: {
      cookieExpiration: {
        convention: 'FixedTime'
        timeToExpiration: '08:00:00'
      }
    }
  }
}

output swaDefaultHostname string = 'https://${staticWebApp.properties.defaultHostname}'
output swaResourceId string = staticWebApp.id
output swaPrincipalId string = staticWebApp.identity.principalId
