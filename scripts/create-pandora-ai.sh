#!/usr/bin/env sh
set -eu

MODEL="${1:-pandora-ai}"
BASE="${2:-llama3.1:8b}"

echo "[Pandora AI] Pulling base model ${BASE}..."
ollama pull "${BASE}"

echo "[Pandora AI] Creating ${MODEL} from ai/pandora-ai/Modelfile..."
ollama create "${MODEL}" -f ai/pandora-ai/Modelfile

echo "[Pandora AI] Ready. Test with: ollama run ${MODEL}"
