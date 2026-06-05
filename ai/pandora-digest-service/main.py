import os
import re
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from fastapi import FastAPI


APP_NAME = "Pandora Digest Service"
PANDORA_BASE_URL = os.getenv("PANDORA_BASE_URL", "http://pandora:3000").rstrip("/")

Severity = Literal["critical", "high", "medium", "low"]

SEVERITY_WEIGHT: dict[Severity, int] = {
    "critical": 100,
    "high": 75,
    "medium": 45,
    "low": 20,
}

app = FastAPI(title=APP_NAME, version="0.1.0")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def clean(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return (
        text.replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .strip()
    )


def safe_date(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        try:
            # Pandora/USGS timestamps are usually milliseconds.
            ts = value / 1000 if value > 10_000_000_000 else value
            return datetime.fromtimestamp(ts, timezone.utc).isoformat()
        except Exception:
            return None
    try:
        text = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(text).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def normalize_severity(value: Any, fallback: Severity = "medium") -> Severity:
    text = str(value or "").lower()
    try:
        score = float(value or 0)
    except Exception:
        score = 0
    if score >= 9 or re.search(r"critical|severe|red|ransomware|exploited|missile|strike|tsunami|magnitude 7|m7\b", text):
        return "critical"
    if score >= 7 or re.search(r"high|orange|war|attack|drone|wildfire|earthquake|malware|cve|kev", text):
        return "high"
    if score >= 4 or re.search(r"medium|watch|yellow|flood|storm|protest|phishing|suspicious", text):
        return "medium"
    if re.search(r"low|green|minor", text):
        return "low"
    return fallback


async def fetch_json(client: httpx.AsyncClient, path: str, timeout: float = 9.0) -> dict[str, Any]:
    response = await client.get(f"{PANDORA_BASE_URL}{path}", timeout=timeout, headers={"User-Agent": "Pandora-Digest-Service/1.0"})
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, dict) else {}


def dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in items:
        key = re.sub(r"[^a-z0-9]+", " ", f"{item.get('category')}:{item.get('title')}".lower()).strip()[:140]
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def rank_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def score(item: dict[str, Any]) -> tuple[int, float]:
        severity = item.get("severity") if item.get("severity") in SEVERITY_WEIGHT else "medium"
        timestamp = item.get("timestamp") or ""
        try:
            parsed = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00")).timestamp()
        except Exception:
            parsed = 0
        return (SEVERITY_WEIGHT[severity], parsed)

    return sorted(items, key=score, reverse=True)


def build_markdown(digest: dict[str, Any]) -> str:
    lines = [
        "# PANDORA THREAT INTEL DIGEST",
        "",
        f"Generated: {digest['generatedAt']}",
        f"Posture: {digest['posture']} ({digest['riskScore']}/100)",
        "",
        "## Executive summary",
    ]
    lines += [f"- {line}" for line in digest.get("executiveSummary", [])]
    lines += ["", "## Priority items"]
    for index, item in enumerate(digest.get("priorityItems", []), start=1):
        lines.append(f"{index}. **[{str(item.get('severity', 'medium')).upper()}] {item.get('title')}**")
        lines.append(f"   - Category: {item.get('category')}")
        lines.append(f"   - Source: {item.get('source')}")
        if item.get("location"):
            lines.append(f"   - Location: {item.get('location')}")
        if item.get("timestamp"):
            lines.append(f"   - Time: {item.get('timestamp')}")
        if item.get("url"):
            lines.append(f"   - URL: {item.get('url')}")
    lines += ["", "## Recommended analyst actions"]
    lines += [f"{index}. {action}" for index, action in enumerate(digest.get("recommendedActions", []), start=1)]
    lines += ["", "## Source health"]
    for source in digest.get("sourceStatus", []):
        status = "OK" if source.get("ok") else "ERR"
        suffix = f" ({source.get('error')})" if source.get("error") else ""
        lines.append(f"- {status} {source.get('label')}: {source.get('count', 0)}{suffix}")
    lines += ["", "> Defensive OSINT digest generated from public/open sources. Validate primary sources before operational decisions."]
    return "\n".join(lines)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": APP_NAME,
        "pandora_base_url": PANDORA_BASE_URL,
        "timestamp": now_iso(),
    }


