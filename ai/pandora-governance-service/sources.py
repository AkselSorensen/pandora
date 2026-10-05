"""Classification registry — the single source of truth for resource sensitivity.

A resource is classified by its SOURCE sensitivity, never by guessing. The vocabulary is
closed (4 levels) and 'secret' is only reachable with an explicit compartment.

This table is mirrored in src/lib/classification.ts (frontend) so the UI can render the
same badges and the same rules. Keep both files in sync — the /labels endpoint returns
this table so a drift is detectable at runtime.
"""
from typing import Any

API_RESOURCES: dict[str, dict[str, Any]] = {
    # ── Sources ouvertes ────────────────────────────────────────────────────────
    "/api/health": {"type": "service", "classification": "public"},
    # Authentification : joignable avant toute session, sinon on ne peut pas se
    # connecter. Ne renvoie aucune donnee classifiee, seulement une identite.
    "/api/auth/login": {"type": "auth", "classification": "public"},
    "/api/auth/logout": {"type": "auth", "classification": "public"},
    "/api/auth/session": {"type": "auth", "classification": "public"},
    "/api/flights": {"type": "feed", "classification": "public"},
    "/api/earthquakes": {"type": "feed", "classification": "public"},
    "/api/fires": {"type": "feed", "classification": "public"},
    "/api/weather": {"type": "feed", "classification": "public"},
    "/api/air-quality": {"type": "feed", "classification": "public"},
    "/api/gdelt": {"type": "feed", "classification": "public"},
    "/api/news": {"type": "feed", "classification": "public"},
    "/api/live-news": {"type": "feed", "classification": "public"},
    "/api/maritime": {"type": "feed", "classification": "public"},
    "/api/satellites": {"type": "feed", "classification": "public"},
    "/api/space-weather": {"type": "feed", "classification": "public"},
    "/api/cctv": {"type": "feed", "classification": "public"},
    "/api/markets": {"type": "feed", "classification": "public"},
    "/api/aerospace": {"type": "feed", "classification": "public"},
    "/api/public-intel": {"type": "catalogue", "classification": "public"},
    "/api/sovereignty": {"type": "governance", "classification": "public"},
    # ── Diffusion restreinte : agrégation, analyse, cibles d'intérêt ────────────
    "/api/airbases": {"type": "infra", "classification": "diffusion_restreinte"},
    "/api/french-airbases": {"type": "infra", "classification": "diffusion_restreinte"},
    "/api/osm-critical": {"type": "infra", "classification": "diffusion_restreinte"},
    "/api/infrastructure": {"type": "infra", "classification": "diffusion_restreinte"},
    "/api/frontlines": {"type": "conflict", "classification": "diffusion_restreinte"},
    "/api/hotspots": {"type": "risk", "classification": "diffusion_restreinte"},
    "/api/territorial": {"type": "risk", "classification": "diffusion_restreinte"},
    "/api/risk": {"type": "risk", "classification": "diffusion_restreinte"},
    "/api/country-risk": {"type": "risk", "classification": "diffusion_restreinte"},
    "/api/country-risk-geo": {"type": "risk", "classification": "diffusion_restreinte"},
    "/api/cyberdef": {"type": "cyber", "classification": "diffusion_restreinte"},
    "/api/cyber-geo": {"type": "cyber", "classification": "diffusion_restreinte"},
    "/api/cyber-threats": {"type": "cyber", "classification": "diffusion_restreinte"},
    "/api/darkweb-alerts": {"type": "osint", "classification": "diffusion_restreinte"},
    "/api/osint": {"type": "osint", "classification": "diffusion_restreinte"},
    "/api/osint/*": {"type": "osint", "classification": "diffusion_restreinte"},
    "/api/sentinel": {"type": "imagery", "classification": "diffusion_restreinte"},
    "/api/alerts": {"type": "alert", "classification": "diffusion_restreinte"},
    "/api/playbooks": {"type": "playbook", "classification": "diffusion_restreinte"},
    "/api/graph": {"type": "graph", "classification": "diffusion_restreinte"},
    "/api/graph/*": {"type": "graph", "classification": "diffusion_restreinte"},
    "/api/ontology": {"type": "graph", "classification": "diffusion_restreinte"},
    "/api/aip": {"type": "ai", "classification": "diffusion_restreinte"},
    # ── Confidentiel : renseignement consolidé, dossiers, outils actifs ────────
    "/api/dgsi": {"type": "territorial", "classification": "confidentiel"},
    "/api/region-dossier": {"type": "fusion", "classification": "confidentiel"},
    "/api/digest": {"type": "fusion", "classification": "confidentiel"},
    "/api/copilot": {"type": "ai", "classification": "confidentiel"},
    "/api/cases": {"type": "case", "classification": "confidentiel", "compartments": ["investigation"]},
    "/api/cases/*": {"type": "case", "classification": "confidentiel", "compartments": ["investigation"]},
    "/api/scanner": {"type": "recon", "classification": "confidentiel", "compartments": ["recon"]},
    "/api/governance/*": {"type": "governance", "classification": "confidentiel", "compartments": ["audit"]},
    # ── Secret : compartiment explicite obligatoire ────────────────────────────
    "/api/deterrence": {"type": "nuclear", "classification": "secret", "compartments": ["nuclear"]},
}

