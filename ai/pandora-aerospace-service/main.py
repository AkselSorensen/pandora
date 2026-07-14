import os, re, json, asyncio, math
from datetime import datetime, timezone
from typing import Any
from collections import Counter
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import URLError

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from sources import (
        AEROSPACE_SOURCES, REGIONS, STRATEGIC_AIRBASES,
        classify_aircraft, source_registry_summary
    )
except Exception:
    from .sources import (
        AEROSPACE_SOURCES, REGIONS, STRATEGIC_AIRBASES,
        classify_aircraft, source_registry_summary
    )

# ── Config ──
APP_NAME = "Pandora Aerospace Service"
DEFAULT_TIMEOUT = float(os.getenv("PANDORA_AEROSPACE_TIMEOUT", "8"))
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "pandora-ai")
ENABLE_AI = os.getenv("PANDORA_AEROSPACE_AI_ENABLED", "true").lower() not in {"0", "false", "no", "off"}

app = FastAPI(title=APP_NAME, version="0.1.0")

# ── Models ──
class AnalyzeFlightRequest(BaseModel):
    icao24: str = Field("", description="ICAO 24-bit transponder address")
    callsign: str = Field("", description="Flight callsign")
    lat: float = Field(0, ge=-90, le=90)
    lng: float = Field(0, ge=-180, le=180)

class ZoneQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius_km: int = Field(100, ge=10, le=500)

# ── Helpers ──
def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def as_list(v: Any) -> list:
    return v if isinstance(v, list) else []

def clamp(v: float, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, round(v)))

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# ── ADSB.lol fetcher (urllib — httpx ne passe pas sur Docker Windows) ──
async def fetch_all_aircraft() -> list[dict]:
    """Fetch from ADSB.lol (6 regions) and OpenSky in parallel for speed."""
    loop = asyncio.get_event_loop()
    seen = set()
    all_ac = []

    # Launch ADSB.lol + OpenSky in parallel
    async def fetch_opensky():
        try:
            req = Request("https://opensky-network.org/api/states/all",
                          headers={"User-Agent": "Pandora-Aerospace/1.0", "Accept": "application/json"})
            with urlopen(req, timeout=8) as r:
                data = json.loads(r.read())
                return data.get("states") or []
        except: return []

    def _fetch_adsb(region):
        url = f"https://api.adsb.lol/v2/lat/{region['lat']}/lon/{region['lon']}/dist/{region['dist']}"
        try:
            req = Request(url, headers={"User-Agent": "Pandora-Aerospace/1.0", "Accept": "application/json"})
            with urlopen(req, timeout=6) as r:
                return json.loads(r.read()).get("ac") or []
        except: return []

    adsb_tasks = [loop.run_in_executor(None, _fetch_adsb, r) for r in REGIONS]
    seen_opensky = asyncio.ensure_future(fetch_opensky())

    # Wait for ADSB results with a short timeout
    adsb_results = await asyncio.gather(*adsb_tasks, return_exceptions=True)
    opensky_states = await seen_opensky

    # Process ADSB.lol results
    for batch in adsb_results:
        if isinstance(batch, list):
            for ac in batch:
                key = ac.get("hex", "") or f"{ac.get('lat')}-{ac.get('lon')}"
                if key not in seen:
                    seen.add(key)
                    all_ac.append(ac)

    # Only use OpenSky if ADSB.lol returned too few
    if len(all_ac) < 100:
        all_ac = []
        seen.clear()
        for s in opensky_states[:500]:
            icao24 = s[0] if len(s) > 0 else ""
            cs = (s[1] or "").strip() if len(s) > 1 else ""
            lat = s[6] if len(s) > 6 and s[6] else None
            lon = s[5] if len(s) > 5 and s[5] else None
            if lat is not None and lon is not None:
                all_ac.append({
                    "hex": icao24, "flight": cs, "lat": lat, "lon": lon,
                    "alt_baro": (s[7] * 3.28084) if len(s) > 7 and s[7] else None,
                    "gs": s[9] if len(s) > 9 and s[9] else None,
                    "track": s[10] if len(s) > 10 and s[10] else None,
                    "t": (s[13] or "") if len(s) > 13 else "",
                    "r": "", "squawk": "", "dbFlags": 0,
                })

    return all_ac

