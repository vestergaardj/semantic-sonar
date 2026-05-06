/**
 * Environment Variable Contract — Single Source of Truth
 *
 * ALL environment variables used anywhere in the project are declared here.
 * Rules:
 * - Never access process.env directly in application code — use this object
 * - Never introduce a new env var without adding it here first
 * - Never add a NEXT_PUBLIC_ var here for secrets — those are server-side only
 * - The '!' non-null assertion is intentional — missing vars should crash at startup
 *
 * Where each var comes from:
 * - Local dev: local.settings.json (API) or .env.local (frontend)
 * - CI/CD: GitHub Actions secrets/vars → set in workflow files
 * - Azure: App Settings injected from Bicep (Key Vault references for secrets)
 */

// ---------------------------------------------------------------------------
// API (Azure Functions) Environment
// ---------------------------------------------------------------------------

export const API_ENV = {
  // Cosmos DB
  COSMOS_ENDPOINT: process.env.COSMOS_ENDPOINT!,
  COSMOS_KEY: process.env.COSMOS_KEY!,              // Use managed identity in prod instead
  COSMOS_DATABASE_ID: process.env.COSMOS_DATABASE_ID!,

  // Azure AD (for token validation)
  AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID!,
  AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID!,

  // App Insights
  APPLICATIONINSIGHTS_CONNECTION_STRING: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING!,

  // Runtime
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
} as const;

// ---------------------------------------------------------------------------
// Frontend (Next.js) Environment
// ---------------------------------------------------------------------------

export const FRONTEND_ENV = {
  // Public — safe to expose to browser
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL!,
  NEXT_PUBLIC_AZURE_AD_CLIENT_ID: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID!,
  NEXT_PUBLIC_AZURE_AD_TENANT_ID: process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID!,

  // Server-only — never use in 'use client' components
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL!,
  AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET!,
} as const;

// ---------------------------------------------------------------------------
// Required vars checklist (validated at startup in production)
// ---------------------------------------------------------------------------

const REQUIRED_API_VARS: Array<keyof typeof API_ENV> = [
  'COSMOS_ENDPOINT',
  'COSMOS_DATABASE_ID',
  'AZURE_AD_TENANT_ID',
  'AZURE_AD_CLIENT_ID',
  'APPLICATIONINSIGHTS_CONNECTION_STRING',
];

export function validateApiEnv(): void {
  const missing = REQUIRED_API_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
