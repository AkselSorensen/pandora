import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, Header, Query

import graph as graph_builder
from nodes import add_edge, add_node, extract_location_node, severity_risk, stable_id

APP_NAME = "Pandora Ontology Service"
APP_VERSION = "0.2.0"
PANDORA_DIGEST_URL = os.getenv("PANDORA_DIGEST_URL", "http://pandora-digest:7702").rstrip("/")
PANDORA_ALERTS_URL = os.getenv("PANDORA_ALERTS_URL", "http://pandora-alerts:7703").rstrip("/")

app = FastAPI(title=APP_NAME, version=APP_VERSION)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def subject_from(header: str | None) -> dict[str, Any]:
    """Subject forwarded by the Next proxy; conservative default (diffusion restreinte)."""
    default = {"operator": "anonymous", "role": "observer", "clearance": "diffusion_restreinte",
               "compartments": [], "attestation": None}
    if not header:
        return default
    try:
        parsed = json.loads(header)
        if isinstance(parsed, dict):
            return {**default, **parsed}
    except Exception:
        pass
    return default



def build_ontology(digest: dict[str, Any], alerts_payload: dict[str, Any]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[str, dict[str, Any]] = {}

    root_id = "pandora-operational-picture"
    add_node(nodes, {
        "id": root_id,
        "type": "OperationalPicture",
        "label": "Pandora Operational Picture",
        "risk": int(digest.get("riskScore") or 0),
        "weight": 8,
        "tags": ["root", str(digest.get("posture") or "routine").lower()],
        "sources": ["digest", "alerts"],
        "properties": {
            "posture": digest.get("posture"),
            "riskScore": digest.get("riskScore"),
            "generatedAt": digest.get("generatedAt"),
        },
    })

    digest_id = stable_id("digest", digest.get("generatedAt") or "latest")
    add_node(nodes, {
        "id": digest_id,
        "type": "Digest",
        "label": f"Digest {digest.get('posture', 'UNKNOWN')}",
        "risk": int(digest.get("riskScore") or 0),
        "weight": 6,
        "tags": ["digest", str(digest.get("posture") or "routine").lower()],
        "sources": ["pandora-digest"],
        "properties": {"mode": digest.get("mode"), "generatedAt": digest.get("generatedAt")},
    })
    add_edge(edges, root_id, digest_id, "HAS_DIGEST", 5, "Latest Pandora digest")

    for item in digest.get("priorityItems") if isinstance(digest.get("priorityItems"), list) else []:
        if not isinstance(item, dict):
            continue
        item_id = stable_id("incident", item.get("id") or item.get("title"))
        category = str(item.get("category") or "Signal")
        risk = severity_risk(str(item.get("severity") or "medium"))
        add_node(nodes, {
            "id": item_id,
            "type": "Signal",
            "label": item.get("title") or "Signal",
            "risk": risk,
            "weight": max(2, risk / 20),
            "tags": [category.lower(), str(item.get("severity") or "medium").lower(), *(item.get("tags") or [])],
            "sources": [str(item.get("source") or "digest")],
            "properties": item,
        })
        add_edge(edges, digest_id, item_id, "CONTAINS_SIGNAL", 3, "Digest priority item")

        category_id = stable_id("category", category)
        add_node(nodes, {
            "id": category_id,
            "type": "Category",
            "label": category,
            "risk": risk,
            "weight": 2,
            "tags": ["category"],
            "sources": ["ontology"],
        })
        add_edge(edges, item_id, category_id, "CLASSIFIED_AS", 2)

        source_label = item.get("source") or "Unknown source"
        source_id = stable_id("source", source_label)
        add_node(nodes, {
            "id": source_id,
            "type": "Source",
            "label": source_label,
            "risk": 20,
            "weight": 1,
            "tags": ["source"],
            "sources": ["ontology"],
        })
        add_edge(edges, item_id, source_id, "SUPPORTED_BY", 2)

        loc_id = extract_location_node(nodes, item.get("location"))
        if loc_id:
            add_edge(edges, item_id, loc_id, "OBSERVED_AT", 3, "Signal location")

    for alert in alerts_payload.get("alerts") if isinstance(alerts_payload.get("alerts"), list) else []:
        if not isinstance(alert, dict):
            continue
        alert_id = stable_id("alert", alert.get("id") or alert.get("title"))
        risk = severity_risk(str(alert.get("level") or "medium"))
        add_node(nodes, {
            "id": alert_id,
            "type": "Alert",
            "label": alert.get("title") or "Alert",
            "risk": risk,
            "weight": max(3, risk / 18),
            "tags": ["alert", str(alert.get("level") or "medium"), str(alert.get("category") or "general").lower()],
            "sources": [str(alert.get("source") or "pandora-alerts")],
            "properties": alert,
        })
        add_edge(edges, root_id, alert_id, "HAS_ALERT", 4, "Active alert")

        category_id = stable_id("category", alert.get("category") or "General")
        add_node(nodes, {
            "id": category_id,
            "type": "Category",
            "label": alert.get("category") or "General",
            "risk": risk,
            "weight": 2,
            "tags": ["category"],
            "sources": ["ontology"],
        })
        add_edge(edges, alert_id, category_id, "ALERT_CATEGORY", 2)

        loc_id = extract_location_node(nodes, alert.get("location"))
        if loc_id:
            add_edge(edges, alert_id, loc_id, "ALERT_AT", 3)

    node_list = sorted(nodes.values(), key=lambda n: (float(n.get("risk", 0)), float(n.get("weight", 0))), reverse=True)
    edge_list = list(edges.values())
    type_counts: dict[str, int] = {}
    for node in node_list:
        type_counts[str(node.get("type"))] = type_counts.get(str(node.get("type")), 0) + 1

    return {
        "mode": "pandora-ontology-service",
        "generatedAt": now_iso(),
        "summary": {
            "nodes": len(node_list),
            "edges": len(edge_list),
            "types": type_counts,
            "posture": digest.get("posture"),
            "riskScore": digest.get("riskScore"),
        },
        "nodes": node_list[:250],
        "edges": edge_list[:500],
    }


async def fetch_json(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    response = await client.get(url, headers={"User-Agent": "Pandora-Ontology-Service/1.0"})
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, dict) else {}


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": APP_VERSION,
        "digest_url": PANDORA_DIGEST_URL,
        "alerts_url": PANDORA_ALERTS_URL,
        "graph_sources": graph_builder.SERVICE_URLS,
        "graph_cache_ttl_s": graph_builder.CACHE_TTL,
        "timestamp": now_iso(),
    }


