# Pandora AI — modèle local OSINT défensif

Pandora AI est le profil IA local du projet Pandora Atlas. Il est conçu pour produire des briefings analystes à partir de sources publiques: news, GDELT, AIS maritime, dark vessels, cyber, météo, infrastructures critiques, CCTV publiques et dossiers région.

## Option rapide: créer le modèle Ollama

Prérequis: Ollama installé et le modèle de base disponible.

```powershell
ollama pull llama3.1:8b
ollama create pandora-ai -f ai/pandora-ai/Modelfile
ollama run pandora-ai
```

Ensuite Pandora utilise automatiquement `pandora-ai` via `/api/aip/briefing`.

Variables possibles:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=pandora-ai
```

## Dataset de fine-tuning

`train.jsonl` est un mini dataset SFT au format messages ChatML/OpenAI-compatible. Il sert de base pour entraîner ou spécialiser un modèle HuggingFace avec TRL/Unsloth/Axolotl.

Objectif du fine-tune:
- briefings OSINT défensifs;
- corrélation multi-sources;
- refus des demandes privées/offensives;
- recommandations analystes;
- style Pandora opérationnel.

## Fine-tune HuggingFace recommandé

Base légère recommandée:
- `Qwen/Qwen2.5-7B-Instruct`
- ou `meta-llama/Meta-Llama-3.1-8B-Instruct` si licence/accès OK.

Approche recommandée:
1. Convertir/étendre `train.jsonl` avec 200-1000 exemples Pandora.
2. Fine-tune LoRA avec Unsloth ou TRL.
3. Export GGUF.
4. Créer un modèle Ollama avec le GGUF.

Exemple Modelfile GGUF après fine-tune:

```text
FROM ./pandora-ai-qwen2.5-7b.Q4_K_M.gguf
SYSTEM "Tu es Pandora AI, assistant analyste OSINT défensif..."
PARAMETER temperature 0.25
PARAMETER num_ctx 8192
```

## Sécurité

Pandora AI doit rester défensif:
- pas d'intrusion;
- pas de contournement;
- pas de caméras privées;
- pas d'instructions offensives;
- confirmation par sources primaires.
