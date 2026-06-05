import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI


APP_NAME = "Pandora Alerts Service"
PANDORA_DIGEST_URL = os.getenv("PANDORA_DIGEST_URL", "http://pandora-digest:7702").rstrip("/")

app = FastAPI(title=APP_NAME, version="0.1.0")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def alert_level(severity: str, confidence: float) -> str:
    if severity == "critical" and confidence >= 80:
        return "critical"
    if severity in {"critical", "high"}:
        return "high"
    if severity == "medium":
        return "medium"
    return "low"


def build_alerts(digest: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    items = digest.get("priorityItems") if isinstance(digest.get("priorityItems"), list) else []

    for index, item in enumerate(items[:30]):
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity") or "medium").lower()
        confidence = float(item.get("confidence") or 0)
        category = str(item.get("category") or "General")
        level = alert_level(severity, confidence)

        if level == "low":
            continue

        reasons = []
        if severity in {"critical", "high"}:
            reasons.append(f"Signal severity is {severity}")
        if confidence >= 80:
            reasons.append(f"High confidence ({round(confidence)}%)")
        if category in {"Cyber", "Natural Hazard", "Geopolitical", "Space Weather / GNSS"}:
            reasons.append(f"Priority category: {category}")

        alerts.append({
            "id": f"alert-{item.get('id') or index}",
            "level": level,
            "status": "open",
            "title": item.get("title") or "Pandora alert",
            "category": category,
            "source": item.get("source") or "Pandora Digest",
            "timestamp": item.get("timestamp") or digest.get("generatedAt") or now_iso(),
            "location": item.get("location"),
            "url": item.get("url"),
            "confidence": confidence,
            "reasons": reasons or ["Matched Pandora alerting rules"],
            "recommendedAction": recommended_action(category, level),
            "digestItem": item,
        })

    # Global posture alert.
    risk = int(digest.get("riskScore") or 0)
    posture = str(digest.get("posture") or "ROUTINE")
    if risk >= 60:
        alerts.insert(0, {
            "id": f"global-posture-{digest.get('generatedAt', now_iso())}",
            "level": "critical" if risk >= 80 else "high",
            "status": "open",
            "title": f"Global posture {posture} — risk score {risk}/100",
            "category": "Global Posture",
            "source": "Pandora Digest",
            "timestamp": digest.get("generatedAt") or now_iso(),
            "confidence": 90,
            "reasons": ["Digest risk score crossed alert threshold", f"Posture: {posture}"],
            "recommendedAction": "Review top priority items and confirm primary sources before operational decisions.",
        })

    return alerts[:25]


def recommended_action(category: str, level: str) -> str:
    if category == "Cyber":
        return "Check affected assets, prioritize KEV/CVE exposure, and prepare a defensive mitigation note."
    if category == "Natural Hazard":
        return "Cross-check impacted infrastructure, ports, flights, weather and local public authority feeds."
    if category == "Geopolitical":
        return "Open a regional dossier and validate with independent news or government sources."
    if category == "Space Weather / GNSS":
        return "Monitor GNSS/HF-radio degradation and compare with NOAA SWPC updates."
    return "Review the signal, confirm sources, and create an analyst case if it persists."


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": APP_NAME,
        "digest_url": PANDORA_DIGEST_URL,
        "timestamp": now_iso(),
    }


@app.get("/alerts")
async def alerts() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=35) as client:
        response = await client.get(f"{PANDORA_DIGEST_URL}/digest", headers={"User-Agent": "Pandora-Alerts-Service/1.0"})
        response.raise_for_status()
        digest = response.json()

    alert_rows = build_alerts(digest if isinstance(digest, dict) else {})
    counts: dict[str, int] = {}
    for alert in alert_rows:
        counts[alert["level"]] = counts.get(alert["level"], 0) + 1

    return {
        "mode": "pandora-alerts-service",
        "generatedAt": now_iso(),
        "total": len(alert_rows),
        "counts": counts,
        "alerts": alert_rows,
        "sourceDigest": {
            "posture": digest.get("posture"),
            "riskScore": digest.get("riskScore"),
            "generatedAt": digest.get("generatedAt"),
            "mode": digest.get("mode"),
        },
    }