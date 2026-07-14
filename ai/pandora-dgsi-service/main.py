import os, re, json, asyncio, math
from datetime import datetime, timezone
from typing import Any
from collections import Counter
from urllib.request import urlopen, Request
from urllib.parse import urlencode, quote

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from sources import (
        DGSI_SOURCES, CRITICAL_INFRA_TYPES, MONITORED_ZONES,
        FRENCH_DEPARTMENTS, source_registry_summary
    )
except Exception:
    from .sources import (
        DGSI_SOURCES, CRITICAL_INFRA_TYPES, MONITORED_ZONES,
        FRENCH_DEPARTMENTS, source_registry_summary
    )

APP_NAME = "Pandora DGSI Service"
app = FastAPI(title=APP_NAME, version="0.1.0")

class ZoneQuery(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius_km: int = Field(5, ge=1, le=50)

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def as_list(v: Any) -> list:
    return v if isinstance(v, list) else []

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def _fetch_json(url: str, timeout: int = 10) -> dict | None:
    try:
        req = Request(url, headers={"User-Agent": "Pandora-DGSI/1.0", "Accept": "application/json"})
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except: return None

def _fetch_text(url: str, timeout: int = 10) -> str | None:
    try:
        req = Request(url, headers={"User-Agent": "Pandora-DGSI/1.0"})
        with urlopen(req, timeout=timeout) as r:
            return r.read().decode()
    except: return None

@app.get("/health")
async def health():
    return {"status": "ok", "service": APP_NAME, "timestamp": now(),
            "zones": len(MONITORED_ZONES), "infraTypes": len(CRITICAL_INFRA_TYPES)}

@app.get("/zones")
async def zones():
    """List all monitored territorial zones."""
    return {"zones": MONITORED_ZONES, "total": len(MONITORED_ZONES), "timestamp": now()}

@app.get("/infra-types")
async def infra_types():
    """List all critical infrastructure types."""
    return {"types": [{"id": k, **v} for k, v in CRITICAL_INFRA_TYPES.items()], "total": len(CRITICAL_INFRA_TYPES)}

@app.get("/zone-infra")
async def zone_infra(lat: float = 48.8566, lng: float = 2.3522, radius_km: int = 5):
    """Get critical infrastructure in a zone via Overpass API."""
    bbox_lat_min = lat - radius_km/111.0
    bbox_lat_max = lat + radius_km/111.0
    bbox_lng_min = lng - radius_km/(111.0 * math.cos(math.radians(lat)))
    bbox_lng_max = lng + radius_km/(111.0 * math.cos(math.radians(lat)))

    queries = []
    for infra_id, infra in CRITICAL_INFRA_TYPES.items():
        queries.append(f"  nwr({bbox_lat_min},{bbox_lng_min},{bbox_lat_max},{bbox_lng_max}){infra['query']};")

    overpass_query = f"""
    [out:json][timeout:15];
    (
    {chr(10).join(queries)}
    );
    out center tags 100;
    """

    data = _fetch_text("https://overpass-api.de/api/interpreter", timeout=18)
    if not data:
        # Fallback: return zone info without OSM data
        return {"zone": {"lat": lat, "lng": lng, "radius_km": radius_km}, "infrastructure": [],
                "total": 0, "source": "fallback_no_overpass", "timestamp": now()}

    try:
        resp = json.loads(data)
    except: resp = {"elements": []}

    results = {}
    for el in resp.get("elements", []):
        tags = el.get("tags", {})
        infra_type = None
        # Determine which infra type matches
        for infra_id, infra in CRITICAL_INFRA_TYPES.items():
            try:
                if eval(f"_test_osm_tag(tags, {infra['query']})"):
                    infra_type = infra_id
                    break
            except: pass

        if not infra_type:
            # Heuristic: check key tags
            for key in ("military", "amenity", "aeroway", "power", "man_made", "industrial", "harbour"):
                if key in tags and tags[key]:
                    infra_type = key
                    break

        if infra_type:
            el_lat = el.get("lat") or (el.get("center") or {}).get("lat", 0)
            el_lng = el.get("lon") or (el.get("center") or {}).get("lon", 0)
            info = CRITICAL_INFRA_TYPES.get(infra_type, {})
            results.setdefault(infra_type, []).append({
                "name": tags.get("name", tags.get("operator", f"Infrastructure {infra_type}")),
                "lat": el_lat, "lng": el_lng,
                "tags": {k: tags[k] for k in ("name", "operator", "website", "phone") if k in tags},
                "type_id": infra_type,
                "icon": info.get("icon", "📍"),
            })

    return {
        "zone": {"lat": lat, "lng": lng, "radius_km": radius_km},
        "infrastructure": results,
        "total": sum(len(v) for v in results.values()),
        "breakdown": {k: len(v) for k, v in sorted(results.items(), key=lambda x: -len(x[1]))},
        "source": "OpenStreetMap Overpass",
        "timestamp": now(),
    }

def _test_osm_tag(tags: dict, query_str: str) -> bool:
    """Simple OSM tag matcher for queries like [\"amenity\"=\"police\"] or [\"military\"~\".\"]"""
    m = re.match(r'\["([^"]+)"="([^"]+)"\]', query_str)
    if m:
        return tags.get(m.group(1)) == m.group(2)
    m = re.match(r'\["([^"]+)"~"([^"]+)"\]', query_str)
    if m:
        val = tags.get(m.group(1), "")
        return bool(re.search(m.group(2), str(val)))
    m = re.match(r'\["([^"]+)"\]', query_str)
    if m:
        return m.group(1) in tags
    return False

@app.get("/zone-intel")
async def zone_intel(lat: float = 48.8566, lng: float = 2.3522, radius_km: int = 10):
    """Full intelligence dossier for a zone: geo + infra + department context."""
    # Reverse geocode
    geo = _fetch_json(
        f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&zoom=10&addressdetails=1",
        timeout=8
    )
    address = geo.get("address", {}) if geo else {}
    country = address.get("country", "France")
    city = address.get("city") or address.get("town") or address.get("village") or "Unknown"
    dept_num = address.get("ISO3166-2-lvl6", "").replace("FR-", "")
    dept_info = next((d for d in FRENCH_DEPARTMENTS if d["num"] == dept_num), None)

    # Wikipedia summary for the city
    wiki_summary = ""
    try:
        wiki = _fetch_json(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(city)}",
            timeout=6
        )
        if wiki:
            wiki_summary = wiki.get("extract", "")[:500]
    except: pass

    # Monitored zones near this location
    nearby_zones = [z for z in MONITORED_ZONES
                    if haversine_km(lat, lng, z["lat"], z["lng"]) < radius_km + z["radius_km"]]

    return {
        "location": {
            "city": city,
            "country": country,
            "department": dept_info,
            "address": address,
            "display_name": geo.get("display_name", "") if geo else "",
        },
        "wiki_summary": wiki_summary,
        "nearby_zones": nearby_zones,
        "coords": {"lat": lat, "lng": lng, "radius_km": radius_km},
        "timestamp": now(),
    }

@app.get("/cctv-health")
async def cctv_health():
    """Mock CCTV health status — real CCTV status requires streaming endpoints."""
    return {
        "mode": "cctv_status",
        "status": "operational",
        "note": "CCTV health requires connection to live camera APIs",
        "timestamp": now(),
    }

@app.get("/dashboard")
async def dashboard():
    """Territorial monitoring dashboard overview."""
    return {
        "mode": "pandora-dgsi-dashboard",
        "generatedAt": now(),
        "monitoredZones": len(MONITORED_ZONES),
        "infrastructureTypes": len(CRITICAL_INFRA_TYPES),
        "departments": len(FRENCH_DEPARTMENTS),
        "zones": MONITORED_ZONES,
        "sources": len(DGSI_SOURCES),
        "timestamp": now(),
    }
