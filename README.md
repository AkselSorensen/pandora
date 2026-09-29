<div align="center">

# ⬡ Pandora

### Plateforme OSINT, cartographie temps réel & centre de reconnaissance défensif

[![Live Demo](https://img.shields.io/badge/Pandora_AI-Live-00E5FF?style=for-the-badge&logo=vercel&logoColor=white)](https://Pandoraai.live)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=111)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![MapLibre](https://img.shields.io/badge/MapLibre_GL-WebGL-396CB2?style=for-the-badge)](https://maplibre.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](DOCKER.md)
[![License](https://img.shields.io/badge/License-MIT-D4AF37?style=for-the-badge)](LICENSE)

**Pandora transforme des flux publics — aviation, maritime, CCTV, catastrophes, conflits, cyber, satellites, actualités et signaux IA — en une interface unique de veille géospatiale accélérée GPU.**

`OSINT` · `Situational Awareness` · `MapLibre GL` · `Recon Toolkit` · `Pandora AI` · `Docker / CasaOS`

[🌐 Démo](https://Pandoraai.live) · [🐛 Signaler un bug](https://github.com/simplifaisoul/Pandora/issues) · [💡 Proposer une feature](https://github.com/simplifaisoul/Pandora/issues) · [💬 Discord](https://discord.gg/umBykEpb98)

</div>

---

## ✦ Sommaire

- [Vision](#-vision)
- [Ce que Pandora agrège](#-ce-que-pandora-agrège)
- [Fonctionnalités majeures](#-fonctionnalités-majeures)
- [Architecture](#-architecture)
- [Démarrage rapide](#-démarrage-rapide)
- [Docker / Self-hosting / CasaOS](#-docker--self-hosting--casaos)
- [Variables d'environnement](#-variables-denvironnement)
- [Pandora AI local](#-pandora-ai-local)
- [Raccourcis clavier](#-raccourcis-clavier)
- [Structure du projet](#-structure-du-projet)
- [Stack technique](#-stack-technique)
- [Souveraineté, gouvernance & audit](#-souveraineté-gouvernance--audit)
- [Sécurité & éthique](#-sécurité--éthique)
- [Licence](#-licence)

---

## 🧭 Vision

**Pandora** est un tableau de bord OSINT open-source pensé comme une salle d'opérations : une carte mondiale, des couches activables, des flux temps réel, des signaux faibles et des outils de reconnaissance défensive dans une seule interface.

L'objectif : **voir plus vite, corréler mieux, documenter proprement**.

Pandora ne cherche pas à remplacer un analyste. Il fournit une base visuelle pour :

- suivre des événements géopolitiques ou naturels ;
- surveiller des zones d'intérêt ;
- croiser aviation, maritime, cyber, météo, news et infrastructures ;
- préparer des briefings analystes ;
- explorer des sources publiques sans multiplier les outils ;
- déployer un cockpit OSINT local, Docker ou CasaOS.

> ⚠️ Pandora est orienté **OSINT défensif** et utilise des sources publiques / ouvertes. Il ne doit pas être utilisé pour cibler des personnes, contourner des systèmes, accéder à des ressources privées ou mener des actions offensives.

---

## 🌍 Ce que Pandora agrège

| Domaine | Données affichées | Sources / logique |
|---|---:|---|
| ✈️ **Aviation** | vols commerciaux, privés, jets, militaires | ADS-B public, catégorisation interne |
| 🛡️ **Défense** | tankers, ISR, AWACS, événements militaires, bases aériennes | heuristiques callsign / modèle, GDELT, datasets publics |
| 🛰️ **Satellite** | scènes Sentinel, SAR, optique, satellites orbitaux | Sentinel, CelesTrak, satellite.js |
| ⚓ **Maritime** | navires, ports, chokepoints, bases navales | AIS / données publiques / intelligence statique |
| 🌊 **Dark AIS** | clusters lents, congestion, comportements suspects | heuristiques géospatiales défensives |
| 📹 **CCTV publiques** | caméras publiques de trafic / routes / villes | TfL, WSDOT, Caltrans, NYC DOT, VicRoads, Balkans, Turquie, etc. |
| 📰 **News & GDELT** | flux RSS, live news 24/7, incidents mondiaux | RSS, GDELT, broadcasters publics |
| 🌋 **Risques naturels** | séismes, feux actifs, météo sévère, qualité de l'air | USGS, NASA FIRMS, EONET / météo publique |
| 🧬 **Cyber** | menaces cyber géolocalisées, CVE, dark web alerts | NVD, scrapers défensifs, sources publiques |
| 🏭 **Infrastructure** | centrales nucléaires, sites critiques OSM, pays à risque | datasets publics, OpenStreetMap, scoring interne |
| ☀️ **Espace / GNSS** | météo spatiale, aurores, perturbations GNSS | NOAA SWPC |
| 🧠 **IA locale** | briefing AIP, synthèse analyste, fusion multi-sources | Ollama / Pandora AI / fallback règles locales |

---

## ✨ Fonctionnalités majeures

### 🗺️ Carte opérationnelle GPU

- rendu **MapLibre GL / WebGL** pour garder une interface fluide ;
- projection **globe** ou **mercator** ;
- calques activables par domaine ;
- chargement progressif : les APIs sont appelées seulement lorsque la couche est utile ;
- partage d'état par URL : position, zoom et couches actives ;
- cycle jour / nuit avec terminateur solaire ;
- clic sur entité pour ouvrir détails, caméra ou flux live.

### 🧩 Data Layers organisés par mission

Pandora regroupe les couches par familles :

- **AVIATION** : commercial, privé, jets ;
- **MILITARY / DEFENSE** : avions militaires, tankers / ISR, frontlines, événements, bases ;
- **SATELLITE INTEL** : Sentinel scenes, SAR watch, optical watch ;
- **MARITIME & SPACE** : maritime / naval, dark activity, satellites, ballons haute altitude ;
- **SURVEILLANCE** : CCTV, live news, SIGINT news RSS ;
- **NATURAL HAZARDS** : séismes, feux, météo sévère, air quality, disaster ops ;
- **THREATS & INFRA** : conflict zones, nuclear facilities, radiation, incidents, GPS jamming, country risk, cyber geo, ports, heatmap ;
- **OSM INFRASTRUCTURE** : sites critiques autour de la zone visible ;
- **DISPLAY** : cycle jour / nuit.

Des presets rapides permettent de basculer en mode **OPS**, **WATCH**, **HAZ** ou **CLEAR**.

### 🧠 Fusion analytique & Mission Control

- agrégation des signaux en modèle de fusion ;
- heatmap globale de risque ;
- scoring multi-sources par zone ;
- panneau Mission Control ;
- panneau Advanced Ops ;
- dossiers régionaux via clic droit sur la carte ;
- briefing AIP basé sur le snapshot courant.

### 🛠️ RECON Toolkit défensif

Pandora inclut une zone de reconnaissance pour investiguer une cible autorisée :

- DNS lookup ;
- WHOIS ;
- IP intelligence ;
- certificats / TLS ;
- CVE lookup ;
- scans via backend RECON optionnel ;
- playbooks de reconnaissance ;
- visualisation de résultats sur la carte quand pertinent.

> Sans `SCANNER_URL` et `SCANNER_KEY`, les fonctions RECON dépendantes du backend répondent en mode indisponible, mais le reste de Pandora fonctionne normalement.

### 📺 Réseau live news & CCTV

- flux d'information 24/7 ;
- caméras publiques cartographiées ;
- lecteur intégré lorsque l'intégration est autorisée ;
- fallback vers URL externe si nécessaire ;
- sources regroupées dans `public/cctv-sources.json` et routes API dédiées.

### 🕵️ Cyber, Dark Web & OSINT Hub

- radar de menaces cyber ;
- alertes dark web issues de sources publiques / défensives ;
- hub OSINT pour lancer des requêtes ;
- corrélation cyber géographique ;
- routes spécialisées : `/api/cyber-threats`, `/api/darkweb-alerts`, `/api/osint/*`, `/api/cyber-geo`.

### 🛰️ Sentinel, satellites & météo spatiale

- scènes Sentinel autour de la zone observée ;
- séparation SAR / optique ;
- satellites orbitaux ;
- indicateurs de météo spatiale NOAA SWPC ;
- points opérationnels aurora / GNSS.

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         PANDORA WEB CLIENT                           │
│  Next.js App Router · React 19 · TypeScript · Framer Motion          │
│                                                                      │
│  ┌──────────────────────┐   ┌─────────────────────────────────────┐  │
│  │ MapLibre GL / WebGL  │   │ Panels opérationnels                │  │
│  │ Globe / Mercator     │   │ Layers · Intel · Markets · AIP      │  │
│  │ GeoJSON sources      │   │ Mission Control · Recon · CCTV      │  │
│  └──────────────────────┘   └─────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS API ROUTES                           │
│ /api/flights        /api/maritime        /api/cctv                   │
│ /api/earthquakes    /api/fires           /api/weather                │
│ /api/gdelt          /api/live-news       /api/news                   │
│ /api/sentinel       /api/satellites      /api/space-weather          │
│ /api/cyber-threats  /api/darkweb-alerts  /api/osint/*               │
│ /api/airbases       /api/french-airbases /api/osm-critical           │
│ /api/aip/briefing   /api/region-dossier  /api/markets                │
└──────────────────────────────────────────────────────────────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
┌───────────────────────────────┐       ┌──────────────────────────────┐
│ Sources publiques / ouvertes  │       │ Services optionnels           │
│ ADS-B · USGS · NASA · NOAA    │       │ Pandora AI service            │
│ GDELT · OSM · CelesTrak       │       │ Ollama local                  │
│ RSS · CCTV publiques · NVD    │       │ Backend RECON scanner         │
└───────────────────────────────┘       └──────────────────────────────┘
```

---

## ⚡ Démarrage rapide

### Prérequis

- Node.js 22 recommandé ;
- npm ;
- Git.

```bash
git clone https://github.com/simplifaisoul/Pandora.git
cd Pandora
npm install
npm run dev
```

Ouvre ensuite : [http://localhost:3001](http://localhost:3001)

> Le script `dev` du projet lance Next.js sur le port `3001`.

### Commandes utiles

```bash
npm run dev      # serveur de développement sur :3001
npm run build    # build production Next.js
npm run start    # serveur production sur :3001
npm run lint     # lint ESLint
```

### Démo publique depuis GitHub

Le dépôt est prêt à être importé sur Vercel avec le bouton **Deploy with Vercel** en haut du README. Après connexion au compte GitHub et choix du dépôt `AkselSorensen/pandora`, conserver les réglages Next.js détectés automatiquement : répertoire racine `./`, commande de build `npm run build`, et version Node.js 22.

La page et les routes intégrées démarrent sans secrets. Les connecteurs optionnels (services Pandora, AIS, GitHub API, Ollama) nécessitent leurs variables depuis `.env.example` dans **Vercel → Settings → Environment Variables** ; ne jamais copier `.env` dans GitHub. Sans ces intégrations, la démo s'affiche, mais certains panneaux restent indisponibles.

Une fois le dépôt lié à Vercel, les pushes déclenchent des déploiements et les pull requests reçoivent une URL d'aperçu. GitHub Pages ne convient pas à l'application complète, car les Route Handlers et le proxy Next.js ont besoin d'un runtime serveur.

---

## 🐳 Docker / Self-hosting / CasaOS

Pandora est prêt pour un déploiement local, serveur ou homelab.

```bash
git clone https://github.com/simplifaisoul/Pandora.git
cd Pandora
cp .env.template .env

docker compose up -d
```

Interface : [http://localhost:3001](http://localhost:3001)

Le `docker-compose.yml` démarre deux services :

| Service | Rôle | Port |
|---|---|---:|
| `pandora` | interface web Next.js | `${PANDORA_PORT:-3001}:3000` |
| `pandora-ai` | service local de briefing IA | `${PANDORA_AI_PORT:-7701}:7701` |

### Image précompilée GHCR

```bash
docker pull ghcr.io/aiacos/pandora:latest
docker run -d -p 3001:3000 --env-file .env ghcr.io/aiacos/pandora:latest
```

### CasaOS

Le compose contient des métadonnées `x-casaos` pour faciliter l'intégration dans un environnement CasaOS / homelab.

Pour plus de détails Docker, consulte [DOCKER.md](DOCKER.md).

---

## 🔐 Variables d'environnement

Pandora fonctionne majoritairement **sans clés API**. Les flux principaux s'appuient sur des sources publiques ou keyless.

Copie le template :

```bash
cp .env.template .env
```

Extrait utile :

```env
# Backend RECON optionnel
SCANNER_URL=
SCANNER_KEY=

# IA locale / Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Port exposé par Docker
PANDORA_PORT=3001

# Clés optionnelles / futures limites de débit
FIRMS_API_KEY=
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=
AIS_API_KEY=
```

### Notes importantes

- `SCANNER_URL` et `SCANNER_KEY` activent les fonctions RECON dépendantes d'un backend scanner.
- `OLLAMA_BASE_URL` et `OLLAMA_MODEL` alimentent le briefing AIP si Ollama est disponible.
- Les clés FIRMS / OpenSky / AIS sont optionnelles et prévues pour des usages avancés ou futures extensions.
- Ne commit jamais ton fichier `.env`.

---

## 🧠 Pandora AI local

Pandora peut générer des briefings analystes via un modèle local Ollama.

### Option rapide

```bash
ollama pull llama3.1:8b
ollama create pandora-ai -f ai/pandora-ai/Modelfile
ollama run pandora-ai
```

Puis configure :

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=pandora-ai
```

Le endpoint concerné est :

```text
/api/aip/briefing
```

Si Ollama n'est pas disponible, Pandora utilise un fallback déterministe basé sur les règles de fusion locales.

Plus d'informations : [ai/pandora-ai/README.md](ai/pandora-ai/README.md)

---

## ⌨️ Raccourcis clavier

| Touche | Action |
|---|---|
| `F` | Activer / quitter le plein écran |
| `L` | Afficher / masquer le panneau des couches |
| `M` | Afficher / masquer les marchés |
| `I` | Afficher / masquer le flux intelligence |
| `R` | Recentrer la carte |
| `G` | Basculer globe / mercator |

---

## 🗂️ Structure du projet

```text
pandora/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                 # cockpit principal
│  │  └─ api/                     # routes API OSINT / fusion / recon
│  ├─ components/                 # panels, carte, CCTV, AIP, OSINT hub
│  └─ lib/                        # scrapers, sources, fusion model
├─ public/
│  ├─ cctv-sources.json           # catalogue de caméras publiques
│  └─ icons / manifest / assets
├─ ai/
│  ├─ pandora-ai/                 # Modelfile + dataset local
│  └─ pandora-ai-service/         # service FastAPI / briefing IA
├─ scripts/                       # scripts création modèle IA
├─ docker-compose.yml
├─ Dockerfile
├─ DOCKER.md
├─ .env.template
└─ README.md
```

---

## 🧱 Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16.2.6, App Router, Turbopack |
| UI | React 19.2.4 |
| Langage | TypeScript 5 |
| Carte | MapLibre GL JS 5.24, React Map GL |
| Rendu géospatial | WebGL, GeoJSON sources, clustering logique |
| Animations | Framer Motion |
| Styling | Tailwind CSS 4 + design system custom |
| Icônes | Lucide React, Iconify |
| Vidéo | HLS.js |
| Satellites | satellite.js |
| Data fetching | Next API routes, fetch progressif, polling contrôlé |
| IA locale | Ollama, service `pandora-ai` optionnel |
| Conteneurisation | Docker, Docker Compose, GHCR, CasaOS metadata |

---

## 🧪 Performance & philosophie de chargement

Pandora évite de surcharger les sources :

- chargement à la demande selon les couches actives ;
- `layerFetchedRef` pour éviter les appels dupliqués ;
- polling ralenti pour les données stables ;
- sources statiques gardées côté serveur lorsque possible ;
- rendu carte via WebGL plutôt que via DOM ;
- désactivation des fetchs si le document est caché.

---

## 🔐 Souveraineté, gouvernance & audit

Depuis la Phase 1, Pandora porte une couche de gouvernance complète — décision d'accès par attributs,
journal d'audit inviolable, gestion de dossiers persistante et graphe de connaissances filtrable.
Détails et limites assumeées : [`docs/PHASE1.md`](docs/PHASE1.md).

### Classification et contrôle d'accès (ABAC)

Chaque route API est classée, et une requête classifiée n'est servie qu'après une décision explicite
du service de gouvernance — décision journalisée, y compris les refus. **Fail closed** : sans journal,
pas d'accès classifié.

| Niveau | Exemples de routes |
|---|---|
| NP (non protégé) | `/api/flights`, `/api/earthquakes`, `/api/gdelt`, `/api/cctv` |
| DR (diffusion restreinte) | `/api/territorial`, `/api/hotspots`, `/api/graph`, `/api/darkweb-alerts` |
| C (confidentiel) | `/api/digest`, `/api/dgsi`, `/api/cases`, `/api/governance/*` |
| S (secret, compartiment `nuclear`) | `/api/deterrence` |

Le profil opérateur (clearance / rôle / compartiments) se règle dans l'outil **GOUVERNANCE** du rail.
Ce profil est **local et non authentifiant** : il rend la politique démontrable et traçable, il
n'établit pas d'identité (§6 de `docs/PHASE1.md`).

### Journal d'audit chaîné

```bash
curl -s localhost:7715/audit/verify    # vérification de la chaîne de hash
curl -s localhost:7715/audit?limit=20  # dernières décisions (allow + deny)
curl -s localhost:7715/posture         # taux de refus par raison, activité par acteur
```

Modifier une ligne du journal casse la chaîne au `seq` concerné et `verify` le signale : le journal
est vérifiable par un tiers, sans clé ni service externe.

### Dossiers analystes persistants

Dossiers avec statut, hypothèse, priorité et classification ; preuves stockées sous forme de
**références publiques + SHA-256 recalculable** ; chaîne de traçabilité complète ; export JSON et
Markdown. Routes : `/api/cases`, `/api/cases/{id}`, `/api/cases/{id}/evidence`,
`/api/cases/{id}/export?format=md`, `/api/cases/generate`.

### Graphe de connaissances

Fusion réelle de l'aviation, des zones de risque, des sites critiques, des indicateurs cyber, de la
posture stratégique et de la couche de corrélation. Relations calculées (distances haversine réelles),
pivots d'entités, filtrage par clearance **sur les données** et `degraded` explicite quand une source
ne répond pas. Outil **GRAPHE** du rail, ou `/api/graph`, `/api/graph/entity/{id}`, `/api/graph/search`.

### Souveraineté

`/sovereignty` affiche l'audit des dépendances externes **calculé en scannant le code** :

```bash
npm run audit:deps     # régénère docs/dependency-audit.json
```

Nombre d'hôtes par juridiction, hôtes hors UE triés par occurrences, fichiers concernés, table de
classification complète et état du journal — de quoi étayer (ou contester) l'argument souverain.

### Ports ajoutés

| Port | Service |
|---|---|
| 7715 | pandora-governance (ABAC + journal d'audit) |

---

## 🛡️ Sécurité & éthique

Pandora est un outil d'analyse de sources ouvertes. Utilise-le uniquement pour :

- veille défensive ;
- recherche OSINT légitime ;
- analyse de risques ;
- supervision de crise ;
- apprentissage et prototypage.

Pandora ne doit pas servir à :

- cibler des individus ;
- accéder à des caméras privées ;
- contourner des protections ;
- scanner des systèmes sans autorisation ;
- conduire des opérations offensives.

Les modules RECON doivent être utilisés uniquement sur des actifs que tu possèdes ou pour lesquels tu as une autorisation explicite.

---

## 🗺️ Roadmap possible

La feuille de route priorisée et l'audit initial de la direction artistique sont dans [`docs/VISION-PRODUIT.md`](docs/VISION-PRODUIT.md).

- mode timeline / replay d'événements ;
- export PDF de briefing ;
- profils de missions sauvegardés ;
- enrichissement STIX / TAXII ;
- connecteurs MISP / OpenCTI ;
- mode offline / cache local ;
- scoring IA configurable ;
- dashboard multi-écrans pour SOC / veille crise.

---

## 📄 Licence

Distribué sous licence **MIT**. Voir [LICENSE](LICENSE).

---

<div align="center">

### ⬡ Pandora

**Observe. Corrèle. Comprends.**

Built with ❤️ by [simplifaisoul](https://github.com/simplifaisoul)

[Discord](https://discord.gg/umBykEpb98) · [Issues](https://github.com/simplifaisoul/Pandora/issues) · [Docker guide](DOCKER.md)

</div>
