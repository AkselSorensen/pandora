"""Public Aviation / Airspace OSINT source registry for Pandora Aerospace.

Every source listed here is public and free. Some require optional API keys
for higher rate limits — missing keys gracefully fall back to lower limits.
"""

from __future__ import annotations
from collections import Counter

Source = dict[str, str]

AEROSPACE_SOURCES: list[Source] = [
    # ── ADS-B / Flight Tracking ──
    {"name": "ADSB.lol", "category": "adsb", "type": "json",
     "url": "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}",
     "description": "ADS-B data, free, no key, 6 global regions"},
    {"name": "OpenSky Network", "category": "adsb", "type": "json",
     "url": "https://opensky-network.org/api/states/all",
     "description": "Flight states, free registration for higher limits"},
    {"name": "ADSB Exchange API", "category": "adsb", "type": "json",
     "url": "https://adsbexchange.com/api/aircraft/lat/{lat}/lon/{lon}/dist/{dist}/",
     "description": "ADS-B with military/private filter, free tier"},

    # ── Weather for Aviation ──
    {"name": "AviationWeather METAR", "category": "metar", "type": "xml",
     "url": "https://aviationweather.gov/api/data/metar?ids={icao}&format=xml",
     "description": "METAR weather reports for airports"},
    {"name": "AviationWeather TAF", "category": "taf", "type": "xml",
     "url": "https://aviationweather.gov/api/data/taf?ids={icao}&format=xml",
     "description": "TAF forecasts for airports"},
    {"name": "NOAA Aviation", "category": "aviation_weather", "type": "json",
     "url": "https://aviationweather.gov/api/data/airport?ids={icao}",
     "description": "Airport conditions"},

    # ── Airspace / NOTAM ──
    {"name": "OpenAIP Airspaces", "category": "airspace", "type": "json",
     "url": "https://api.open-aip.org/v2/spaces?lat={lat}&lng={lng}&radius={radius}km",
     "description": "Restricted airspaces, danger zones (free key)"},
    {"name": "FAA NOTAM", "category": "notam", "type": "xml",
     "url": "https://notams.aim.faa.gov/notamSearch/search?searchType=0&designatorsForLocation={icao}",
     "description": "FAA NOTAM international"},

    # ── Satellites ──
    {"name": "N2YO Satellite Passes", "category": "satellite", "type": "json",
     "url": "https://api.n2yo.com/rest/v1/above/{lat}/{lng}/{alt}/{radius}/10/",
     "description": "Satellite passes above a location (free: 100 req/day)"},
    {"name": "Celestrak Active", "category": "tle", "type": "text",
     "url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
     "description": "TLE satellite tracking data"},

    # ── Airbases ──
    {"name": "Wikidata Airbases", "category": "airbase", "type": "sparql",
     "url": "https://query.wikidata.org/sparql",
     "description": "Global military airbases via Wikidata SPARQL"},
    {"name": "OSM Military Airfields", "category": "airbase", "type": "overpass",
     "url": "https://overpass-api.de/api/interpreter",
     "description": "OpenStreetMap military airfields"},
]

# ── Aircraft type classification (from Pandora frontend flights/route.ts) ──
HELI_TYPES: set[str] = {
    'R22','R44','R66','B06','B06T','B204','B205','B206','B212','B222','B230',
    'B407','B412','B427','B429','B430','B505','B525',
    'AS32','AS35','AS50','AS55','AS65',
    'EC20','EC25','EC30','EC35','EC45','EC55','EC75',
    'H125','H130','H135','H145','H155','H160','H175','H215','H225',
    'S55','S58','S61','S64','S70','S76','S92',
    'A109','A119','A139','A169','A189','AW09',
    'MD52','MD60','MDHI','MD90','NOTR',
    'B47G','HUEY','GAMA','CABR','EXE',
}

