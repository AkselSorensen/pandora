param(
  [string]$Model = "pandora-ai",
  [string]$Base = "llama3.1:8b"
)

Write-Host "[Pandora AI] Pulling base model $Base..." -ForegroundColor Cyan
ollama pull $Base

Write-Host "[Pandora AI] Creating $Model from ai/pandora-ai/Modelfile..." -ForegroundColor Cyan
ollama create $Model -f ai/pandora-ai/Modelfile

Write-Host "[Pandora AI] Ready. Test with: ollama run $Model" -ForegroundColor Green
