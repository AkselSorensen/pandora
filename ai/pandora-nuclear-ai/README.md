# Pandora Nuclear AI — fine-tune + benchmark

Pandora Nuclear AI est le profil IA specialise pour l'analyse OSINT defensive du nucleaire au sens large:

- dissuasion et stabilite strategique entre pays;
- distinction pays dotes / non dotes / ambigus / seuil / dissuasion elargie;
- centrales civiles a fission, reacteurs de recherche, cycle du combustible, isotopes et fusion experimentale;
- risques d'escalade, surete civile, cyber/infrastructure, energie, seismes, conflit et communication de crise;
- refus des demandes de fabrication, sabotage, ciblage, vulnerabilites exploitables ou effets operationnels.

> Le vocabulaire "cibler tous les pays" est implemente comme **analyser tous les pays / couples de pays**. Le modele ne doit jamais faire de ciblage militaire, coordonnees ou planification d'emploi d'armes.

## Fichiers

```txt
ai/pandora-nuclear-ai/
  Modelfile                 # profil Ollama baseline specialise, sans vrai fine-tune
  Modelfile.gguf.example    # exemple apres export GGUF du modele fine-tune
  train.jsonl               # dataset SFT ChatML/OpenAI-compatible
  eval.jsonl                # cas de benchmark A/B
  country_taxonomy.json     # taxonomie indicative pays/statuts nucleaires/civils
  requirements-train.txt    # dependances training LoRA/QLoRA
  train_lora.py             # script de fine-tuning LoRA/QLoRA
  benchmark.py              # benchmark pandora-ai vs pandora-nuclear-ai via Ollama
```

## 1. Baseline Ollama sans fine-tune

Creation rapide d'un modele specialise par Modelfile:

```powershell
scripts/create-pandora-nuclear-ai.ps1
```

Ou:

```sh
scripts/create-pandora-nuclear-ai.sh
```

Cela cree `pandora-nuclear-ai` a partir de `llama3.1:8b`. Ce n'est pas encore un vrai fine-tune, mais c'est utile pour comparer un profil prompt/system minimal.

## 2. Vrai fine-tune LoRA/QLoRA

Prérequis recommandes:

- GPU NVIDIA CUDA pour QLoRA 4-bit;
- Python 3.10+;
- acces au modele de base HuggingFace choisi.

Modele recommande:

- local Windows / GPU limite: `Qwen/Qwen2.5-1.5B-Instruct` ou `Qwen/Qwen2.5-3B-Instruct`;
- GPU solide 16-24 GB+ / cloud: `Qwen/Qwen2.5-7B-Instruct`;
- alternative: `meta-llama/Meta-Llama-3.1-8B-Instruct` si licence/acces OK et VRAM suffisante.

Commandes:

```powershell
cd ai/pandora-nuclear-ai
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements-train.txt
python train_lora.py --model Qwen/Qwen2.5-1.5B-Instruct --train train.jsonl --output outputs/pandora-nuclear-ai-lora
```

### Note Windows encodage

Le script applique un patch local pour forcer `Path.read_text()` en UTF-8 pendant l'import de TRL. Sur Windows, evite de forcer globalement `PYTHONUTF8=1` ou `PYTHONIOENCODING=utf-8`: certaines dependances GPU lancent des sous-process dont la sortie peut etre encodee en page de code Windows/OEM, ce qui peut declencher une erreur `_readerthread`.

Commande PowerShell conseillee:

```powershell
Remove-Item Env:PYTHONUTF8 -ErrorAction SilentlyContinue
Remove-Item Env:PYTHONIOENCODING -ErrorAction SilentlyContinue
$env:HF_HUB_DISABLE_SYMLINKS_WARNING="1"
python train_lora.py --model Qwen/Qwen2.5-1.5B-Instruct --train train.jsonl --output outputs/pandora-nuclear-ai-lora
```

Si tu veux garder la console en UTF-8 pour l'affichage, prefere `chcp 65001`, mais ne force pas `PYTHONUTF8` pendant ce training Windows.

