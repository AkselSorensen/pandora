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

# ── ADS-B fetchers (urllib — httpx ne passe pas sur Docker Windows) ──
# OpenSky est la colonne vertébrale : UNE requête renvoie ~7 800 aéronefs
# géolocalisés dans le monde entier, sans limite de débit gênante (mesuré :
# HTTP 200, 1 Mo, ~0,6 s). ADSB.lol apporte ce qu'OpenSky n'a pas — code type
# `t`, immatriculation `r`, drapeau militaire `dbFlags` — mais son /v2
# rate-limite les rafales : six appels lancés d'un coup renvoient HTTP 420/429
# et seules ~2 régions sur 6 répondent. On l'interroge donc par vagues, et on
# FUSIONNE les deux sources au lieu de choisir l'une OU l'autre.
OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"
ADSB_CONCURRENCY = 2        # au-delà, ADSB.lol répond 420/429
ADSB_WAVE_GAP_S = 0.4       # espacement entre deux vagues de requêtes
MPS_TO_KNOTS = 1.943844
OPEN_SKY_ROTORCRAFT_CATEGORY = 8

UA_HEADERS = {"User-Agent": "Pandora-Aerospace/1.0", "Accept": "application/json"}


def _clean_callsign(raw: Any) -> str:
    """Indicatif exploitable, sinon chaîne vide.

    ADSB.lol renvoie « @@@@@@@@ » quand l'appareil n'émet pas d'indicatif :
    ce n'est pas un nom, ça ne doit pas s'afficher comme tel.
    """
    cs = (raw or "").strip()
    return cs if any(c.isalnum() for c in cs) else ""


def _get_json(url: str, timeout: float) -> Any:
    req = Request(url, headers=UA_HEADERS)
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _fetch_adsb_region(region: dict) -> list[dict]:
    url = f"https://api.adsb.lol/v2/lat/{region['lat']}/lon/{region['lon']}/dist/{region['dist']}"
    try:
        return _get_json(url, timeout=8).get("ac") or []
    except Exception:
        return []


def _fetch_opensky() -> list[list]:
    try:
        return _get_json(OPENSKY_STATES_URL, timeout=10).get("states") or []
    except Exception:
        return []


def _opensky_to_adsb_shape(states: list[list]) -> list[dict]:
    """Ramène un state-vector OpenSky au format ADSB.lol attendu en aval.

    Indices du state-vector : 0 icao24, 1 callsign, 5 lon, 6 lat,
    7 baro_altitude (m), 9 velocity (m/s), 10 true_track, 13 geo_altitude (m),
    14 squawk, 17 category.
    """
    out: list[dict] = []
    for s in states:
        if len(s) < 11:
            continue
        lat, lon = s[6], s[5]
        if lat is None or lon is None:
            continue
        baro_m = s[7] if s[7] is not None else s[13]
        velocity_ms = s[9]
        rotorcraft = len(s) > 17 and s[17] == OPEN_SKY_ROTORCRAFT_CATEGORY
        out.append({
            "hex": s[0] or "",
            "flight": (s[1] or "").strip(),
            "lat": lat,
            "lon": lon,
            # m → ft : `classify_and_enrich` attend des pieds (format ADSB.lol)
            "alt_baro": round(baro_m / 0.3048, 1) if baro_m is not None else None,
            "gs": round(velocity_ms * MPS_TO_KNOTS, 1) if velocity_ms is not None else None,
            "track": s[10],
            "t": "",                    # OpenSky ne publie pas le code type
            "r": "",
            "squawk": s[14] or "",
            "dbFlags": 0,
            "rotorcraft": rotorcraft,
        })
    return out


async def fetch_all_aircraft() -> list[dict]:
    """OpenSky (volume mondial) + ADSB.lol (typage/immat), fusionnés par ICAO24."""
    loop = asyncio.get_event_loop()

    # ADSB.lol par vagues espacées : une rafale de 6 réveille le rate-limit.
    async def fetch_adsb_all() -> list[dict]:
        collected: list[dict] = []
        for i in range(0, len(REGIONS), ADSB_CONCURRENCY):
            wave = REGIONS[i:i + ADSB_CONCURRENCY]
            results = await asyncio.gather(
                *(loop.run_in_executor(None, _fetch_adsb_region, r) for r in wave)
            )
            for batch in results:
                if isinstance(batch, list):
                    collected.extend(batch)
            if i + ADSB_CONCURRENCY < len(REGIONS):
                await asyncio.sleep(ADSB_WAVE_GAP_S)
        return collected

    adsb, opensky_states = await asyncio.gather(fetch_adsb_all(), loop.run_in_executor(None, _fetch_opensky))

    merged: dict[str, dict] = {}
    for ac in _opensky_to_adsb_shape(opensky_states):
        merged[ac["hex"] or f"{ac['lat']}-{ac['lon']}"] = ac
    # ADSB.lol écrase l'entrée OpenSky : type, immat, dbFlags, squawk en plus.
    for ac in adsb:
        merged[ac.get("hex") or f"{ac.get('lat')}-{ac.get('lon')}"] = ac

    return list(merged.values())

def classify_and_enrich(ac: dict) -> dict | None:
    """Classify a single aircraft and return enriched record."""
    model = ac.get("t") or ""
    flight = _clean_callsign(ac.get("flight"))
    lat = ac.get("lat")
    lon = ac.get("lon")
    if lat is None or lon is None:
        return None

    alt_raw = ac.get("alt_baro")
    alt_m = round(alt_raw * 0.3048) if isinstance(alt_raw, (int, float)) else None
    speed = round(ac.get("gs") or 0) if ac.get("gs") else None
    heading = round(ac.get("track") or 0) if ac.get("track") else None
    vert_rate = round(ac.get("nac_p") or 0) if ac.get("nac_p") else None
    cls = classify_aircraft(model, flight, ac.get("dbFlags", 0), bool(ac.get("rotorcraft")))

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

    # Le monde entier tient dans `classified` (~7 800 aéronefs) mais l'API n'en
    # renvoie que 200 : classer par intérêt pour que l'échantillon exposé montre
    # d'abord ce qui compte (militaire, puis hélicos, puis privés).
    def _rank(c: dict) -> int:
        return 0 if c["is_military"] else 1 if c["is_heli"] else 2 if c["is_private"] else 3

    classified.sort(key=lambda c: (_rank(c), c["callsign"]))
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