def classify_and_enrich(ac: dict) -> dict | None:
    """Classify a single aircraft and return enriched record."""
    model = ac.get("t") or ""
    flight = (ac.get("flight") or "").strip()
    lat = ac.get("lat")
    lon = ac.get("lon")
    if lat is None or lon is None:
        return None

    alt_raw = ac.get("alt_baro")
    alt_m = round(alt_raw * 0.3048) if isinstance(alt_raw, (int, float)) else None
    speed = round(ac.get("gs") or 0) if ac.get("gs") else None
    heading = round(ac.get("track") or 0) if ac.get("track") else None
    vert_rate = round(ac.get("nac_p") or 0) if ac.get("nac_p") else None
    cls = classify_aircraft(model, flight, ac.get("dbFlags", 0))

    # Distance to nearest strategic airbase
    near_base = None
    for base in STRATEGIC_AIRBASES:
        d = haversine_km(lat, lon, base["lat"], base["lng"])
        if d <= 20:
            near_base = {"name": base["name"], "distance_km": round(d, 1)}
            break

    return {
        "icao24": ac.get("hex", ""),
        "callsign": flight or ac.get("hex", "UNKNOWN"),
        "lat": round(lat, 5),
        "lng": round(lon, 5),
        "alt_m": alt_m,
        "speed_knots": speed,
        "heading": heading,
        "vert_rate_fpm": vert_rate,
        "model": model or "unknown",
        "registration": ac.get("r") or "",
        "squawk": ac.get("squawk", ""),
        "category": cls["category"],
        "is_military": cls["is_military"],
        "is_heli": cls["is_heli"],
        "is_private": cls["is_private"],
        "is_commercial": cls["is_commercial"],
        "near_base": near_base,
        "grounded": isinstance(alt_raw, (int, float)) and alt_raw < 100,
        "type": "aircraft",
    }

# ── Airspace zones from airbases ──
def get_airspace_zones() -> list[dict]:
    zones = []
    for base in STRATEGIC_AIRBASES:
        zones.append({
            "name": base["name"],
            "lat": base["lat"],
            "lng": base["lng"],
            "radius_km": 20,
            "type": "military_airbase",
            "country": base["country"],
        })
    return zones

# ── AI Briefing ──
def build_briefing_prompt(aircraft: list[dict], zones: list[dict], question: str = "") -> str:
    mil_count = sum(1 for a in aircraft if a["is_military"])
    heli_count = sum(1 for a in aircraft if a["is_heli"])
    private_count = sum(1 for a in aircraft if a["is_private"])
    near_base = [a for a in aircraft if a.get("near_base")]
    categories = Counter(a["category"] for a in aircraft)

    lines = [
        f"# Briefing Espace Aérien",
        f"Total aéronefs: {len(aircraft)}",
        f"Militaire: {mil_count} | Hélicoptères: {heli_count} | Privé: {private_count} | Commercial: {categories.get('commercial', 0)}",
        f"Aéronefs près bases stratégiques: {len(near_base)}",
    ]
    if near_base:
        lines.append("Activité proche bases:")
        for a in near_base[:5]:
            lines.append(f"  - {a['callsign']} ({a['model']}) à {a['near_base']['distance_km']}km de {a['near_base']['name']}")

    top_mil = [a for a in aircraft if a["is_military"]][:10]
    if top_mil:
        lines.append("\nAéronefs militaires:")
        for a in top_mil:
            lines.append(f"  - {a['callsign']} {a['model']} alt={a['alt_m']}m spd={a['speed_knots']}kt")

    lines.append(f"\nQuestion analyste: {question or 'Situation aérienne globale'}")
    lines.append("Produire une analyse en français de la situation aérienne.")
    return "\n".join(lines)

async def ai_briefing(aircraft: list[dict], zones: list[dict], question: str = "") -> dict:
    if not ENABLE_AI:
        return {"enabled": False, "mode": "disabled", "text": ""}
    prompt = build_briefing_prompt(aircraft, zones, question)
    try:
        loop = asyncio.get_event_loop()
        req = Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=json.dumps({"model": OLLAMA_MODEL, "prompt": prompt[:18000],
                   "stream": False, "options": {"temperature": 0.15, "num_predict": 1000}}).encode(),
            headers={"Content-Type": "application/json"}
        )
        def _do():
            with urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        data = await loop.run_in_executor(None, _do)
        if data.get("response"):
            return {"enabled": True, "mode": "ollama", "model": OLLAMA_MODEL,
                    "text": data["response"], "generatedAt": now()}
    except: pass
    return {"enabled": True, "mode": "unavailable", "text": "", "generatedAt": now()}

# ── Endpoints ──

@app.get("/health")
async def health():
    registry = source_registry_summary()
    return {
        "status": "ok",
        "service": APP_NAME,
        "timestamp": now(),
        "sources": {"total": registry["registrySize"], "categories": registry["categories"]},
        "airbases": len(STRATEGIC_AIRBASES),
        "ai": {"enabled": ENABLE_AI, "model": OLLAMA_MODEL},
    }

