"""Public territorial surveillance sources for Pandora DGSI.

These sources provide data for monitoring CCTV infrastructure, critical
national infrastructure, and territorial anomalies. All are public/free.
"""

from __future__ import annotations
from collections import Counter

Source = dict[str, str]

DGSI_SOURCES: list[Source] = [
    {"name": "OpenStreetMap Overpass", "category": "infrastructure", "type": "overpass",
     "url": "https://overpass-api.de/api/interpreter",
     "description": "Infrastructure, buildings, amenities worldwide"},
    {"name": "Nominatim Geocoding", "category": "geocoding", "type": "json",
     "url": "https://nominatim.openstreetmap.org/",
     "description": "Reverse geocoding, address lookup"},
    {"name": "Wikipedia API", "category": "reference", "type": "json",
     "url": "https://en.wikipedia.org/w/api.php",
     "description": "Articles, summaries, geo-coordinates"},
    {"name": "Wikidata SPARQL", "category": "reference", "type": "sparql",
     "url": "https://query.wikidata.org/sparql",
     "description": "Structured data, entities, relationships"},
    {"name": "ReliefWeb", "category": "humanitarian", "type": "rss",
     "url": "https://reliefweb.int/updates/rss.xml",
     "description": "Humanitarian updates and crisis reports"},
    {"name": "GDACS", "category": "disaster", "type": "rss",
     "url": "https://www.gdacs.org/xml/rss.xml",
     "description": "Global disaster alerts and coordination"},
]

# ── Critical infrastructure points of interest (POI) ──
CRITICAL_INFRA_TYPES: dict[str, dict] = {
    "government": {"label": "Bâtiment gouvernemental", "icon": "🏛️", "query": "[\"amenity\"=\"government\"]"},
    "police": {"label": "Commissariat", "icon": "🚔", "query": "[\"amenity\"=\"police\"]"},
    "fire": {"label": "Caserne pompiers", "icon": "🚒", "query": "[\"amenity\"=\"fire_station\"]"},
    "hospital": {"label": "Hôpital", "icon": "🏥", "query": "[\"amenity\"=\"hospital\"]"},
    "embassy": {"label": "Ambassade", "icon": "🏛️", "query": "[\"amenity\"=\"embassy\"]"},
    "military": {"label": "Zone militaire", "icon": "⚔️", "query": "[\"military\"~\".\"]"},
    "nuclear": {"label": "Installation nucléaire", "icon": "☢️", "query": "[\"landuse\"=\"industrial\"][\"industrial\"=\"nuclear\"]"},
    "datacenter": {"label": "Data center", "icon": "💻", "query": "[\"amenity\"=\"data_center\"]"},
    "prison": {"label": "Prison", "icon": "🔒", "query": "[\"amenity\"=\"prison\"]"},
    "port": {"label": "Port", "icon": "⚓", "query": "[\"harbour\"=\"yes\"]"},
    "airport": {"label": "Aéroport", "icon": "✈️", "query": "[\"aeroway\"=\"aerodrome\"]"},
    "energy": {"label": "Centrale électrique", "icon": "⚡", "query": "[\"power\"=\"plant\"]"},
    "water": {"label": "Station eau", "icon": "💧", "query": "[\"man_made\"=\"water_works\"]"},
    "telecom": {"label": "Antenne télécom", "icon": "📡", "query": "[\"tower:type\"=\"communication\"]"},
}

# ── French departments reference ──
FRENCH_DEPARTMENTS: list[dict] = [
    {"num": "75", "name": "Paris", "region": "Île-de-France"},
    {"num": "77", "name": "Seine-et-Marne", "region": "Île-de-France"},
    {"num": "78", "name": "Yvelines", "region": "Île-de-France"},
    {"num": "91", "name": "Essonne", "region": "Île-de-France"},
    {"num": "92", "name": "Hauts-de-Seine", "region": "Île-de-France"},
    {"num": "93", "name": "Seine-Saint-Denis", "region": "Île-de-France"},
    {"num": "94", "name": "Val-de-Marne", "region": "Île-de-France"},
    {"num": "95", "name": "Val-d'Oise", "region": "Île-de-France"},
    {"num": "13", "name": "Bouches-du-Rhône", "region": "Provence-Alpes-Côte d'Azur"},
    {"num": "69", "name": "Rhône", "region": "Auvergne-Rhône-Alpes"},
    {"num": "31", "name": "Haute-Garonne", "region": "Occitanie"},
    {"num": "59", "name": "Nord", "region": "Hauts-de-France"},
    {"num": "06", "name": "Alpes-Maritimes", "region": "Provence-Alpes-Côte d'Azur"},
    {"num": "33", "name": "Gironde", "region": "Nouvelle-Aquitaine"},
    {"num": "44", "name": "Loire-Atlantique", "region": "Pays de la Loire"},
]

# ── Zone definitions for territorial monitoring ──
MONITORED_ZONES: list[dict] = [
    {"name": "Paris Centre", "lat": 48.8566, "lng": 2.3522, "radius_km": 5, "priority": "critical"},
    {"name": "La Défense", "lat": 48.8911, "lng": 2.2386, "radius_km": 2, "priority": "high"},
    {"name": "Versailles", "lat": 48.8049, "lng": 2.1204, "radius_km": 3, "priority": "high"},
    {"name": "Lyon Centre", "lat": 45.7640, "lng": 4.8357, "radius_km": 5, "priority": "high"},
    {"name": "Marseille Vieux-Port", "lat": 43.2965, "lng": 5.3698, "radius_km": 5, "priority": "high"},
    {"name": "Toulouse", "lat": 43.6047, "lng": 1.4442, "radius_km": 5, "priority": "medium"},
    {"name": "Bordeaux", "lat": 44.8378, "lng": -0.5792, "radius_km": 5, "priority": "medium"},
    {"name": "Lille", "lat": 50.6292, "lng": 3.0573, "radius_km": 5, "priority": "medium"},
    {"name": "Strasbourg", "lat": 48.5734, "lng": 7.7521, "radius_km": 5, "priority": "medium"},
    {"name": "Nantes", "lat": 47.2184, "lng": -1.5536, "radius_km": 5, "priority": "medium"},
    {"name": "Nice", "lat": 43.7102, "lng": 7.2620, "radius_km": 5, "priority": "medium"},
]


def source_categories() -> list[str]:
    return sorted({s["category"] for s in DGSI_SOURCES})


def source_registry_summary() -> dict:
    counts = Counter(s["category"] for s in DGSI_SOURCES)
    return {
        "registrySize": len(DGSI_SOURCES),
        "categories": sorted(counts),
        "categoryCounts": [{"name": name, "count": count} for name, count in sorted(counts.items())],
    }
