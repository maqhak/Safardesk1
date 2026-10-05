<#
.SYNOPSIS
  SafarDesk — One-Build-Many-Tenants deploy.
  Builds ONCE with the unified .env, then deploys the SAME dist/ to all 5 agencies.
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

# Unified env holds ALL tenants (one-build-many-tenants)
if (-not (Test-Path '.env')) {
  Write-Host "ERROR: .env not found. Copy .env.unified.example to .env and fill API keys." -ForegroundColor Red
  exit 1
}

Write-Host "=== Building ONCE ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FAILED" -ForegroundColor Red; exit 1 }

$projects = @(
  'safardesk-abusultan',
  'safardesk-adan-travels',
  'safardesk-leading-travels-01',
  'safardesk-6brothers',
  'fs-travel-n-tours',
  'safardesk-ub-travels'
)

foreach ($p in $projects) {
  Write-Host ""
  Write-Host "=== Deploying to $p ===" -ForegroundColor Cyan
  firebase deploy --only hosting,firestore:rules --project $p
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: $p" -ForegroundColor Red
  } else {
    Write-Host "OK: $p" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "=== ALL AGENCIES DEPLOYED (one build) ===" -ForegroundColor Green