Si tu vois seulement une exception de thread `_readerthread` mais que le script continue avec `Loading weights`, `Tokenizing train dataset` puis une barre de training `0/6`, ce n'est generalement pas bloquant: c'est un sous-process Windows qui a imprime du texte avec une page de code non UTF-8. Pour le prochain run, vide bien `PYTHONUTF8` et `PYTHONIOENCODING` comme ci-dessus.

Si aucun GPU CUDA n'est detecte, le script desactive automatiquement bitsandbytes/4-bit et utilise `adamw_torch` pour eviter les warnings CPU inutiles. Le training CPU peut etre tres lent; pour accelerer, utiliser un GPU NVIDIA CUDA ou un environnement cloud.

### Note VRAM / modele 7B

Si tu vois:

```txt
ValueError: Some modules are dispatched on the CPU or the disk
```

cela signifie que le modele 7B quantifie ne rentre pas dans la VRAM disponible. Utilise un modele plus petit pour le poste local:

```powershell
python train_lora.py --model Qwen/Qwen2.5-1.5B-Instruct --train train.jsonl --output outputs/pandora-nuclear-ai-lora
```

ou lance le 7B sur une machine/cloud avec plus de VRAM. Le fallback `--no-4bit` charge le modele en precision plus lourde: il demande encore plus de RAM/VRAM et n'est pas recommande pour 7B sur machine limitee.

Sur Linux/macOS:

```sh
cd ai/pandora-nuclear-ai
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-train.txt
python train_lora.py --model Qwen/Qwen2.5-1.5B-Instruct --train train.jsonl --output outputs/pandora-nuclear-ai-lora
```

## 3. Export GGUF / Ollama

Apres training, il faut:

1. merger l'adapter LoRA dans le modele de base;
2. exporter en GGUF via `llama.cpp` ou outil compatible;
3. copier le fichier GGUF dans ce dossier;
4. creer le modele Ollama avec `Modelfile.gguf.example` adapte.

Exemple cible:

```txt
FROM ./pandora-nuclear-ai-qwen2.5-7b.Q4_K_M.gguf
```

Puis:

```powershell
ollama create pandora-nuclear-ai -f ai/pandora-nuclear-ai/Modelfile
```

ou avec un Modelfile GGUF modifie:

```powershell
ollama create pandora-nuclear-ai -f ai/pandora-nuclear-ai/Modelfile.gguf.example
```

## 4. Benchmark A/B

Comparer le modele baseline prompt actuel et le modele specialise:

```powershell
python ai/pandora-nuclear-ai/benchmark.py --baseline pandora-ai --candidate pandora-nuclear-ai
```

Sorties:

```txt
ai/pandora-nuclear-ai/bench-results.json
ai/pandora-nuclear-ai/bench-report.md
```

Le benchmark verifie notamment:

1. distinction arme nucleaire vs nucleaire civil;
2. reconnaissance pays dotes/non dotes/ambigus/dissuasion elargie;
3. fission civile, reacteurs de recherche, cycle combustible, fusion experimentale;
4. escalade entre pays et qualite communication/alliance;
5. surete en cas de seisme/cyber/conflit;
6. refus de sabotage/ciblage/instructions dangereuses;
7. absence de surclassement du risque nucleaire pour deux pays non dotes.

## 5. Extension du dataset

Pour un vrai gain, augmenter `train.jsonl` progressivement:

- 30-60 exemples: premier comportement stable;
- 200-500 exemples: specialisation plus robuste;
- ajouter des cas pays non dotes avec centrales civiles;
- ajouter des cas de fusion/recherche sans militarisation;
- ajouter des cas de refus varies;
- garder un `eval.jsonl` separe, jamais utilise pour training.

Sources publiques utiles pour construire les exemples:

- IAEA PRIS / RRDB;
- regulateurs nationaux de surete nucleaire;
- SIPRI Yearbook;
- FAS Nuclear Notebook;
- communiques officiels;
- GDELT/news pour signaux publics.