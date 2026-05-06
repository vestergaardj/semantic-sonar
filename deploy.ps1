<#
.SYNOPSIS
  Deploy Semantic Sonar – Azure Functions backend + Static Web App frontend.

.DESCRIPTION
  1. Publishes the .NET Azure Functions project.
  2. Builds the Next.js static export.
  3. Deploys Functions via `func azure functionapp publish`.
  4. Deploys SWA via the StaticSitesClient binary (bypasses swa CLI
     which silently masks deployment errors).

.PARAMETER SkipFunctions
  Skip the Azure Functions build + deploy.

.PARAMETER SkipWeb
  Skip the Next.js SWA build + deploy.
#>
[CmdletBinding()]
param(
    [switch]$SkipFunctions,
    [switch]$SkipWeb
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Configuration ──────────────────────────────────────────────────
$Subscription   = '007d3c13-ff30-41b6-b308-a0073e4bc359'
$ResourceGroup  = 'fabric-sonar'
$FuncAppName    = 'func-fabric-sonar-mb43627h'
$SwaName        = 'swa-fabric-sonar-mb43627h'
$SwaEnv         = 'default'

$RepoRoot       = $PSScriptRoot
$FunctionsDir   = Join-Path $RepoRoot 'src\SemanticSonar.Functions'
$WebDir         = Join-Path $RepoRoot 'src\SemanticSonar.Web'
$PublishDir     = Join-Path $FunctionsDir 'publish'
$OutDir         = Join-Path $WebDir 'out'

# ── Helpers ────────────────────────────────────────────────────────
function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  FAIL $msg" -ForegroundColor Red }

function Assert-Tool($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required tool '$name' not found in PATH."
    }
}

# ── Pre-flight checks ─────────────────────────────────────────────
Write-Step 'Pre-flight checks'
Assert-Tool 'az'
Assert-Tool 'azd'
Assert-Tool 'func'
Assert-Tool 'node'
Assert-Tool 'npm'
Write-Ok 'All tools available'

# Ensure az is logged in
$azAccount = az account show --query "id" -o tsv 2>$null
if (-not $azAccount) { throw 'Not logged in to az CLI. Run: az login' }
Write-Ok "az CLI logged in (subscription: $azAccount)"

# ── 1. Azure Functions ─────────────────────────────────────────────
if (-not $SkipFunctions) {
    Write-Step 'Building Azure Functions'
    Push-Location $FunctionsDir
    try {
        dotnet publish -c Release -o $PublishDir --nologo
        if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }
        Write-Ok 'Functions built'

        Write-Step 'Deploying Azure Functions'
        Push-Location $PublishDir
        func azure functionapp publish $FuncAppName --dotnet-isolated
        if ($LASTEXITCODE -ne 0) { throw 'func publish failed' }
        Pop-Location
        Write-Ok "Functions deployed to $FuncAppName"
    }
    finally { Pop-Location }
}

# ── 2. Static Web App ──────────────────────────────────────────────
if (-not $SkipWeb) {
    Write-Step 'Building Next.js'
    Push-Location $WebDir
    try {
        # Hide .env.local during build so NEXT_PUBLIC_* vars use defaults
        $envLocal    = Join-Path $WebDir '.env.local'
        $envLocalBak = Join-Path $WebDir '.env.local.bak'
        $hadEnv = Test-Path $envLocal
        if ($hadEnv) {
            Rename-Item $envLocal $envLocalBak
            Write-Host '  (temporarily hid .env.local for production build)'
        }

        try {
            npm run build
            if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
        }
        finally {
            if ($hadEnv -and (Test-Path $envLocalBak)) {
                Rename-Item $envLocalBak $envLocal
            }
        }

        # Verify out/ exists
        if (-not (Test-Path $OutDir)) { throw "Build output directory not found: $OutDir" }

        $fileCount = (Get-ChildItem $OutDir -Recurse -File).Count
        Write-Ok "Next.js built ($fileCount files in out/)"

        # Verify staticwebapp.config.json is in out/
        $cfgPath = Join-Path $OutDir 'staticwebapp.config.json'
        if (-not (Test-Path $cfgPath)) {
            throw "staticwebapp.config.json missing from $OutDir"
        }
        Write-Ok 'staticwebapp.config.json present in out/'

        # ── Get SWA deployment token ───────────────────────────────
        Write-Step 'Fetching SWA deployment token'
        $azdTokenJson = azd auth token --output json 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'azd auth token failed. Run: azd auth login' }
        $azdToken = ($azdTokenJson | ConvertFrom-Json).token

        $secretsUrl = "https://management.azure.com/subscriptions/$Subscription/resourceGroups/$ResourceGroup/providers/Microsoft.Web/staticSites/$SwaName/listSecrets?api-version=2023-01-01"
        $secretsJson = az rest --method POST --url $secretsUrl --query "properties.apiKey" -o tsv 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $secretsJson) {
            throw 'Failed to retrieve SWA deployment token via az rest'
        }
        $deployToken = $secretsJson
        Write-Ok 'Deployment token acquired'

        # ── Deploy via StaticSitesClient ───────────────────────────
        Write-Step 'Deploying to Azure Static Web Apps'

        # Locate the StaticSitesClient binary (installed by swa CLI)
        $sscDir = Join-Path $env:USERPROFILE '.swa\deploy'
        $sscExe = Get-ChildItem $sscDir -Recurse -Filter 'StaticSitesClient.exe' -ErrorAction SilentlyContinue |
                  Select-Object -First 1 -ExpandProperty FullName

        if (-not $sscExe) {
            # Fallback: use swa deploy (less reliable error reporting)
            Write-Host '  StaticSitesClient.exe not found; falling back to swa deploy' -ForegroundColor Yellow
            swa deploy $OutDir --deployment-token $deployToken --env $SwaEnv
            if ($LASTEXITCODE -ne 0) { throw 'swa deploy failed' }
        }
        else {
            Write-Host "  Using $sscExe"
            $resolvedOut = (Resolve-Path $OutDir).Path
            & $sscExe `
                --app $resolvedOut `
                --appArtifactLocation $resolvedOut `
                --apiToken $deployToken `
                --configFileLocation $resolvedOut `
                --verbose `
                --skipAppBuild `
                --skipApiBuild `
                --deploymentProvider "SwaCli" 2>&1 | ForEach-Object {
                    $line = $_.ToString()
                    # Surface errors clearly
                    if ($line -match 'error|fail|invalid|reject') {
                        Write-Host "  $line" -ForegroundColor Red
                    } else {
                        Write-Host "  $line"
                    }
                }
            if ($LASTEXITCODE -ne 0) { throw 'StaticSitesClient deploy failed' }
        }

        # ── Verify deployment ──────────────────────────────────────
        Write-Step 'Verifying deployment'
        $buildInfo = az rest --method GET `
            --url "https://management.azure.com/subscriptions/$Subscription/resourceGroups/$ResourceGroup/providers/Microsoft.Web/staticSites/$SwaName/builds/default?api-version=2023-01-01" `
            --query "properties.{status:status, lastUpdatedOn:lastUpdatedOn}" 2>$null | ConvertFrom-Json
        Write-Ok "Status: $($buildInfo.status), Last Updated: $($buildInfo.lastUpdatedOn)"

        $swaHostname = az staticwebapp show -n $SwaName -g $ResourceGroup --query "defaultHostname" -o tsv 2>$null
        Write-Host "`n  >> https://$swaHostname" -ForegroundColor Green
    }
    finally { Pop-Location }
}

Write-Host "`nDeployment complete!" -ForegroundColor Green
