"""Multi-domain typed knowledge graph.

Entities come from real sibling services (aerospace, territorial, nuclear, cyberdef, DGSI)
plus the digest and alert engines. Nothing is ever invented: a source that does not answer
is reported in `degraded` and its entities are simply absent.

Access is filtered by clearance: a node whose classification outranks the caller's clearance
is dropped together with its edges (attribute-based access on the data itself, not only on the
route).
"""
import asyncio
import os
from time import time
from typing import Any

import httpx

from nodes import add_edge, add_node, haversine_km, severity_risk, stable_id

SERVICE_URLS = {
    "aerospace": os.getenv("PANDORA_AEROSPACE_URL", "http://pandora-aerospace:7713").rstrip("/"),
    "territorial": os.getenv("PANDORA_TERRITORIAL_URL", "http://pandora-territorial:7714").rstrip("/"),
    "nuclear": os.getenv("PANDORA_NUCLEAR_URL", "http://pandora-nuclear:7709").rstrip("/"),
    "cyberdef": os.getenv("PANDORA_CYBERDEF_URL", "http://pandora-cyberdef:7711").rstrip("/"),
    "dgsi": os.getenv("PANDORA_DGSI_URL", "http://pandora-dgsi:7712").rstrip("/"),
}
DIGEST_URL = os.getenv("PANDORA_DIGEST_URL", "http://pandora-digest:7702").rstrip("/")
ALERTS_URL = os.getenv("PANDORA_ALERTS_URL", "http://pandora-alerts:7703").rstrip("/")
SOURCE_TIMEOUT = float(os.getenv("PANDORA_GRAPH_TIMEOUT", "14"))
CACHE_TTL = float(os.getenv("PANDORA_GRAPH_CACHE_TTL", "60"))
SOURCE_KEYS = ("aerospace", "territorial", "nuclear", "cyberdef", "dgsi", "digest", "alerts")
MAX_AIRCRAFT = int(os.getenv("PANDORA_GRAPH_MAX_AIRCRAFT", "120"))
NEAR_KM = float(os.getenv("PANDORA_GRAPH_NEAR_KM", "100"))

CLASSIFICATIONS = ["public", "diffusion_restreinte", "confidentiel", "secret"]
LEVEL_RANK = {c: i for i, c in enumerate(CLASSIFICATIONS)}

# Classification by entity type — mirrors ai/pandora-governance-service/sources.py logic.
ENTITY_CLASSIFICATION = {
    "OperationalPicture": "public",
    "Aircraft": "public",              # ADS-B is a public broadcast
    "Zone": "diffusion_restreinte",
    "InfraSite": "diffusion_restreinte",
    "CyberIndicator": "diffusion_restreinte",
    "Alert": "diffusion_restreinte",
    "Signal": "confidentiel",
    "NuclearActor": "secret",
    "Source": "public",
    "Category": "public",
    "Location": "public",
    "GeoPoint": "public",
}

# Reference geography for the strategic actors returned by the nuclear service (its API has
# no coordinates: these are country centroids, i.e. reference data, not generated events).
NUCLEAR_ACTOR_CENTROIDS = {
    "united_states": (39.83, -98.58),
    "russia": (61.52, 105.32),
    "china": (35.86, 104.20),
    "france": (46.23, 2.21),
    "united_kingdom": (55.38, -3.44),
    "india": (20.59, 78.96),
    "pakistan": (30.38, 69.35),
    "north_korea": (40.34, 127.51),
    "israel": (31.05, 34.85),
}

# `ts`/`payloads` : cache des collectes amont. `graph_ts`/`graph` : cache du graphe
# CONSTRUIT, horodaté séparément — sinon une collecte rafraîchie directement ferait
# passer un graphe périmé pour frais.
_CACHE: dict[str, Any] = {"ts": 0.0, "payloads": None, "degraded": [], "graph_ts": 0.0, "graph": None}

# Single-flight : plusieurs requêtes simultanées sur un cache froid partagent UNE
# construction. Sans ce verrou, chacune relançait ses 7 collectes amont et le service
# se saturait lui-même (mesuré : une lecture d'entité passait de 15 ms à 14 s).
_BUILD_LOCK = asyncio.Lock()