@app.get("/digest")
async def digest() -> dict[str, Any]:
    source_status: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        results = await asyncio_gather_dicts(client)

    cyber = results.get("cyber")
    if cyber.get("ok"):
        threats = as_list(cyber.get("data", {}).get("threats"))[:80]
        source_status.append({"key": "cyber", "label": "Cyber Threats", "ok": True, "count": len(threats)})
        for index, threat in enumerate(threats):
            details = threat.get("details") if isinstance(threat, dict) else {}
            details = details if isinstance(details, dict) else {}
            items.append({
                "id": str(threat.get("id") or f"cyber-{index}"),
                "title": clean(threat.get("title") or "Cyber threat"),
                "category": "Cyber",
                "severity": normalize_severity(threat.get("severity"), "high"),
                "source": str(threat.get("source") or "Cyber feed"),
                "timestamp": safe_date(threat.get("timestamp")),
                "url": details.get("permalink") or details.get("url"),
                "summary": clean(details.get("shortDescription") or details.get("description") or details.get("excerpt") or ""),
                "confidence": 95 if threat.get("source") == "CISA KEV" else 75,
                "tags": ["cyber", str(threat.get("severity") or "").lower()],
            })
    else:
        source_status.append({"key": "cyber", "label": "Cyber Threats", "ok": False, "count": 0, "error": cyber.get("error")})

    gdelt = results.get("gdelt")
    if gdelt.get("ok"):
        data = gdelt.get("data", {})
        events = as_list(data.get("events"))[:80]
        source_status.append({"key": "gdelt", "label": "Global Incidents", "ok": True, "count": len(events)})
        for index, event in enumerate(events):
            items.append({
                "id": str(event.get("id") or f"gdelt-{index}"),
                "title": clean(event.get("name") or "Global incident"),
                "category": "Disaster / News" if event.get("type") == "disaster" else "Geopolitical",
                "severity": normalize_severity(event.get("name"), "medium"),
                "source": str(data.get("source") or "GDELT / RSS"),
                "timestamp": safe_date(event.get("published")),
                "location": f"{event.get('lat'):.2f}, {event.get('lng'):.2f}" if isinstance(event.get("lat"), (int, float)) and isinstance(event.get("lng"), (int, float)) else None,
                "url": event.get("url"),
                "summary": clean(event.get("html") or event.get("name") or ""),
                "confidence": 78 if "GDELT" in str(data.get("source")) else 62,
                "tags": ["news", str(event.get("type") or "incident")],
            })
    else:
        source_status.append({"key": "gdelt", "label": "Global Incidents", "ok": False, "count": 0, "error": gdelt.get("error")})

    quakes_result = results.get("earthquakes")
    if quakes_result.get("ok"):
        quakes = [q for q in as_list(quakes_result.get("data", {}).get("earthquakes")) if float(q.get("magnitude") or 0) >= 4.5][:40]
        source_status.append({"key": "earthquakes", "label": "USGS Earthquakes", "ok": True, "count": len(quakes)})
        for quake in quakes:
            magnitude = float(quake.get("magnitude") or 0)
            items.append({
                "id": str(quake.get("id") or f"quake-{magnitude}"),
                "title": f"M{magnitude:.1f} earthquake — {quake.get('place') or 'unknown location'}",
                "category": "Natural Hazard",
                "severity": "critical" if magnitude >= 6.5 else "high" if magnitude >= 5.5 else "medium",
                "source": "USGS",
                "timestamp": safe_date(quake.get("time")),
                "location": quake.get("place"),
                "url": quake.get("url"),
                "summary": f"Depth {round(float(quake.get('depth') or 0))}km" + (" · tsunami flag" if quake.get("tsunami") else ""),
                "confidence": 96,
                "tags": ["earthquake", f"m{int(magnitude)}"],
            })
    else:
        source_status.append({"key": "earthquakes", "label": "USGS Earthquakes", "ok": False, "count": 0, "error": quakes_result.get("error")})

    for key, label, path_key, category in [
        ("fires", "Active Fires", "fires", "Natural Hazard"),
        ("weather", "Severe Weather", "events", "Weather"),
    ]:
        result = results.get(key)
        if result.get("ok"):
            data = result.get("data", {})
            rows = as_list(data.get(path_key) or data.get("weather_events") or data.get("events"))[:30]
            source_status.append({"key": key, "label": label, "ok": True, "count": len(rows)})
            for index, row in enumerate(rows[:12]):
                items.append({
                    "id": str(row.get("id") or f"{key}-{index}"),
                    "title": clean(row.get("title") or row.get("name") or row.get("type") or label),
                    "category": category,
                    "severity": normalize_severity(row.get("severity") or row.get("title"), "medium"),
                    "source": str(row.get("source") or label),
                    "timestamp": safe_date(row.get("date") or row.get("time")),
                    "location": row.get("location") or (f"{row.get('lat'):.2f}, {row.get('lng'):.2f}" if isinstance(row.get("lat"), (int, float)) and isinstance(row.get("lng"), (int, float)) else None),
                    "url": row.get("url"),
                    "confidence": 70,
                    "tags": [key, str(row.get("type") or "alert")],
                })
        else:
            source_status.append({"key": key, "label": label, "ok": False, "count": 0, "error": result.get("error")})

    space = results.get("space_weather")
    if space.get("ok"):
        sw = space.get("data", {})
        kp = float(sw.get("kp_index") or sw.get("kp") or 0)
        source_status.append({"key": "space-weather", "label": "NOAA Space Weather", "ok": True, "count": 1 if kp else 0})
        if kp >= 4:
            items.append({
                "id": "space-weather-kp",
                "title": f"Geomagnetic activity elevated — Kp {kp:g}",
                "category": "Space Weather / GNSS",
                "severity": "critical" if kp >= 7 else "high" if kp >= 5 else "medium",
                "source": "NOAA SWPC",
                "timestamp": now_iso(),
                "summary": "Potential HF radio, aurora and GNSS degradation watch.",
                "confidence": 85,
                "tags": ["space-weather", "gnss"],
            })
    else:
        source_status.append({"key": "space-weather", "label": "NOAA Space Weather", "ok": False, "count": 0, "error": space.get("error")})

    priority_items = rank_items(dedupe(items))[:18]
    counts: dict[str, int] = {}
    for item in priority_items:
        counts[str(item.get("severity", "medium"))] = counts.get(str(item.get("severity", "medium")), 0) + 1
        counts[str(item.get("category", "Other"))] = counts.get(str(item.get("category", "Other")), 0) + 1

    divisor = max(1, min(len(priority_items), 10))
    risk_score = min(100, round(sum(SEVERITY_WEIGHT.get(item.get("severity", "medium"), 45) * (float(item.get("confidence") or 0) / 100) for item in priority_items) / divisor))
    posture = "CRITICAL" if risk_score >= 80 else "ELEVATED" if risk_score >= 60 else "WATCH" if risk_score >= 35 else "ROUTINE"
    dominant = sorted([(k, v) for k, v in counts.items() if k not in {"critical", "high", "medium", "low"}], key=lambda x: x[1], reverse=True)[:3]

    digest_payload: dict[str, Any] = {
        "mode": "pandora-digest-service",
        "generatedAt": now_iso(),
        "posture": posture,
        "riskScore": risk_score,
        "executiveSummary": [
            f"{len(priority_items)} signaux prioritaires retenus sur {len(items)} signaux collectés.",
            f"{counts.get('critical', 0)} critique(s), {counts.get('high', 0)} haut(s), {counts.get('medium', 0)} moyen(s).",
            "Dominantes: " + (" · ".join(f"{name} ({count})" for name, count in dominant) or "aucune dominance claire") + ".",
            f"Couverture sources: {sum(1 for s in source_status if s.get('ok'))}/{len(source_status)} connecteurs actifs.",
        ],
        "priorityItems": priority_items,
        "counts": counts,
        "recommendedActions": [
            f"Qualifier le signal prioritaire: “{priority_items[0].get('title')}”." if priority_items else "Activer davantage de sources pour densifier le digest.",
            "Comparer les signaux critiques avec au moins deux sources primaires avant décision.",
            "Vérifier exposition des actifs suivis et prioriser CISA KEV / CVE critiques." if counts.get("Cyber") else "Maintenir une veille cyber légère et surveiller CISA KEV.",
            "Croiser risques naturels avec infrastructures critiques, ports, vols et news locales." if counts.get("Natural Hazard") else "Surveiller les alertes naturelles en arrière-plan.",
            "Créer un dossier analyste si un même lieu ou thème persiste sur plusieurs cycles.",
        ],
        "sourceStatus": source_status,
        "markdown": "",
    }
    digest_payload["markdown"] = build_markdown(digest_payload)
    return digest_payload


async def asyncio_gather_dicts(client: httpx.AsyncClient) -> dict[str, dict[str, Any]]:
    import asyncio

    endpoints = {
        "cyber": ("/api/cyber-threats", 14.0),
        "gdelt": ("/api/gdelt", 9.0),
        "earthquakes": ("/api/earthquakes", 8.0),
        "fires": ("/api/fires", 8.0),
        "weather": ("/api/weather", 8.0),
        "space_weather": ("/api/space-weather", 8.0),
    }

    async def one(name: str, path: str, timeout: float) -> tuple[str, dict[str, Any]]:
        try:
            return name, {"ok": True, "data": await fetch_json(client, path, timeout)}
        except Exception as exc:
            return name, {"ok": False, "error": str(exc)}

    pairs = await asyncio.gather(*(one(name, path, timeout) for name, (path, timeout) in endpoints.items()))
    return dict(pairs)