PRIVATE_JET_TYPES: set[str] = {
    'G150','G200','G280','GLEX','G500','G550','G600','G650','G700',
    'GLF2','GLF3','GLF4','GLF5','GLF6','GL5T','GL7T','GV','GIV',
    'CL30','CL35','CL60','BD70','BD10',
    'C25A','C25B','C25C','C500','C510','C525','C550','C560','C56X','C680','C700','C750',
    'E35L','E50P','E55P','E545','E550',
    'FA50','FA7X','FA8X','F900','F2TH',
    'LJ35','LJ40','LJ45','LJ60','LJ70','LJ75',
    'PC12','PC24','TBM7','TBM8','TBM9',
    'PRM1','SF50','EA50','VLJ',
}

MILITARY_TYPES: set[str] = {
    'C17','C5M','C130','C30J','KC10','KC46','KC35','E3CF','E3TF','E8A',
    'B1B','B2','B52','B21','F16','F15','F18','F22','F35','A10','F117',
    'RC135','E6B','P8A','P3','MQ9','RQ4','U2','EP3','RC12',
    'V22','CH47','UH60','AH64','AH1Z','MV22',
    'EUFI','RFAL','TORD','TYP','GR4',
    'TU95','TU160','TU22','SU27','SU30','SU34','SU35','SU57','SU57',
    'MIG29','MIG31','MIG35','MIG21','YAK130','YAK141',
    'J20','J16','J10','J11','J15','J31','KJ500','KJ200',
}

MILITARY_CALLSIGN_PREFIXES: set[str] = {
    'RCH', 'KING', 'DUKE', 'EVAC', 'JAKE', 'REACH', 'CONVOY', 'SABRE',
    'VIPR', 'FANG', 'RAZOR', 'WOLF', 'HAWK', 'PHANTOM', 'RAIDER',
}

COMMERCIAL_AIRLINER_TYPES: set[str] = {
    'A319','A320','A321','A332','A333','A339','A343','A359','A388',
    'B737','B738','B739','B38M','B39M','B752','B753','B763','B764',
    'B772','B77L','B77W','B788','B789','B78X',
    'E170','E175','E190','E195','E195E2','E190E2',
    'CRJ7','CRJ9','CRJ1','CRJ2',
    'AT43','AT72','AT76','DH8D','DH8C','DH8B',
    'A220','BCS1','BCS3',
}

# ── Strategic airbase helplist (key bases for anomaly detection) ──
STRATEGIC_AIRBASES: list[dict] = [
    # France
    {"name": "BA 113 Saint-Dizier", "lat": 48.6361, "lng": 4.8994, "country": "FR", "type": "airbase"},
    {"name": "BA 118 Mont-de-Marsan", "lat": 43.9117, "lng": -0.5072, "country": "FR", "type": "airbase"},
    {"name": "BA 125 Istres", "lat": 43.5228, "lng": 4.9236, "country": "FR", "type": "airbase"},
    {"name": "BA 705 Tours", "lat": 47.4325, "lng": 0.7272, "country": "FR", "type": "airbase"},
    {"name": "BA 115 Orange-Caritat", "lat": 44.1406, "lng": 4.8667, "country": "FR", "type": "airbase"},
    # USA
    {"name": "Rammstein AB", "lat": 49.4369, "lng": 7.6006, "country": "DE", "type": "airbase"},
    {"name": "Aviano AB", "lat": 46.0311, "lng": 12.5956, "country": "IT", "type": "airbase"},
    {"name": "Incirlik AB", "lat": 36.9825, "lng": 35.3108, "country": "TR", "type": "airbase"},
    {"name": "Al Udeid AB", "lat": 25.1183, "lng": 51.3150, "country": "QA", "type": "airbase"},
    {"name": "Diego Garcia", "lat": -7.3133, "lng": 72.4111, "country": "UK", "type": "airbase"},
    # Russia
    {"name": "Khmeimim AB", "lat": 35.4111, "lng": 35.9944, "country": "SY", "type": "airbase"},
    {"name": "Engels-2", "lat": 51.4806, "lng": 46.2069, "country": "RU", "type": "airbase"},
    # UK
    {"name": "RAF Lakenheath", "lat": 52.4092, "lng": 0.5611, "country": "UK", "type": "airbase"},
    {"name": "RAF Mildenhall", "lat": 52.3625, "lng": 0.4861, "country": "UK", "type": "airbase"},
]

