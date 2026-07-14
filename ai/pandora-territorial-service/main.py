import os, json, math
from datetime import datetime, timezone
from typing import Any
from urllib.request import urlopen, Request

from fastapi import FastAPI

try:
    from sources import RISK_WEIGHTS, SEVERITY_SCORE, LEVEL_THRESHOLDS, RISK_GRID, score_to_level
except Exception:
    from .sources import RISK_WEIGHTS, SEVERITY_SCORE, LEVEL_THRESHOLDS, RISK_GRID, score_to_level

APP_NAME = "Pandora Territorial Risk Engine"
SERVICE_URLS = {
    "cyberdef": os.getenv("PANDORA_CYBERDEF_URL", "http://pandora-cyberdef:7711").rstrip("/"),
    "aerospace": os.getenv("PANDORA_AEROSPACE_URL", "http://pandora-aerospace:7713").rstrip("/"),
    "dgsi": os.getenv("PANDORA_DGSI_URL", "http://pandora-dgsi:7712").rstrip("/"),
}
app = FastAPI(title=APP_NAME, version="0.1.0")

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _fetch_json(url: str, timeout: int = 8) -> dict | None:
    try:
        req = Request(url, headers={"User-Agent": "Pandora-Territorial/1.0", "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except: return None

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

@app.get("/health")
async def health():
    return {
        "status": "ok", "service": APP_NAME, "timestamp": now(),
        "gridZones": len(RISK_GRID),
        "upstreams": {k: "configured" if v else "missing" for k, v in SERVICE_URLS.items()},
    }

@app.get("/risk-score")
async def risk_score(lat: float = 48.8566, lng: float = 2.3522):
    """Compute unified risk score for a specific coordinate by polling upstream services."""
    drivers: dict[str, Any] = {}
    total_score = 0

    # 1. CyberDef posture
    cyber = _fetch_json(f"{SERVICE_URLS['cyberdef']}/cyber-posture", timeout=6)
    if cyber:
        posture = cyber.get("posture", {})
        cyber_score = posture.get("score", 0) if isinstance(posture, dict) else 0
        drivers["cyber"] = {"score": cyber_score, "source": "pandora-cyberdef"}
        total_score += cyber_score * RISK_WEIGHTS.get("cyber", 0.25)

    # 2. Aerospace anomalies
    aero = _fetch_json(f"{SERVICE_URLS['aerospace']}/airspace?lat={lat}&lng={lng}&radius_km=200", timeout=10)
    if aero:
        total_ac = aero.get("total", 0)
        ac = aero.get("aircraft", [])
        mil_count = sum(1 for a in ac if a.get("is_military"))
        aero_score = min(100, mil_count * 8 + (total_ac / 5))
        drivers["aerospace"] = {"score": round(aero_score), "total": total_ac, "military": mil_count}
        total_score += aero_score * RISK_WEIGHTS.get("aerospace", 0.15)

    # 3. DGSI zones near this location
    dgsi = _fetch_json(f"{SERVICE_URLS['dgsi']}/dashboard", timeout=6)
    if dgsi:
        zones = dgsi.get("zones", [])
        nearby = [z for z in zones if haversine_km(lat, lng, z["lat"], z["lng"]) < z.get("radius_km", 5) + 200]
        priority_map = {"critical": 100, "high": 60, "medium": 30, "low": 10}
        dgsi_score = max((priority_map.get(z.get("priority", "low"), 0) for z in nearby), default=0)
        drivers["dgsi"] = {"score": dgsi_score, "nearby_zones": len(nearby)}
        total_score += dgsi_score * RISK_WEIGHTS.get("dgsi", 0.15)

    # 4. Natural risk (earthquakes/fires — always computed if high)
    natural_event = _fetch_json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson", timeout=6)
    quake_risk = 0
    if natural_event:
        for f in (natural_event.get("features") or []):
            coords = f.get("geometry", {}).get("coordinates", [0, 0])
            d = haversine_km(lat, lng, coords[1], coords[0])
            mag = f.get("properties", {}).get("mag", 0)
            if d < 500 and mag >= 5:
                quake_risk = max(quake_risk, min(100, int(mag * 12)))
    drivers["natural"] = {"score": quake_risk, "nearby_quakes": quake_risk > 0}
    total_score += quake_risk * RISK_WEIGHTS.get("natural", 0.20)

    final_score = min(100, max(0, round(total_score)))
    level_info = score_to_level(final_score)

    return {
        "mode": "pandora-territorial-risk",
        "generatedAt": now(),
        "coords": {"lat": lat, "lng": lng},
        "globalScore": final_score,
        "level": level_info["level"],
        "color": level_info["color"],
        "drivers": drivers,
    }

@app.get("/risk-map")
async def risk_map():
    """Compute risk for all predefined grid zones."""
    zones = []
    for zone in RISK_GRID:
        # For grid, we fetch only cyber + dgsi (fast) for the zone center
        cyber = _fetch_json(f"{SERVICE_URLS['cyberdef']}/cyber-posture", timeout=5)
        dgsi = _fetch_json(f"{SERVICE_URLS['dgsi']}/zones", timeout=5)

        cyber_score = 0
        if cyber:
            posture = cyber.get("posture", {})
            cyber_score = posture.get("score", 0) if isinstance(posture, dict) else 0

        dgsi_score = 0
        if dgsi:
            nearby = [z for z in dgsi.get("zones", [])
                      if haversine_km(zone["lat"], zone["lng"], z["lat"], z["lng"]) < zone["radius_km"] + 200]
            pmap = {"critical": 100, "high": 60, "medium": 30, "low": 10}
            dgsi_score = max((pmap.get(z.get("priority", "low"), 0) for z in nearby), default=0)

        score = min(100, round(
            cyber_score * RISK_WEIGHTS.get("cyber", 0.25) +
            dgsi_score * RISK_WEIGHTS.get("dgsi", 0.15) +
            10  # baseline
        ))
        level_info = score_to_level(score)

        zones.append({
            "name": zone["name"],
            "lat": zone["lat"],
            "lng": zone["lng"],
            "score": score,
            "level": level_info["level"],
            "color": level_info["color"],
            "drivers": {"cyber": cyber_score, "dgsi": dgsi_score},
        })

    global_score = round(sum(z["score"] for z in zones) / len(zones)) if zones else 0
    return {
        "mode": "pandora-territorial-risk-map",
        "generatedAt": now(),
        "globalScore": global_score,
        "level": score_to_level(global_score)["level"],
        "totalZones": len(zones),
        "zones": sorted(zones, key=lambda z: -z["score"]),
    }

@app.get("/timeline")
async def timeline(days: int = 7):
    """Risk timeline (sampled — real would store history in DB)."""
    return {
        "mode": "pandora-territorial-timeline",
        "note": "Persistent timeline requires database storage",
        "days": days,
        "generatedAt": now(),
        "dataPoints": [
            {"date": "2026-07-08", "score": 42, "level": "WATCH"},
            {"date": "2026-07-09", "score": 38, "level": "WATCH"},
            {"date": "2026-07-10", "score": 45, "level": "WATCH"},
            {"date": "2026-07-11", "score": 51, "level": "ELEVATED"},
            {"date": "2026-07-12", "score": 47, "level": "WATCH"},
            {"date": "2026-07-13", "score": 53, "level": "ELEVATED"},
            {"date": "2026-07-14", "score": 58, "level": "ELEVATED"},
        ],
    }

@app.get("/hotspots")
async def hotspots():
    """Current risk hotspots from grid."""
    risk_data = await risk_map()
    hot = [z for z in risk_data.get("zones", []) if z["score"] >= 40]
    return {
        "mode": "pandora-territorial-hotspots",
        "generatedAt": now(),
        "total": len(hot),
        "hotspots": hot,
    }
