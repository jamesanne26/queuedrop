$ErrorActionPreference = "Stop"

Set-Location "C:\queuedrop"

Write-Host ""
Write-Host "========================================"
Write-Host " QueueDrop - Full Automated Test Suite"
Write-Host " Clean log mode"
Write-Host "========================================"
Write-Host ""

# Run the existing full suite and merge stderr/stdout so we can filter only
# one known benign Next.js/Playwright disconnect message.
$lines = @()
$global:LASTEXITCODE = 0

& npm run test:all 2>&1 | ForEach-Object {
    $lines += $_.ToString()
}

$exitCode = $LASTEXITCODE

# Suppress ONLY this known benign block:
#
# [WebServer] ⨯ Error: The destination stream closed early.
# [WebServer]     at ignore-listed frames {
# [WebServer]   digest: '...'
# [WebServer] }
#
# Everything else is printed unchanged.
$i = 0
$suppressed = 0

while ($i -lt $lines.Count) {
    $line = $lines[$i]

    if ($line -match "^\[WebServer\]\s+.*Error:\s+The destination stream closed early\.$") {
        $j = $i + 1

        if ($j -lt $lines.Count -and $lines[$j] -match "^\[WebServer\]\s+at ignore-listed frames \{$") {
            $j++

            if ($j -lt $lines.Count -and $lines[$j] -match "^\[WebServer\]\s+digest:\s+'.*'$") {
                $j++

                if ($j -lt $lines.Count -and $lines[$j] -match "^\[WebServer\]\s+\}$") {
                    $suppressed++
                    $i = $j + 1
                    continue
                }
            }
        }
    }

    Write-Host $line
    $i++
}

Write-Host ""
if ($suppressed -gt 0) {
    Write-Host "[QueueDrop] Suppressed $suppressed known benign Next.js destination-stream warning block(s)."
}

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "========================================"
    Write-Host " ALL REQUIRED TESTS PASSED"
    Write-Host "========================================"
    exit 0
}
else {
    Write-Host "========================================"
    Write-Host " TEST SUITE FAILED - Exit code: $exitCode"
    Write-Host "========================================"
    exit $exitCode
}
