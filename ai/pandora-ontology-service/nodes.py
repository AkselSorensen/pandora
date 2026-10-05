"""Shared node/edge helpers for the Pandora ontology and knowledge graph.

Kept dependency-free and pure so both builders (digest/alerts ontology and the multi-domain
graph) share exactly one implementation of identity, weighting and location extraction.
"""
import hashlib
import re
from math import asin, cos, radians, sin, sqrt
from typing import Any


def slug(value: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "unknown").lower()).strip("-")
    return text[:90] or "unknown"


def stable_id(prefix: str, value: Any) -> str:
    raw = str(value or prefix)
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"{prefix}-{slug(raw)[:48]}-{digest}"


def add_node(nodes: dict[str, dict[str, Any]], node: dict[str, Any]) -> dict[str, Any]:
    """Merge a node on stable id: risks/weights take the max, tags/sources accumulate."""
    node_id = str(node["id"])
    if node_id in nodes:
        existing = nodes[node_id]
        existing["weight"] = max(float(existing.get("weight", 1)), float(node.get("weight", 1)))
        existing["risk"] = max(float(existing.get("risk", 0)), float(node.get("risk", 0)))
        tags = set(existing.get("tags") or [])
        tags.update(node.get("tags") or [])
        existing["tags"] = sorted(tags)
        existing["sources"] = sorted(set(existing.get("sources") or []) | set(node.get("sources") or []))
        existing.setdefault("properties", {}).update({k: v for k, v in (node.get("properties") or {}).items() if v is not None})
        return existing
    nodes[node_id] = node
    return node


def add_edge(edges: dict[str, dict[str, Any]], source: str, target: str, relation: str,
             weight: float = 1, evidence: Any = None) -> None:
    if source == target:
        return
    edge_id = f"edge-{source}-{relation}-{target}"
    edges[edge_id] = {
        "id": edge_id,
        "source": source,
        "target": target,
        "relation": relation,
        "weight": round(float(weight), 2),
        "evidence": evidence,
    }


def severity_risk(severity: str) -> int:
    return {"critical": 95, "high": 75, "medium": 45, "low": 20}.get(str(severity).lower(), 35)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


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
            "classification": "public",
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
        "classification": "public",
    })
    return node_id
