param(
  [Parameter(Position = 0)]
  [string]$Command = "help",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$script = Join-Path $PSScriptRoot "scripts\pandora.ps1"
& $script $Command @Rest
exit $LASTEXITCODE