@app.get("/ontology")
async def ontology() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=40) as client:
        digest = await fetch_json(client, f"{PANDORA_DIGEST_URL}/digest")
        try:
            alerts = await fetch_json(client, f"{PANDORA_ALERTS_URL}/alerts")
        except Exception:
            alerts = {"alerts": []}
    return build_ontology(digest, alerts)


@app.get("/graph")
async def graph(
    domain: str | None = Query(None),
    type: str | None = Query(None),
    min_risk: float = Query(0, ge=0, le=100),
    limit: int = Query(300, ge=10, le=600),
    force: bool = Query(False),
    x_pandora_subject: str | None = Header(None),
) -> dict[str, Any]:
    """Multi-domain typed graph, filtered by the caller's clearance."""
    subject = subject_from(x_pandora_subject)
    graph_data, degraded = await graph_builder.get_graph(force=force)
    filtered = graph_builder.filter_by_clearance(graph_data, subject.get("clearance"), subject.get("compartments"))

    nodes = [n for n in filtered["nodes"] if float(n.get("risk") or 0) >= min_risk]
    if type:
        nodes = [n for n in nodes if str(n.get("type")).lower() == type.lower()]
    if domain:
        nodes = [n for n in nodes if any(domain.lower() in str(s).lower() for s in (n.get("sources") or []))]
    nodes = nodes[:limit]
    ids = {n["id"] for n in nodes}
    edges = [e for e in filtered["edges"] if e["source"] in ids and e["target"] in ids]

    return {
        **filtered,
        "degraded": degraded,
        "filters": {"domain": domain, "type": type, "minRisk": min_risk, "limit": limit},
        "returned": {"nodes": len(nodes), "edges": len(edges)},
        "nodes": nodes,
        "edges": edges,
    }


@app.get("/entities")
async def entities(
    q: str = Query("", description="label or id substring"),
    type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    x_pandora_subject: str | None = Header(None),
) -> dict[str, Any]:
    subject = subject_from(x_pandora_subject)
    graph_data, _ = await graph_builder.get_graph()
    filtered = graph_builder.filter_by_clearance(graph_data, subject.get("clearance"), subject.get("compartments"))
    results = graph_builder.search(filtered, q, type, limit)
    return {"mode": "pandora-knowledge-graph-search", "generatedAt": now_iso(),
            "query": q, "type": type, "count": len(results), "entities": results,
            "acl": filtered.get("acl")}


@app.get("/entity/{entity_id}")
async def entity(entity_id: str, x_pandora_subject: str | None = Header(None)) -> dict[str, Any]:
    """Entity pivot: neighbours, relations and contributing sources."""
    subject = subject_from(x_pandora_subject)
    graph_data, _ = await graph_builder.get_graph()
    filtered = graph_builder.filter_by_clearance(graph_data, subject.get("clearance"), subject.get("compartments"))
    pivot = graph_builder.ego(filtered, entity_id)
    if not pivot:
        return {"mode": "pandora-knowledge-graph-entity", "found": False, "entityId": entity_id,
                "acl": filtered.get("acl"),
                "hint": "entity unknown or filtered by the caller clearance"}
    return {**pivot, "found": True, "generatedAt": now_iso(), "acl": filtered.get("acl")}