@app.get("/airspace")
async def airspace(lat: float = 0, lng: float = 0, radius_km: int = 200):
    """All aircraft in global airspace, filtered by zone if coords provided."""
    all_ac = await fetch_all_aircraft()
    classified = []
    for ac in all_ac:
        c = classify_and_enrich(ac)
        if c:
            if lat and lng:
                d = haversine_km(lat, lng, c["lat"], c["lng"])
                if d > radius_km:
                    continue
            classified.append(c)
    return {
        "mode": "pandora-aerospace-live",
        "generatedAt": now(),
        "total": len(classified),
        "aircraft": classified[:200],
        "zones": get_airspace_zones(),
    }

@app.get("/anomalies")
async def anomalies(timeout: int = 18):
    """Detect suspicious aircraft patterns."""
    all_ac = []
    try:
        all_ac = await asyncio.wait_for(fetch_all_aircraft(), timeout=timeout)
    except: pass
    classified = [classify_and_enrich(ac) for ac in all_ac]
    classified = [c for c in classified if c]
    anomalies_list = []

    # Military near strategic airbases
    for a in classified:
        if a["is_military"] and a.get("near_base"):
            anomalies_list.append({
                "type": "military_near_base",
                "severity": "medium",
                "title": f"Militaire près de {a['near_base']['name']}",
                "callsign": a["callsign"],
                "model": a["model"],
                "lat": a["lat"],
                "lng": a["lng"],
                "alt_m": a["alt_m"],
                "distance_km": a["near_base"]["distance_km"],
                "base": a["near_base"]["name"],
            })

    # Helicopter patterns (low altitude, near strategic locations)
    helis = [a for a in classified if a["is_heli"] and a["alt_m"] and a["alt_m"] < 500]
    for h in helis[:10]:
        anomalies_list.append({
            "type": "low_helicopter",
            "severity": "low",
            "title": f"Hélicoptère basse altitude {h['callsign']}",
            "callsign": h["callsign"],
            "model": h["model"],
            "lat": h["lat"],
            "lng": h["lng"],
            "alt_m": h["alt_m"],
        })

    # Military aircraft with no callsign
    stealth = [a for a in classified if a["is_military"] and (not a["callsign"] or a["callsign"] == a["icao24"])]
    for s in stealth[:10]:
        anomalies_list.append({
            "type": "stealth_transponder",
            "severity": "high",
            "title": f"Aéronef militaire sans indicatif ({s['model']})",
            "callsign": s["callsign"],
            "model": s["model"],
            "lat": s["lat"],
            "lng": s["lng"],
            "alt_m": s["alt_m"],
        })

    return {
        "mode": "pandora-aerospace-anomalies",
        "generatedAt": now(),
        "total": len(anomalies_list),
        "anomalies": sorted(anomalies_list, key=lambda x: {"critical": 3, "high": 2, "medium": 1, "low": 0}.get(x["severity"], 0), reverse=True)[:50],
    }

@app.post("/analyze-flight")
async def analyze_flight(req: AnalyzeFlightRequest):
    """Deep analysis of a specific flight."""
    all_ac = await fetch_all_aircraft()
    target = None
    for ac in all_ac:
        hex_match = ac.get("hex", "").upper() == req.icao24.upper()
        cs_match = (ac.get("flight") or "").strip().upper() == req.callsign.upper().strip()
        if hex_match or cs_match:
            target = ac
            break

    if not target:
        raise HTTPException(status_code=404, detail="Aircraft not found in live feed")

    enriched = classify_and_enrich(target)
    if not enriched:
        raise HTTPException(status_code=404, detail="Could not classify aircraft")

    # Find nearby aircraft
    nearby = [a for a in [classify_and_enrich(ac) for ac in all_ac]
              if a and haversine_km(enriched["lat"], enriched["lng"], a["lat"], a["lng"]) < 10][:20]

    return {
        "mode": "pandora-aerospace-analyze",
        "generatedAt": now(),
        "aircraft": enriched,
        "nearby_count": len(nearby),
        "nearby": nearby,
    }

@app.get("/danger-zones")
async def danger_zones():
    """Restricted airspace and military zones."""
    zones = get_airspace_zones()
    return {
        "mode": "pandora-aerospace-danger-zones",
        "generatedAt": now(),
        "total": len(zones),
        "zones": zones,
    }

@app.post("/briefing")
async def briefing(question: str = ""):
    """AI-powered airspace situation briefing."""
    all_ac = await fetch_all_aircraft()
    classified = [classify_and_enrich(ac) for ac in all_ac]
    classified = [c for c in classified if c]
    zones = get_airspace_zones()
    ai = await ai_briefing(classified, zones, question)
    mil = sum(1 for a in classified if a["is_military"])
    heli = sum(1 for a in classified if a["is_heli"])
    return {
        "mode": "pandora-aerospace-briefing",
        "generatedAt": now(),
        "total_aircraft": len(classified),
        "military": mil,
        "helicopters": heli,
        "private": sum(1 for a in classified if a["is_private"]),
        "zones": len(zones),
        "aiBriefing": ai,
    }
