param(
  [string]$Model = "pandora-nuclear-ai",
  [string]$Base = "llama3.1:8b",
  [string]$Modelfile = "ai/pandora-nuclear-ai/Modelfile"
)

Write-Host "[Pandora Nuclear AI] Pulling base model $Base..." -ForegroundColor Cyan
ollama pull $Base

Write-Host "[Pandora Nuclear AI] Creating $Model from $Modelfile..." -ForegroundColor Cyan
ollama create $Model -f $Modelfile

Write-Host "[Pandora Nuclear AI] Ready. Test with: ollama run $Model" -ForegroundColor Green