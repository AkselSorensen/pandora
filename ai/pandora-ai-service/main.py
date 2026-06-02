import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field


APP_NAME = "Pandora AI Service"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "pandora-ai")

app = FastAPI(title=APP_NAME, version="0.1.0")


class BriefingRequest(BaseModel):
    snapshot: dict[str, Any] = Field(default_factory=dict)
    note: str = ""
    max_tokens: int = 900


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def local_briefing(snapshot: dict[str, Any], note: str = "") -> str:
    anomalies = as_list(snapshot.get("topAnomalies"))
    hotspots = as_list(snapshot.get("topHotspots"))
    sources = as_list(snapshot.get("sourceHealth"))
    timeline = as_list(snapshot.get("timeline"))
    active = [s for s in sources if float(s.get("rows") or 0) > 0]
    rows = sum(float(s.get("rows") or 0) for s in sources if isinstance(s, dict))
    posture = snapshot.get("posture", "UNKNOWN")
    score = round(float(snapshot.get("score") or 0))

    top_sources = " · ".join(
        f"{s.get('label') or s.get('key')}: {s.get('rows')}"
        for s in sorted(active, key=lambda s: float(s.get("rows") or 0), reverse=True)[:5]
        if isinstance(s, dict)
    ) or "aucune source active"

    anomaly_lines = []
    for i, anomaly in enumerate(anomalies[:5], start=1):
        if not isinstance(anomaly, dict):
            continue
        anomaly_lines.append(
            f"{i}. [{anomaly.get('level', 'WATCH')} {round(float(anomaly.get('score') or 0))}/100] "
            f"{anomaly.get('title', 'Anomalie')} — {anomaly.get('explanation', 'Signal à qualifier.')}"
        )

    hotspot_lines = []
    for i, hotspot in enumerate(hotspots[:5], start=1):
        if not isinstance(hotspot, dict):
            continue
        drivers = hotspot.get("drivers") if isinstance(hotspot.get("drivers"), list) else []
        hotspot_lines.append(
            f"{i}. {hotspot.get('label', 'Zone')} — {hotspot.get('level', 'WATCH')} "
            f"{round(float(hotspot.get('score') or 0))}/100 · drivers: {', '.join(map(str, drivers)) or 'N/A'}"
        )

    timeline_lines = []
    for i, event in enumerate(timeline[:6], start=1):
        if not isinstance(event, dict):
            continue
        timeline_lines.append(
            f"{i}. {event.get('timestamp', '--')} · {event.get('type', 'entity')} · "
            f"{event.get('label', 'Signal')} · risque {round(float(event.get('risk') or 0))}"
        )

    recommendations = [
        "Vérifier les sources primaires avant décision opérationnelle.",
        "Créer une watchlist sur les zones, ports, infrastructures ou navires associés aux signaux persistants.",
        "Comparer les couches GDELT, maritime, cyber, météo et infrastructure pour confirmer la corrélation.",
    ]
    if hotspots:
        first_hotspot = hotspots[0] if isinstance(hotspots[0], dict) else {}
        recommendations.insert(1, f"Zoomer sur {first_hotspot.get('label', 'la zone principale')} et ouvrir un dossier région.")

    return "\n\n".join([
        "# BRIEFING PANDORA AI — LOCAL FALLBACK",
        f"## 1. Posture globale\nPosture {posture}, score fusion {score}/100. "
        f"{len(active)}/{len(sources)} sources actives, {int(rows)} signaux observés.",
        f"## 2. Sources dominantes\n{top_sources}",
        "## 3. Signaux prioritaires\n" + ("\n".join(anomaly_lines) or "Aucune anomalie prioritaire exploitable."),
        "## 4. Zones chaudes\n" + ("\n".join(hotspot_lines) or "Aucun hotspot robuste détecté."),
        "## 5. Timeline récente\n" + ("\n".join(timeline_lines) or "Aucun événement horodaté exploitable."),
        "## 6. Recommandations analyste\n" + "\n".join(f"{i}. {r}" for i, r in enumerate(recommendations, start=1)),
        "## 7. Cadre légal\nAnalyse défensive sur sources publiques/données fournies. Pas d'accès privé, pas d'action offensive. "
        + (f"Question opérateur: {note}" if note else ""),
    ])


def build_prompt(snapshot: dict[str, Any], note: str) -> str:
    return f"""
Tu es Pandora AI, assistant analyste OSINT défensif.

Tâche: produire un briefing en français, structuré, concis et opérationnel.

Tu peux analyser légalement des données publiques: GDELT/news, AIS maritime public, dark vessels heuristiques,
cyber threat intelligence publique, météo, séismes, infrastructures critiques publiques, CCTV publiques/external-only.

Interdits: instructions offensives, intrusion, contournement, accès privé, caméras privées, piratage.
Si un point est incertain, signale l'incertitude et demande confirmation par sources primaires.

Question opérateur: {note or 'Briefing global'}

Snapshot JSON compact:
{snapshot}
""".strip()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": APP_NAME,
        "model": OLLAMA_MODEL,
        "ollama_base_url": OLLAMA_BASE_URL,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/briefing")
async def briefing(payload: BriefingRequest) -> dict[str, Any]:
    prompt = build_prompt(payload.snapshot, payload.note[:1000])
    try:
        async with httpx.AsyncClient(timeout=35) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt[:18000],
                    "stream": False,
                    "options": {"temperature": 0.25, "top_p": 0.85, "num_predict": payload.max_tokens},
                },
            )
            response.raise_for_status()
            data = response.json()
            text = str(data.get("response") or "").strip()
            if text:
                return {
                    "mode": "pandora-ai-service",
                    "model": OLLAMA_MODEL,
                    "briefing": text,
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                }
    except Exception as exc:
        return {
            "mode": "pandora-ai-service-fallback",
            "model": OLLAMA_MODEL,
            "briefing": local_briefing(payload.snapshot, payload.note),
            "warning": str(exc),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

    return {
        "mode": "pandora-ai-service-fallback",
        "model": OLLAMA_MODEL,
        "briefing": local_briefing(payload.snapshot, payload.note),
        "warning": "empty model response",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