def rank(classification: str | None) -> int:
    return LEVEL_RANK.get(str(classification or "diffusion_restreinte"), 1)


def _items(payload: Any, key: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    value = payload.get(key)
    return [i for i in value if isinstance(i, dict)] if isinstance(value, list) else []


def _num(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def _fetch(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    r = await client.get(url, headers={"User-Agent": "Pandora-Ontology-Service/1.0"})
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


async def collect(force: bool = False) -> tuple[dict[str, Any], list[str]]:
    """Fetch every domain source in parallel. Partial results + `degraded` on failure."""
    if not force and _CACHE["payloads"] is not None and (time() - _CACHE["ts"]) < CACHE_TTL:
        return _CACHE["payloads"], list(_CACHE["degraded"])

    urls = {
        "aerospace": f"{SERVICE_URLS['aerospace']}/airspace",
        "territorial": f"{SERVICE_URLS['territorial']}/risk-map",
        "nuclear": f"{SERVICE_URLS['nuclear']}/countries",
        "cyberdef": f"{SERVICE_URLS['cyberdef']}/live-threats",
        "dgsi": f"{SERVICE_URLS['dgsi']}/dashboard",
        "digest": f"{DIGEST_URL}/digest",
        "alerts": f"{ALERTS_URL}/alerts",
    }
    payloads: dict[str, Any] = {}
    degraded: list[str] = []
    async with httpx.AsyncClient(timeout=SOURCE_TIMEOUT) as client:
        results = await asyncio.gather(
            *[_fetch(client, url) for url in urls.values()], return_exceptions=True
        )
    for (name, _), result in zip(urls.items(), results):
        if isinstance(result, Exception):
            degraded.append(name)
            payloads[name] = {}
        else:
            payloads[name] = result

    _CACHE.update({"ts": time(), "payloads": payloads, "degraded": degraded})
    return payloads, degraded


def build(payloads: dict[str, Any], digest: dict[str, Any], alerts_payload: dict[str, Any],
          degraded: list[str]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[str, dict[str, Any]] = {}

    # ── Root ────────────────────────────────────────────────────────────────────
    root_id = "pandora-operational-picture"
    add_node(nodes, {
        "id": root_id, "type": "OperationalPicture", "label": "Pandora Operational Picture",
        "risk": int(digest.get("riskScore") or 0), "weight": 10,
        "tags": ["root", str(digest.get("posture") or "routine").lower()],
        "sources": ["digest", "aerospace", "territorial", "nuclear", "cyberdef", "dgsi", "alerts"],
        "classification": "public",
        "properties": {"posture": digest.get("posture"), "riskScore": digest.get("riskScore"),
                  "generatedAt": digest.get("generatedAt"), "degraded": degraded},
    })

    # ── Zones (territorial risk engine) ─────────────────────────────────────────
    zone_geo: list[tuple[str, float, float, float]] = []
    for zone in _items(payloads.get("territorial"), "zones"):
        lat, lng = _num(zone.get("lat")), _num(zone.get("lng"))
        if lat is None or lng is None:
            continue
        score = int(zone.get("score") or 0)
        zid = stable_id("zone", zone.get("name"))
        add_node(nodes, {
            "id": zid, "type": "Zone", "label": str(zone.get("name") or "Zone"),
            "risk": score, "weight": max(2, score / 20), "lat": lat, "lon": lng,
            "tags": ["zone", str(zone.get("level") or "watch").lower()],
            "sources": ["pandora-territorial"], "classification": "diffusion_restreinte",
            "properties": {"level": zone.get("level"), "color": zone.get("color"), "drivers": zone.get("drivers")},
        })
        add_edge(edges, root_id, zid, "HAS_ZONE", max(1, score / 25), {"score": score})
        zone_geo.append((zid, lat, lng, float(zone.get("radius_km") or 250)))

    # ── Infra sites (DGSI territorial intelligence) ─────────────────────────────
    infra_geo: list[tuple[str, float, float]] = []
    priority_risk = {"critical": 95, "high": 75, "medium": 45, "low": 20}
    for site in _items(payloads.get("dgsi"), "zones"):
        lat, lng = _num(site.get("lat")), _num(site.get("lng"))
        if lat is None or lng is None:
            continue
        risk = priority_risk.get(str(site.get("priority") or "low").lower(), 35)
        sid_ = stable_id("infra", site.get("name") or site.get("id"))
        add_node(nodes, {
            "id": sid_, "type": "InfraSite", "label": str(site.get("name") or site.get("id") or "Site"),
            "risk": risk, "weight": max(1.5, risk / 25), "lat": lat, "lon": lng,
            "tags": ["infra", str(site.get("priority") or "low").lower(),
                     *(site.get("types") if isinstance(site.get("types"), list) else [])],
            "sources": ["pandora-dgsi"], "classification": "diffusion_restreinte",
            "properties": {"priority": site.get("priority"), "radiusKm": site.get("radius_km"),
                      "type": site.get("type")},
        })
        add_edge(edges, root_id, sid_, "HAS_INFRA", max(1, risk / 30), {"priority": site.get("priority")})
        infra_geo.append((sid_, lat, lng))
        nearest = min(zone_geo, key=lambda z: haversine_km(lat, lng, z[1], z[2]), default=None)
        if nearest:
            add_edge(edges, sid_, nearest[0], "LOCATED_IN", 3, {"distanceKm": round(haversine_km(lat, lng, nearest[1], nearest[2]), 1)})

    # ── Aircraft (ADS-B) ────────────────────────────────────────────────────────
    aircraft_items = _items(payloads.get("aerospace"), "aircraft")[:MAX_AIRCRAFT]
    for ac in aircraft_items:
        lat, lng = _num(ac.get("lat")), _num(ac.get("lng"))
        if lat is None or lng is None:
            continue
        callsign = str(ac.get("callsign") or ac.get("icao24") or "UNK").strip()
        if ac.get("is_military"):
            risk, tags = 75, ["aircraft", "military"]
        elif ac.get("is_heli"):
            risk, tags = 45, ["aircraft", "helicopter"]
        else:
            risk, tags = 20, ["aircraft", "civil"]
        aid = stable_id("aircraft", f"{callsign}-{ac.get('icao24') or ac.get('icao') or ''}")
        add_node(nodes, {
            "id": aid, "type": "Aircraft", "label": callsign, "risk": risk,
            "weight": max(1, risk / 30), "lat": lat, "lon": lng, "tags": tags,
            "sources": ["pandora-aerospace"], "classification": "public",
            "properties": {"model": ac.get("model"), "altitudeM": _num(ac.get("alt_m")),
                      "speedKt": _num(ac.get("speed_knots") or ac.get("speed_kt")),
                      "registration": ac.get("registration"), "category": ac.get("category"),
                      "military": bool(ac.get("is_military"))},
        })
        add_edge(edges, root_id, aid, "HAS_AIRCRAFT", 1)
        nearest_zone = min(zone_geo, key=lambda z: haversine_km(lat, lng, z[1], z[2]), default=None)
        if nearest_zone:
            d = haversine_km(lat, lng, nearest_zone[1], nearest_zone[2])
            add_edge(edges, aid, nearest_zone[0], "OPERATES_IN", max(1, 6 - d / 250), {"distanceKm": round(d, 1)})
        for infra_id, ilat, ilng in infra_geo:
            d = haversine_km(lat, lng, ilat, ilng)
            if d <= NEAR_KM:
                add_edge(edges, aid, infra_id, "OBSERVED_NEAR", round(10 / max(d, 1), 2), {"distanceKm": round(d, 1)})

    # ── Cyber indicators ────────────────────────────────────────────────────────
    for threat in _items(payloads.get("cyberdef"), "threats")[:40]:
        title = str(threat.get("title") or threat.get("id") or "indicator")
        risk = int(_num(threat.get("score")) or severity_risk(str(threat.get("severity") or "medium")))
        tid = stable_id("cyber", threat.get("id") or title)
        add_node(nodes, {
            "id": tid, "type": "CyberIndicator", "label": title[:120], "risk": min(100, risk),
            "weight": max(1, risk / 30), "tags": ["cyber", str(threat.get("category") or "general").lower()],
            "sources": [f"pandora-cyberdef:{threat.get('source') or 'aggregate'}"],
            "classification": "diffusion_restreinte",
            "properties": {"type": threat.get("type"), "source": threat.get("source"),
                      "severity": threat.get("severity")},
        })
        add_edge(edges, root_id, tid, "HAS_CYBER_INDICATOR", max(1, risk / 40))
        if threat.get("source"):
            src_id = stable_id("source", threat["source"])
            add_node(nodes, {"id": src_id, "type": "Source", "label": str(threat["source"]),
                             "risk": 20, "weight": 1, "tags": ["source"], "sources": ["pandora-cyberdef"],
                             "classification": "public"})
            add_edge(edges, tid, src_id, "ATTRIBUTED_TO", 3, {"source": threat["source"]})

    # ── Nuclear actors (strategic posture) ─────────────────────────────────────
    actor_region: dict[str, tuple[str, str, str]] = {}
    for actor in _items(payloads.get("nuclear"), "countries"):
        key = str(actor.get("key") or "")
        centroid = NUCLEAR_ACTOR_CENTROIDS.get(key)
        band = str(actor.get("arsenal_band") or "unknown")
        risk = {"very_high": 90, "high": 72, "medium": 52, "low": 30}.get(band, 35)
        nid = stable_id("nuclear-actor", key or actor.get("name"))
        add_node(nodes, {
            "id": nid, "type": "NuclearActor", "label": str(actor.get("name") or key.title()),
            "risk": risk, "weight": max(2, risk / 20),
            "lat": centroid[0] if centroid else None, "lon": centroid[1] if centroid else None,
            "tags": ["nuclear", band],
            "sources": ["pandora-nuclear"],
            "classification": "secret", "compartments": ["nuclear"],
            "properties": {"arsenalBand": band, "warheadsBand": actor.get("estimated_warheads_band"),
                      "region": actor.get("region")},
        })
        add_edge(edges, root_id, nid, "HAS_NUCLEAR_ACTOR", max(1, risk / 30))
        if key:
            actor_region[key] = (nid, band, str(actor.get("region") or ""))

    escalatory = {k: v for k, v in actor_region.items() if v[1] in {"very_high", "high"}}
    for key_a, (id_a, band_a, region_a) in escalatory.items():
        for key_b, (id_b, band_b, _) in escalatory.items():
            if key_a >= key_b or actor_region[key_a][2] != actor_region[key_b][2]:
                continue
            add_edge(edges, id_a, id_b, "ESCALATES_WITH", 4,
                     {"regions": region_a, "bands": [band_a, band_b]})

    # ── Digest signals + alerts (correlation layer) ────────────────────────────
    for item in (digest.get("priorityItems") if isinstance(digest.get("priorityItems"), list) else []):
        if not isinstance(item, dict):
            continue
        risk = severity_risk(str(item.get("severity") or "medium"))
        iid = stable_id("signal", item.get("id") or item.get("title"))
        add_node(nodes, {
            "id": iid, "type": "Signal", "label": str(item.get("title") or "Signal")[:120],
            "risk": risk, "weight": max(2, risk / 20),
            "tags": ["signal", str(item.get("category") or "general").lower()],
            "sources": [str(item.get("source") or "digest")], "classification": "confidentiel",
            "properties": {"severity": item.get("severity"), "category": item.get("category"),
                      "location": item.get("location")},
        })
        add_edge(edges, root_id, iid, "HAS_SIGNAL", max(1, risk / 30))
        cat_id = stable_id("category", item.get("category") or "General")
        add_node(nodes, {"id": cat_id, "type": "Category", "label": str(item.get("category") or "General"),
                         "risk": risk, "weight": 2, "tags": ["category"], "sources": ["ontology"],
                         "classification": "public"})
        add_edge(edges, iid, cat_id, "CLASSIFIED_AS", 2)

    for alert in _items(alerts_payload, "alerts"):
        risk = severity_risk(str(alert.get("level") or "medium"))
        aid = stable_id("alert", alert.get("id") or alert.get("title"))
        add_node(nodes, {
            "id": aid, "type": "Alert", "label": str(alert.get("title") or "Alert")[:120],
            "risk": risk, "weight": max(3, risk / 18),
            "tags": ["alert", str(alert.get("level") or "medium").lower()],
            "sources": [str(alert.get("source") or "pandora-alerts")],
            "classification": "diffusion_restreinte",
            "properties": {"level": alert.get("level"), "category": alert.get("category"),
                      "location": alert.get("location"), "timestamp": alert.get("timestamp")},
        })
        add_edge(edges, root_id, aid, "HAS_ALERT", max(1, risk / 25))
        cat_id = stable_id("category", alert.get("category") or "General")
        add_node(nodes, {"id": cat_id, "type": "Category", "label": str(alert.get("category") or "General"),
                         "risk": risk, "weight": 2, "tags": ["category"], "sources": ["ontology"],
                         "classification": "public"})
        add_edge(edges, aid, cat_id, "ALERT_CATEGORY", 2)
        loc = alert.get("location")
        if loc:
            loc_id = stable_id("location", loc)
            add_node(nodes, {"id": loc_id, "type": "Location", "label": str(loc), "risk": 40,
                             "weight": 1, "tags": ["location"], "sources": ["location"],
                             "classification": "public"})
            add_edge(edges, aid, loc_id, "ALERT_AT", 3)

    node_list = sorted(nodes.values(), key=lambda n: (float(n.get("risk", 0)), float(n.get("weight", 0))), reverse=True)
    edge_list = [e for e in edges.values() if e["source"] in nodes and e["target"] in nodes]

    # The root advertises only the sources that actually contributed entities — a degraded
    # source must not appear as a domain of the picture.
    contributing = sorted({s for n in node_list if n["id"] != root_id for s in (n.get("sources") or [])})
    nodes[root_id]["sources"] = contributing

    type_counts: dict[str, int] = {}
    domain_counts: dict[str, int] = {}
    for node in node_list:
        if node["id"] == root_id:
            continue
        type_counts[str(node.get("type"))] = type_counts.get(str(node.get("type")), 0) + 1
        for src in node.get("sources") or []:
            root = str(src).split(":")[0]
            domain_counts[root] = domain_counts.get(root, 0) + 1

    return {
        "mode": "pandora-knowledge-graph",
        "generatedAt": digest.get("generatedAt"),
        "stats": {
            "nodes": len(node_list),
            "edges": len(edge_list),
            "types": type_counts,
            "domains": domain_counts,
            "relations": sorted({e["relation"] for e in edge_list}),
            "sampled": {"aircraft": len(aircraft_items), "cyber": min(40, len(_items(payloads.get("cyberdef"), "threats")))},
        },
        "degraded": degraded,
        "sources": {name: bool(payloads.get(name)) for name in SOURCE_KEYS},
        "nodes": node_list,
        "edges": edge_list,
    }


def filter_by_clearance(graph: dict[str, Any], clearance: str, compartments: list[str] | None = None) -> dict[str, Any]:
    """Drop nodes (and their edges) whose classification outranks the caller's clearance."""
    held = set(compartments or [])
    limit = rank(clearance)
    kept: list[dict[str, Any]] = []
    dropped = 0
    for node in graph.get("nodes") or []:
        if rank(node.get("classification")) > limit:
            dropped += 1
            continue
        needed = set(node.get("compartments") or [])
        if needed - held:
            dropped += 1
            continue
        kept.append(node)
    ids = {n["id"] for n in kept}
    edges = [e for e in (graph.get("edges") or []) if e["source"] in ids and e["target"] in ids]
    types: dict[str, int] = {}
    domains: dict[str, int] = {}
    for node in kept:
        if node["id"] == "pandora-operational-picture":
            continue
        types[str(node.get("type"))] = types.get(str(node.get("type")), 0) + 1
        for src in node.get("sources") or []:
            key = str(src).split(":")[0]
            domains[key] = domains.get(key, 0) + 1
    return {
        **graph,
        "nodes": kept,
        "edges": edges,
        "acl": {"clearance": clearance, "compartments": sorted(held), "droppedNodes": dropped,
                "policy": "nodes above the caller clearance are removed with their edges"},
        "stats": {**(graph.get("stats") or {}), "nodes": len(kept), "edges": len(edges),
                  "types": types, "domains": domains,
                  "totalNodesBeforeAcl": (graph.get("stats") or {}).get("nodes", len(kept))},
    }


def ego(graph: dict[str, Any], entity_id: str) -> dict[str, Any] | None:
    """Entity pivot: the node, its direct neighbours and the sources that contributed it."""
    node = next((n for n in graph.get("nodes") or [] if n["id"] == entity_id), None)
    if not node:
        return None
    by_id = {n["id"]: n for n in graph.get("nodes") or []}
    incoming, outgoing = [], []
    for edge in graph.get("edges") or []:
        if edge["target"] == entity_id and edge["source"] in by_id:
            incoming.append({**edge, "neighbour": by_id[edge["source"]]})
        elif edge["source"] == entity_id and edge["target"] in by_id:
            outgoing.append({**edge, "neighbour": by_id[edge["target"]]})
    neighbours = incoming + outgoing
    return {
        "mode": "pandora-knowledge-graph-entity",
        "entity": node,
        "neighbours": neighbours,
        "degree": len(neighbours),
        "relations": sorted({n["relation"] for n in neighbours}),
        "contributingSources": node.get("sources") or [],
        "riskRank": sorted((n["neighbour"] for n in neighbours), key=lambda n: -float(n.get("risk", 0)))[:10],
    }


def search(graph: dict[str, Any], query: str, entity_type: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    q = (query or "").strip().lower()
    out = []
    for node in graph.get("nodes") or []:
        if entity_type and str(node.get("type")) != entity_type:
            continue
        if q and q not in str(node.get("label", "")).lower() and q not in str(node.get("id", "")).lower():
            continue
        out.append({"id": node["id"], "type": node.get("type"), "label": node.get("label"),
                    "risk": node.get("risk"), "classification": node.get("classification"),
                    "sources": node.get("sources")})
    out.sort(key=lambda n: -float(n.get("risk") or 0))
    return out[: max(1, min(limit, 200))]


async def get_graph(force: bool = False) -> tuple[dict[str, Any], list[str]]:
    """Graphe construit, mis en cache sous la même durée de vie que les collectes.

    `build()` parcourt plusieurs milliers d'entités et était refait à CHAQUE requête —
    graphe, recherche, entité — alors que seules les collectes étaient cachées.
    `/entity/<id>` reconstruisait donc tout le graphe pour rendre une seule entité.

    Le graphe rendu est en LECTURE SEULE pour les appelants : `filter_by_clearance`,
    `ego` et `search` construisent de nouvelles listes sans modifier les nœuds. Le
    filtrage par clearance reste appliqué PAR REQUÊTE et n'est jamais mis en cache.
    """
    if not force and _CACHE["graph"] is not None and (time() - _CACHE["graph_ts"]) < CACHE_TTL:
        return _CACHE["graph"], list(_CACHE["degraded"])

    async with _BUILD_LOCK:
        # Re-vérifier sous le verrou : pendant l'attente, une autre requête a pu construire.
        if not force and _CACHE["graph"] is not None and (time() - _CACHE["graph_ts"]) < CACHE_TTL:
            return _CACHE["graph"], list(_CACHE["degraded"])

        payloads, degraded = await collect(force=force)
        built = build(payloads, payloads.get("digest") or {}, payloads.get("alerts") or {}, degraded)
        _CACHE.update({"graph": built, "graph_ts": time(), "degraded": degraded})
        return built, degraded
