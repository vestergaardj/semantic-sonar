param location string
param suffix string
param tags object

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-fabric-sonar-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true // Use RBAC, not access policies
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// The multi-tenant Entra app client secret must be manually added after first deployment:
//   az keyvault secret set --vault-name <kv-name> --name fabric-sonar-client-secret --value <secret>

output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultResourceId string = keyVault.id
output keyVaultName string = keyVault.name