RETENTION_DAYS = {
    "public": 365,
    "diffusion_restreinte": 180,
    "confidentiel": 90,
    "secret": 30,
}

DEFAULT_CLASSIFICATION = "diffusion_restreinte"
DEFAULT_COMPARTMENTS: dict[str, list[str]] = {}


def resolve(path: str) -> dict[str, Any]:
    """Resolve a request path to its resource descriptor.

    Order: exact match → prefix match on wildcard keys → prefix match on the key itself
    (so /api/cases/abc inherits /api/cases) → conservative default (diffusion_restreinte).
    """
    clean = "/" + path.strip("/")
    if clean in API_RESOURCES:
        return _decorate(API_RESOURCES[clean], clean)

    wildcards = [k for k in API_RESOURCES if k.endswith("/*")]
    for key in sorted(wildcards, key=len, reverse=True):
        prefix = key[:-1]  # keep trailing slash
        if clean.startswith(prefix):
            return _decorate(API_RESOURCES[key], key)

    flat = [k for k in API_RESOURCES if not k.endswith("/*")]
    for key in sorted(flat, key=len, reverse=True):
        if clean.startswith(key + "/"):
            return _decorate(API_RESOURCES[key], key)

    return {
        "path": clean,
        "type": "unknown",
        "classification": DEFAULT_CLASSIFICATION,
        "compartments": DEFAULT_COMPARTMENTS.get(DEFAULT_CLASSIFICATION, []),
        "retentionDays": RETENTION_DAYS[DEFAULT_CLASSIFICATION],
        "matched": False,
    }


def _decorate(entry: dict[str, Any], matched_key: str) -> dict[str, Any]:
    classification = entry["classification"]
    return {
        "type": entry["type"],
        "classification": classification,
        "compartments": list(entry.get("compartments") or DEFAULT_COMPARTMENTS.get(classification, [])),
        "retentionDays": RETENTION_DAYS[classification],
        "matched": True,
        "matchedKey": matched_key,
    }


def summary() -> dict[str, Any]:
    by_class: dict[str, int] = {}
    for entry in API_RESOURCES.values():
        by_class[entry["classification"]] = by_class.get(entry["classification"], 0) + 1
    return {
        "total": len(API_RESOURCES),
        "byClassification": by_class,
        "resources": [
            {"path": path, "type": entry["type"], "classification": entry["classification"],
             "compartments": list(entry.get("compartments") or []),
             "retentionDays": RETENTION_DAYS[entry["classification"]]}
            for path, entry in sorted(API_RESOURCES.items())
        ],
    }
