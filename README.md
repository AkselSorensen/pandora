<div align="center">

# ⬡ Pandora

### AI-Augmented Open Source Intelligence & Reconnaissance Platform

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![MapLibre](https://img.shields.io/badge/MapLibre_GL-GPU_Rendered-396CB2?style=for-the-badge)](https://maplibre.org)
[![AI](https://img.shields.io/badge/Pandora_AI-Local_Briefing-7C3AED?style=for-the-badge)](ai/pandora-ai/README.md)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](DOCKER.md)

**Pandora is an AI-augmented OSINT dashboard that centralizes global signals, cyber threats, geospatial risk, aviation, maritime activity, critical infrastructure, live news, CCTV, satellite-ready data, and reconnaissance workflows into a single interactive intelligence interface.**

</div>

---

## Overview

Pandora is a real-time situational awareness and reconnaissance platform built around a GPU-rendered interactive map, modular intelligence layers, OSINT collection endpoints, cyber threat monitoring, and an optional local AI briefing service.

The project has evolved from a global map dashboard into a broader **OSINT fusion platform**. It now focuses on helping a user collect, visualize, prioritize, and explain open-source signals across several domains:

- geopolitical monitoring ;
- cyber threat intelligence ;
- country and infrastructure risk ;
- aviation and airbase observation ;
- maritime choke points and port intelligence ;
- live news and crisis monitoring ;
- CCTV and public camera feeds ;
- dark web / leak-oriented alerting concepts ;
- AI-assisted briefings and synthesis ;
- future satellite and space-data integration.

Pandora does **not** claim to replace human analysis. It provides a structured environment to observe signals, cross-reference them, and prepare a cautious briefing.

---

## 168H Project Documentation

The repository contains a dedicated 168H delivery folder:

```txt
168h/
├── README.md
├── fiche-projet-j7.md
├── volet-168h/
│   ├── architecture/
│   │   └── dossier-architecture.md
│   ├── preuves/
│   │   ├── dossier-preuves.md
│   │   └── journal-sprint.md
│   ├── prototype/
│   │   └── prototype.md
│   ├── soutenance/
│   │   ├── scenario-demo.md
│   │   └── support-soutenance.md
│   ├── charte-projet.md
│   ├── retour-experience.md
│   └── runbook-demo.md
└── volet-gpe/
```

The 168H part is centered on **Pandora** only. The GPE folder exists because the expected delivery architecture requires it, but it is not the current focus.

---

## Key Capabilities

| Domain | What Pandora Provides | Sources / Strategy |
|--------|------------------------|--------------------|
| **AI Briefing** | Local or service-based briefing assistant, synthesis and contextual summaries | `ai/pandora-ai`, `ai/pandora-ai-service` |
| **OSINT Hub** | Open-source collection workflows, scraping helpers and intelligence source aggregation | Internal OSINT modules, public sources |
| **Cyber Threats** | CVE/threat monitoring, cyber geolocation, threat radar, vulnerability-oriented views | NVD, public cyber feeds, internal enrichment |
| **Dark Web Monitoring** | Alerting-oriented dark web monitoring concepts and Tor scraper module | Tor/publicly accessible sources where legally allowed |
| **Recon Playbooks** | Guided reconnaissance workflows for investigation scenarios | Internal playbooks API |
| **Aviation** | Flights, airbases, French airbases and AIP briefing-oriented data | OpenSky-ready, static/open aviation data |
| **Maritime** | Global ports, chokepoints, maritime intelligence and strategic sea lanes | Static naval intel, AIS-ready architecture |
| **Country Risk** | Country-level risk and geospatial risk visualization | Public/open risk indicators, internal scoring |
| **Critical Infrastructure** | OSM-based critical infrastructure and sensitive points of interest | OpenStreetMap / Overpass-style data |
| **News / GDELT** | Live news, world events and international media context | RSS, GDELT, public broadcasters |
| **CCTV** | Public camera feeds and transport cameras | TfL, WSDOT, Caltrans, NYC DOT, VicRoads, public JSON sources |
| **Natural Events** | Earthquakes, fires, weather and environmental alerts | USGS, NASA FIRMS, NASA EONET, NOAA-ready |
| **Space / Satellite Roadmap** | Satellite object tracking and future satellite imagery/open data integration | CelesTrak, NOAA, Sentinel/Copernicus, NASA |

---

## Architecture

Pandora is organized as a modular intelligence platform. The frontend displays the map, panels and operational views. The API layer collects and normalizes data from domain-specific services. Optional AI services can generate briefings or summaries from selected signals.

```mermaid
flowchart TB
    User[User / Analyst / Demo Jury]

    subgraph Frontend[Pandora Frontend]
        Dashboard[Global Dashboard]
        Map[MapLibre Interactive Map]
        Layers[Intelligence Layers]
        Panels[OSINT / Cyber / Ops Panels]
        AIUI[AI Briefing UI]
    end

    subgraph API[Next.js API Layer]
        Flights[/api/flights]
        Maritime[/api/maritime]
        CCTV[/api/cctv]
        News[/api/live-news + /api/gdelt]
        Cyber[/api/cyber-threats + /api/cyber-geo]
        OSINT[/api/osint]
        DarkWeb[/api/darkweb-alerts]
        Playbooks[/api/playbooks]
        Risk[/api/country-risk-geo]
        Infra[/api/osm-critical]
        AIP[/api/aip/briefing]
        Airbases[/api/airbases + /api/french-airbases]
    end

    subgraph AI[Pandora AI]
        LocalModel[Custom Modelfile]
        Training[Training Dataset]
        AIService[FastAPI AI Service]
    end

    subgraph Sources[Open / External Sources]
        PublicAPIs[Public APIs]
        RSS[RSS / News Feeds]
        GDELT[GDELT]
        NVD[NVD / CVE Data]
        OSM[OpenStreetMap]
        NASA[NASA FIRMS / EONET]
        NOAA[NOAA / Space Weather]
        CelesTrak[CelesTrak]
        Cameras[Public CCTV Feeds]
    end

    User --> Dashboard
    Dashboard --> Map
    Dashboard --> Layers
    Dashboard --> Panels
    Dashboard --> AIUI

    Dashboard --> API
    API --> Flights
    API --> Maritime
    API --> CCTV
    API --> News
    API --> Cyber
    API --> OSINT
    API --> DarkWeb
    API --> Playbooks
    API --> Risk
    API --> Infra
    API --> AIP
    API --> Airbases

    AIUI --> AIService
    AIService --> LocalModel
    Training --> LocalModel

    API --> PublicAPIs
    News --> RSS
    News --> GDELT
    Cyber --> NVD
    Infra --> OSM
    CCTV --> Cameras
    Risk --> PublicAPIs
    Maritime --> PublicAPIs
    Flights --> PublicAPIs
    API --> NASA
    API --> NOAA
    API --> CelesTrak
```

---

## Current Feature Set

### Global Intelligence Map

- GPU-rendered map using MapLibre GL.
- Layer-based display for multiple intelligence domains.
- Progressive loading strategy to avoid unnecessary requests.
- Entity counts and contextual panels.
- Designed for live demonstration and situational awareness.

### OSINT & Reconnaissance

- OSINT hub components and API routes.
- Scraper modules for open-source collection workflows.
- Recon playbooks for guided investigation scenarios.
- Advanced operations panel for combining multiple sources.
- Structured intelligence source definitions in `src/lib/intel-sources.ts`.

### Cyber Intelligence

- Cyber threat radar component.
- Cyber threat API route.
- Cyber geolocation route.
- Country risk geospatial view.
- CVE and vulnerability-oriented monitoring strategy.
- Recon workflows for DNS, WHOIS, SSL/TLS, IP intelligence and scanner integration.

### Dark Web / Leak Monitoring Concepts

- Dark web monitor component.
- Dark web alert API route.
- Tor scraper module.
- Intended for legal, defensive and demonstrative monitoring only.

### AI-Augmented Analysis

Pandora includes a dedicated AI folder:

```txt
ai/
├── pandora-ai/
│   ├── Modelfile
│   ├── README.md
│   └── train.jsonl
└── pandora-ai-service/
    ├── Dockerfile
    ├── main.py
    └── requirements.txt
```

Planned / supported AI use cases:

- generate a short briefing from selected map signals ;
- summarize a situation by zone ;
- explain visible indicators in simple language ;
- help prepare a 168H demo narrative ;
- highlight uncertainty and limits ;
- avoid replacing human analysis.

### Aviation and Airbase Intelligence

- Flight API route.
- Airbases route.
- French airbases route.
- AIP briefing route.
- Designed to support aviation context and demonstration scenarios.

### Maritime Intelligence

- Maritime route with ports and chokepoints.
- Strategic maritime context.
- AIS-ready environment variable support for future live vessel data.

### News, GDELT and Live Media

- Live news API route.
- GDELT API route.
- 24/7 news stream strategy.
- Used to connect map signals with media context.

### CCTV and Public Cameras

- Public CCTV source file in `public/cctv-sources.json`.
- CCTV API route.
- Public transport and road camera strategy.

### Infrastructure and Country Risk

- OSM critical infrastructure route.
- Country risk geospatial route.
- Risk mapping and critical points of interest.

### Satellite / Space Roadmap

Pandora is prepared to evolve toward satellite-enabled OSINT using open sources:

- NASA FIRMS for fire hotspots ;
- NASA EONET for natural events ;
- NOAA for weather / space weather ;
- CelesTrak for satellite tracking ;
- Sentinel / Copernicus or Sentinel Hub for imagery where credentials and access allow it.

Pandora does not control satellites. It can consume open satellite data or public APIs to enrich the intelligence picture.

---

## 168H Roadmap Summary

During the 168H sprint, the planned evolution is:

1. define Pandora as the main 168H module ;
2. strengthen the AI briefing concept ;
3. increase the amount of usable OSINT data ;
4. connect or prepare real public satellite data sources ;
5. create multi-source fusion and prioritization ;
6. stabilize a demo mode ;
7. present architecture, evidence and limitations.

See:

- [`168h/fiche-projet-j7.md`](168h/fiche-projet-j7.md)
- [`168h/volet-168h/architecture/dossier-architecture.md`](168h/volet-168h/architecture/dossier-architecture.md)
- [`168h/volet-168h/preuves/journal-sprint.md`](168h/volet-168h/preuves/journal-sprint.md)

---

## Quick Start

```bash
git clone https://github.com/AkselSorensen/pandora.git
cd pandora
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Docker / Self-Hosting

```bash
cp .env.template .env
Docker compose up -d
```

If your shell is case-sensitive, use:

```bash
docker compose up -d
```

The application listens on container port `3000`.

Custom host port:

```env
Pandora_PORT=3000
```

See [`DOCKER.md`](DOCKER.md) for Docker, CasaOS and deployment details.

---

## Environment Variables

Copy `.env.template` to `.env` and configure only what you need.

```env
# Published host port
Pandora_PORT=3000

# Scanner backend
SCANNER_URL=
SCANNER_KEY=

# Optional / future higher limits
FIRMS_API_KEY=
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=
AIS_API_KEY=

# AI service, if enabled by your local setup
PANDORA_AI_URL=
PANDORA_AI_KEY=
```

Notes:

- Many Pandora layers can work with public or static data.
- Some sources require API keys for higher limits or live access.
- Scanner and AI services are optional depending on the deployment.
- `.env` must stay private and should not be committed.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16, App Router |
| Language | TypeScript 5 |
| Map Engine | MapLibre GL JS / WebGL |
| UI | React components, custom CSS system |
| Animations | Framer Motion |
| Icons | Lucide React |
| AI Service | Python / FastAPI-ready service |
| AI Model Packaging | Ollama-style Modelfile |
| Deployment | Docker, Vercel-ready configuration |
| Data Strategy | Public APIs, static datasets, RSS, OSINT sources |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F` | Toggle flight layers |
| `E` | Toggle earthquakes |
| `S` | Toggle satellites / space-related layers |
| `D` | Toggle day/night cycle |
| `Escape` | Close panels |

---

## Responsible Use

Pandora is designed for educational, defensive and demonstrative OSINT workflows.

Do not use it to:

- access private systems without authorization ;
- collect private or sensitive personal data ;
- present public signals as confirmed intelligence without verification ;
- automate operational decisions ;
- bypass legal or ethical constraints.

All AI outputs and OSINT signals should be reviewed by a human analyst.

---

## License

MIT — see [`LICENSE`](LICENSE) if present in your distribution.

---

<div align="center">

**Pandora — AI-augmented OSINT, reconnaissance and global situational awareness.**

</div>
