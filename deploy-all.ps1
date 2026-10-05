# deploy-all.ps1 — ONE-TIME deploy to all SafarDesk agency projects
# Usage: powershell -ExecutionPolicy Bypass -File deploy-all.ps1
#
# Prerequisites:
#   - Each agency's .env backup exists: .env.abusultan, .env.adan, .env.leading, .env.6brothers, .env.fstravelntours
#   - Firebase CLI logged in (firebase login)
#   - Run from the Safardesk1 project root (C:\Users\maqh1\Safardesk1)

$ErrorActionPreference = "Stop"

# Agency list: Project ID -> env backup file suffix
$agencies = @(
    @{ Project = "safardesk-abusultan";        EnvSuffix = "abusultan" },
    @{ Project = "safardesk-adan-travels";     EnvSuffix = "adan" },
    @{ Project = "safardesk-leading-travels-01"; EnvSuffix = "leading" },
    @{ Project = "safardesk-6brothers";        EnvSuffix = "6brothers" },
    @{ Project = "fs-travel-n-tours";         EnvSuffix = "fstravelntours" }
)

Write-Host "=== Pulling latest code ===" -ForegroundColor Cyan
git pull origin main
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

# Backup current .env if it exists
$currentEnv = ".env"
$currentBackup = ".env.backup-before-deploy-all"
if (Test-Path $currentEnv) {
    Copy-Item $currentEnv $currentBackup -Force
    Write-Host "Backed up current .env to $currentBackup" -ForegroundColor Yellow
}

foreach ($agency in $agencies) {
    $project = $agency.Project
    $suffix = $agency.EnvSuffix
    $envFile = ".env.$suffix"

    Write-Host ""
    Write-Host "=== Deploying to $project ===" -ForegroundColor Cyan

    if (-not (Test-Path $envFile)) {
        Write-Host "WARNING: $envFile not found, skipping $project" -ForegroundColor Red
        continue
    }

    # Activate this agency's .env
    Copy-Item $envFile $currentEnv -Force
    Write-Host "Using $envFile" -ForegroundColor Green

    # Build
    Write-Host "Building..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed for $project" }

    # Deploy hosting + firestore rules (using --project flag to avoid 'firebase use' Windows bug)
    Write-Host "Deploying to $project..." -ForegroundColor Yellow
    firebase deploy --only hosting,firestore:rules --project $project
    if ($LASTEXITCODE -ne 0) { throw "Deploy failed for $project" }

    Write-Host "✅ $project deployed!" -ForegroundColor Green
}

# Restore original .env
if (Test-Path $currentBackup) {
    Copy-Item $currentBackup $currentEnv -Force
    Remove-Item $currentBackup -Force
    Write-Host ""
    Write-Host "Restored original .env" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 ALL AGENCIES DEPLOYED!" -ForegroundColor Green
