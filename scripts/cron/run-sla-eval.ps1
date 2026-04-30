$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$triggerScript = Join-Path $scriptRoot "trigger-sla-eval.mjs"

if (!(Test-Path $triggerScript)) {
  throw "SLA trigger script not found: $triggerScript"
}

Write-Host "[sla-cron] Running PowerShell wrapper..."
node $triggerScript
if ($LASTEXITCODE -ne 0) {
  throw "SLA cron trigger failed with exit code $LASTEXITCODE"
}

Write-Host "[sla-cron] Completed."
