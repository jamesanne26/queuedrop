$ErrorActionPreference = "Stop"

$envFile = Join-Path (Get-Location) ".env.test.local"
if (-not (Test-Path $envFile)) {
  New-Item -ItemType File -Path $envFile -Force | Out-Null
}

$content = Get-Content $envFile -Raw
if ($null -eq $content) { $content = "" }

function Set-EnvValue([string]$Name, [string]$Value) {
  $script:content = $script:content -replace "(?m)^$([regex]::Escape($Name))=.*$", "$Name=$Value"
  if ($script:content -notmatch "(?m)^$([regex]::Escape($Name))=") {
    if ($script:content.Length -gt 0 -and -not $script:content.EndsWith("`n")) { $script:content += "`r`n" }
    $script:content += "$Name=$Value`r`n"
  }
}

Set-EnvValue "SMS_DRY_RUN" "true"

if ($content -notmatch "(?m)^SMS_DISPATCH_SECRET=.+$") {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }

  $secret = ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
  Set-EnvValue "SMS_DISPATCH_SECRET" $secret
}

Set-Content -Path $envFile -Value $content -NoNewline
Write-Host "QueueDrop TEST SMS environment is ready."
Write-Host "SMS_DRY_RUN=true (no paid SMS will be sent)."
Write-Host "SMS_DISPATCH_SECRET is configured without printing its value."
