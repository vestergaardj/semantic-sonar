/**
 * Deploy the Next.js static build to Azure Static Web Apps.
 * Usage: npm run deploy
 *
 * Requires: azd logged-in  (azd auth login)
 *           swa CLI        (npm install -g @azure/static-web-apps-cli)
 */
import { execSync } from 'child_process';
import { renameSync, existsSync } from 'fs';

const SUBSCRIPTION = '007d3c13-ff30-41b6-b308-a0073e4bc359';
const RESOURCE_GROUP = 'fabric-sonar';
const SWA_NAME = 'swa-fabric-sonar-mb43627h';
const ENV = 'default';

// Hide .env.local during build so NEXT_PUBLIC_* vars use defaults (e.g. /api)
const envLocal = '.env.local';
const envLocalBak = '.env.local.bak';
const hadEnvLocal = existsSync(envLocal);
if (hadEnvLocal) {
  renameSync(envLocal, envLocalBak);
  console.log('Temporarily renamed .env.local for production build');
}

function restoreEnvLocal() {
  if (hadEnvLocal && existsSync(envLocalBak)) {
    renameSync(envLocalBak, envLocal);
    console.log('Restored .env.local');
  }
}

// Build without .env.local so NEXT_PUBLIC_API_URL defaults to /api
console.log('Building Next.js…');
execSync('npm run build', { stdio: 'inherit' });

// Get ARM bearer token from azd
let azdToken;
try {
  azdToken = JSON.parse(
    execSync('azd auth token --output json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
  ).token;
} catch (e) {
  restoreEnvLocal();
  throw e;
}

// Get the SWA deployment token via ARM API
const url = `https://management.azure.com/subscriptions/${SUBSCRIPTION}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Web/staticSites/${SWA_NAME}/listSecrets?api-version=2023-01-01`;
let deployToken;
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${azdToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get deploy token: ${res.status} ${await res.text()}`);
  deployToken = (await res.json()).properties.apiKey;
} catch (e) {
  restoreEnvLocal();
  throw e;
}

// Deploy
console.log('Deploying to Azure Static Web Apps…');
try {
  execSync(`swa deploy out --deployment-token ${deployToken} --env ${ENV}`, { stdio: 'inherit' });
} finally {
  restoreEnvLocal();
}
console.log('Done.');
