$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $project

$stale = Join-Path $project "app\dashboard\settings\settings-unified-console.jsx"
if (Test-Path $stale) {
  Remove-Item -Force $stale
  Write-Host "Removed stale Settings JSX file: $stale" -ForegroundColor Yellow
}

$generated = @(".next", "test-results", "playwright-report")
foreach ($item in $generated) {
  $path = Join-Path $project $item
  if (Test-Path $path) {
    Remove-Item -Recurse -Force $path
    Write-Host "Cleaned $item" -ForegroundColor DarkGray
  }
}

Write-Host "Round 11 cleanup complete." -ForegroundColor Green
Write-Host "Next: npm run lint" -ForegroundColor Cyan
