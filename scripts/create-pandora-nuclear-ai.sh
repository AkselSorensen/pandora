#!/usr/bin/env sh
set -eu

MODEL="${1:-pandora-nuclear-ai}"
BASE="${2:-llama3.1:8b}"
MODELFILE="${3:-ai/pandora-nuclear-ai/Modelfile}"

echo "[Pandora Nuclear AI] Pulling base model ${BASE}..."
ollama pull "${BASE}"

echo "[Pandora Nuclear AI] Creating ${MODEL} from ${MODELFILE}..."
ollama create "${MODEL}" -f "${MODELFILE}"

echo "[Pandora Nuclear AI] Ready. Test with: ollama run ${MODEL}"