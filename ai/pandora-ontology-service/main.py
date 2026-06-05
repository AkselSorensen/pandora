import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI


APP_NAME = "Pandora Ontology Service"
PANDORA_DIGEST_URL = os.getenv("PANDORA_DIGEST_URL", "http://pandora-digest:7702").rstrip("/")
PANDORA_ALERTS_URL = os.getenv("PANDORA_ALERTS_URL", "http://pandora-alerts:7703").rstrip("/")

app = FastAPI(title=APP_NAME, version="0.1.0")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slug(value: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "unknown").lower()).strip("-")
    return text[:90] or "unknown"


def stable_id(prefix: str, value: Any) -> str:
    raw = str(value or prefix)
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"{prefix}-{slug(raw)[:48]}-{digest}"


def add_node(nodes: dict[str, dict[str, Any]], node: dict[str, Any]) -> dict[str, Any]:
    node_id = str(node["id"])
    if node_id in nodes:
        existing = nodes[node_id]
        existing["weight"] = max(float(existing.get("weight", 1)), float(node.get("weight", 1)))
        existing["risk"] = max(float(existing.get("risk", 0)), float(node.get("risk", 0)))
        existing_tags = set(existing.get("tags") or [])
        existing_tags.update(node.get("tags") or [])
        existing["tags"] = sorted(existing_tags)
        existing["sources"] = sorted(set(existing.get("sources") or []) | set(node.get("sources") or []))
        return existing
    nodes[node_id] = node
    return node


def add_edge(edges: dict[str, dict[str, Any]], source: str, target: str, relation: str, weight: float = 1, evidence: str | None = None) -> None:
    if source == target:
        return
    edge_id = f"edge-{source}-{relation}-{target}"
    edges[edge_id] = {
        "id": edge_id,
        "source": source,
        "target": target,
        "relation": relation,
        "weight": weight,
        "evidence": evidence,
    }


def severity_risk(severity: str) -> int:
    return {"critical": 95, "high": 75, "medium": 45, "low": 20}.get(str(severity).lower(), 35)


def extract_location_node(nodes: dict[str, dict[str, Any]], value: Any) -> str | None:
    if not value:
        return None
    label = str(value)
    if re.match(r"^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$", label):
        node_id = stable_id("geo", label)
        add_node(nodes, {
            "id": node_id,
            "type": "GeoPoint",
            "label": label,
            "risk": 35,
            "weight": 1,
            "tags": ["geo"],
            "sources": ["location"],
        })
        return node_id
    node_id = stable_id("location", label)
    add_node(nodes, {
        "id": node_id,
        "type": "Location",
        "label": label,
        "risk": 40,
        "weight": 1,
        "tags": ["location"],
        "sources": ["location"],
    })
    return node_id


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
        "digest_url": PANDORA_DIGEST_URL,
        "alerts_url": PANDORA_ALERTS_URL,
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