# ── Global coverage regions (from Pandora frontend) ──
# Mesuré le 2026-10-05 sur ADSB.lol /v2 (Europe, 50.0/15.0) :
#   dist=250 NM  → HTTP 200, 647 aéronefs
#   dist=2000 NM → HTTP 200, 4078 aéronefs
#   dist=3000 NM → HTTP 200, 4221 aéronefs
# Le rayon n'est donc PAS la contrainte : une note antérieure affirmait à tort
# qu'un `dist` > 250 NM renvoyait un corps vide. La contrainte réelle est le
# DÉBIT — six requêtes parties en parallèle déclenchent HTTP 420/429 et seules
# ~2 régions sur 6 répondent. Garder un `dist` large (une région qui passe
# rapporte un maximum) et espacer les appels côté client (ADSB_CONCURRENCY).
REGIONS: list[dict] = [
    {"label": "North America", "lat": 39.8, "lon": -98.5, "dist": 2000},
    {"label": "Europe", "lat": 50.0, "lon": 15.0, "dist": 2000},
    {"label": "Asia", "lat": 35.0, "lon": 105.0, "dist": 2000},
    {"label": "Australia", "lat": -25.0, "lon": 133.0, "dist": 2000},
    {"label": "Africa", "lat": 0.0, "lon": 20.0, "dist": 2500},
    {"label": "South America", "lat": -15.0, "lon": -60.0, "dist": 2000},
]


def classify_aircraft(model: str, callsign: str, db_flags: int = 0, rotorcraft: bool = False) -> dict:
    """Classify an aircraft into military/heli/jet/commercial/private/unknown.

    `rotorcraft` vient d'OpenSky (state-vector index 17 == 8) : OpenSky ne
    publie aucun code type, ce drapeau est la seule façon d'y repérer un
    hélicoptère.
    """
    model_upper = (model or "").upper()
    callsign_upper = (callsign or "").upper().strip()

    is_heli = rotorcraft or model_upper in HELI_TYPES
    is_military_model = model_upper in MILITARY_TYPES
    is_military_callsign = any(callsign_upper.startswith(p) for p in MILITARY_CALLSIGN_PREFIXES)
    is_jet = model_upper in PRIVATE_JET_TYPES
    is_commercial = model_upper in COMMERCIAL_AIRLINER_TYPES

    if is_military_model or is_military_callsign or (db_flags & 1):
        category = "military"
    elif is_heli:
        category = "heli"
    elif is_jet:
        category = "jet"
    elif is_commercial:
        category = "commercial"
    elif model_upper and not callsign_upper[:1].isalpha():
        category = "private"
    elif model_upper:
        category = "commercial"
    else:
        # Ni code type ni indicatif exploitables (cas fréquent sur OpenSky) :
        # ne pas inventer « commercial ».
        category = "unknown"

    return {
        "category": category,
        "is_heli": is_heli,
        "is_military": category == "military",
        "is_private": category in ("private", "jet"),
        "is_commercial": category == "commercial",
        "model": model_upper or "unknown",
    }


def source_categories() -> list[str]:
    return sorted({s["category"] for s in AEROSPACE_SOURCES})


def source_registry_summary() -> dict:
    counts = Counter(s["category"] for s in AEROSPACE_SOURCES)
    return {
        "registrySize": len(AEROSPACE_SOURCES),
        "categories": sorted(counts),
        "categoryCounts": [{"name": name, "count": count} for name, count in sorted(counts.items())],
        "sourceNames": [s["name"] for s in AEROSPACE_SOURCES],
    }
