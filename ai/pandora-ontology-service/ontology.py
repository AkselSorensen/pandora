"""Ontologie déclarée de Pandora.

Les constructeurs de graphe (`graph.py` pour la situation multi-domaines,
`main.py:build_ontology` pour la vue digest/alertes) produisent des nœuds et des
arêtes. Jusqu'ici le vocabulaire — quels types d'objets existent, quelles
relations sont légales entre quels types, quelles propriétés porte un objet —
ne vivait que dans leur code : il n'était découvrable qu'en lisant la sortie, et
les deux constructeurs ont divergé (l'un écrit `properties`, l'autre `attrs` ;
l'un émet `CONTAINS_SIGNAL`, l'autre `HAS_SIGNAL`) sans que personne ne le voie.

Ce module énonce le modèle **une fois**. `validate()` confronte un graphe
construit à cette déclaration : un type inconnu, une relation inconnue ou une
arête entre deux types non autorisés est signalé, jamais accepté en silence.

Rien n'est inventé ici : ce fichier ne contient aucune donnée, seulement la
description des objets que les services produisent réellement.
"""

from __future__ import annotations
from typing import Any

# Palette de types de propriétés. Volontairement fermée : une propriété non
# typable doit se voir, pas se ranger dans un fourre-tout.
PROPERTY_TYPES = ("string", "number", "integer", "boolean", "timestamp", "enum", "geo")

OBJECT_TYPES: dict[str, dict[str, Any]] = {
    "OperationalPicture": {
        "label": "Situation opérationnelle",
        "domain": "root",
        "classification": "public",
        "description": "Racine du graphe : le point de situation consolidé du digest.",
        "properties": [
            {"name": "posture", "type": "enum", "description": "Posture du digest (routine, watch, alert…)"},
            {"name": "riskScore", "type": "integer", "description": "Score de risque consolidé 0-100"},
            {"name": "generatedAt", "type": "timestamp"},
            {"name": "degraded", "type": "string", "description": "Sources en échec lors de la construction"},
        ],
    },
    "Digest": {
        "label": "Digest",
        "domain": "intelligence",
        "classification": "public",
        "description": "Une édition du digest (vue digest/alertes uniquement).",
        "properties": [
            {"name": "mode", "type": "string"},
            {"name": "generatedAt", "type": "timestamp"},
            {"name": "posture", "type": "enum"},
            {"name": "riskScore", "type": "integer"},
        ],
    },
    "Aircraft": {
        "label": "Aéronef",
        "domain": "mobility",
        "classification": "public",
        "description": "Aéronef suivi par ADS-B. Diffusion publique par nature (balise).",
        "properties": [
            {"name": "model", "type": "string", "description": "Code type ICAO (ex. EUFI, C30J)"},
            {"name": "altitudeM", "type": "number", "unit": "m"},
            {"name": "speedKt", "type": "number", "unit": "kt"},
            {"name": "registration", "type": "string"},
            {"name": "category", "type": "enum", "description": "military | heli | jet | private | commercial | unknown"},
            {"name": "military", "type": "boolean"},
        ],
    },
    "Zone": {
        "label": "Zone de risque",
        "domain": "territorial",
        "classification": "diffusion_restreinte",
        "description": "Zone évaluée par le moteur territorial.",
        "properties": [
            {"name": "level", "type": "enum", "description": "routine | watch | elevated | critical"},
            {"name": "color", "type": "string"},
            {"name": "drivers", "type": "string", "description": "Facteurs ayant produit le score"},
        ],
    },
    "InfraSite": {
        "label": "Site d'infrastructure",
        "domain": "territorial",
        "classification": "diffusion_restreinte",
        "description": "Infrastructure critique ou sensible (renseignement territorial).",
        "properties": [
            {"name": "priority", "type": "enum", "description": "critical | high | medium | low"},
            {"name": "radiusKm", "type": "number", "unit": "km"},
            {"name": "type", "type": "string", "description": "Type d'infrastructure"},
        ],
    },
    "CyberIndicator": {
        "label": "Indicateur cyber",
        "domain": "cyber",
        "classification": "diffusion_restreinte",
        "description": "Menace ou indicateur agrégé par la cyberdéfense.",
        "properties": [
            {"name": "type", "type": "string"},
            {"name": "source", "type": "string", "description": "Source réelle ayant rapporté l'indicateur"},
            {"name": "severity", "type": "enum", "description": "low | medium | high | critical"},
        ],
    },
    "NuclearActor": {
        "label": "Acteur nucléaire",
        "domain": "strategic",
        "classification": "secret",
        "compartments": ["nuclear"],
        "description": "État doté, posture stratégique. Compartimenté : clearance ET compartiment requis.",
        "properties": [
            {"name": "arsenalBand", "type": "enum", "description": "very_high | high | medium | low | unknown"},
            {"name": "warheadsBand", "type": "string", "description": "Fourchette estimée, jamais un chiffre exact"},
            {"name": "region", "type": "string"},
        ],
    },
    "Signal": {
        "label": "Signal",
        "domain": "intelligence",
        "classification": "confidentiel",
        "description": "Élément prioritaire issu du digest.",
        "properties": [
            {"name": "severity", "type": "enum"},
            {"name": "category", "type": "string"},
            {"name": "location", "type": "string"},
        ],
    },
    "Alert": {
        "label": "Alerte",
        "domain": "intelligence",
        "classification": "diffusion_restreinte",
        "description": "Alerte du moteur d'alertes.",
        "properties": [
            {"name": "level", "type": "enum"},
            {"name": "category", "type": "string"},
            {"name": "location", "type": "string"},
            {"name": "timestamp", "type": "timestamp"},
        ],
    },
    "Source": {
        "label": "Source",
        "domain": "intelligence",
        "classification": "public",
        "description": "Source réelle ayant contribué une entité.",
        "properties": [],
    },
    "Category": {
        "label": "Catégorie",
        "domain": "reference",
        "classification": "public",
        "description": "Catégorie de classement d'un signal ou d'une alerte.",
        "properties": [],
    },
    "Location": {
        "label": "Lieu",
        "domain": "reference",
        "classification": "public",
        "description": "Lieu nommé mentionné par une source.",
        "properties": [],
    },
    "GeoPoint": {
        "label": "Point géographique",
        "domain": "reference",
        "classification": "public",
        "description": "Coordonnées sous forme textuelle.",
        "properties": [],
    },
}

# Un lien déclare qui peut pointer sur qui. Toute arête dont les extrémités
# violent ce contrat est une violation, pas une variante acceptable.
LINK_TYPES: dict[str, dict[str, Any]] = {
    "HAS_ZONE": {"label": "contient", "source": ["OperationalPicture"], "target": ["Zone"]},
    "HAS_INFRA": {"label": "contient", "source": ["OperationalPicture"], "target": ["InfraSite"]},
    "HAS_AIRCRAFT": {"label": "contient", "source": ["OperationalPicture"], "target": ["Aircraft"]},
    "HAS_CYBER_INDICATOR": {"label": "contient", "source": ["OperationalPicture"], "target": ["CyberIndicator"]},
    "HAS_NUCLEAR_ACTOR": {"label": "contient", "source": ["OperationalPicture"], "target": ["NuclearActor"]},
    "HAS_SIGNAL": {"label": "contient", "source": ["OperationalPicture"], "target": ["Signal"]},
    "HAS_ALERT": {"label": "contient", "source": ["OperationalPicture", "Digest"], "target": ["Alert"]},
    "HAS_DIGEST": {"label": "contient", "source": ["OperationalPicture"], "target": ["Digest"]},
    "CONTAINS_SIGNAL": {"label": "contient", "source": ["Digest"], "target": ["Signal"]},
    "LOCATED_IN": {"label": "situé dans", "source": ["InfraSite"], "target": ["Zone"]},
    "OPERATES_IN": {"label": "opère dans", "source": ["Aircraft"], "target": ["Zone"]},
    "OBSERVED_NEAR": {"label": "observé près de", "source": ["Aircraft"], "target": ["InfraSite"]},
    "ATTRIBUTED_TO": {"label": "attribué à", "source": ["CyberIndicator"], "target": ["Source"]},
    "SUPPORTED_BY": {"label": "étayé par", "source": ["Signal"], "target": ["Source"]},
    "ESCALATES_WITH": {"label": "escalade avec", "source": ["NuclearActor"], "target": ["NuclearActor"]},
    "CLASSIFIED_AS": {"label": "classé comme", "source": ["Signal", "Alert"], "target": ["Category"]},
    "ALERT_CATEGORY": {"label": "catégorie", "source": ["Alert"], "target": ["Category"]},
    "ALERT_AT": {"label": "située à", "source": ["Alert"], "target": ["Location", "GeoPoint"]},
    "OBSERVED_AT": {"label": "observé à", "source": ["Signal"], "target": ["Location", "GeoPoint"]},
}

# Constat de divergence entre les deux constructeurs. Déclaré plutôt que masqué :
# la déclaration couvre aujourd'hui les deux vocabulaires, et cette liste nomme
# ce qu'il reste à unifier. Tant qu'elle n'est pas vide, `/schema` l'expose.
VOCABULARY_DIVERGENCE: list[dict[str, str]] = [
    {
        "issue": "La clé des propriétés d'un nœud diffère selon le constructeur.",
        "detail": "main.py:build_ontology écrit `properties`, graph.py:build écrit `attrs`.",
        "impact": "Un consommateur ne peut pas lire les propriétés sans connaître le constructeur d'origine.",
    },
    {
        "issue": "Deux relations différentes pour la même intention.",
        "detail": "`CONTAINS_SIGNAL` (main.py) et `HAS_SIGNAL` (graph.py) relient tous deux un conteneur à un Signal.",
        "impact": "Le comptage des relations et la coloration par relation au front divergent selon l'endpoint interrogé.",
    },
    {
        "issue": "Le type `Digest` n'existe que dans la vue digest/alertes.",
        "detail": "graph.py ne produit jamais de nœud Digest ni d'arête HAS_DIGEST.",
        "impact": "Le graphe multi-domaines ne relie pas les signaux à l'édition de digest qui les a produits.",
    },
]


def object_type(name: str) -> dict[str, Any] | None:
    return OBJECT_TYPES.get(str(name))


def declared_types() -> list[str]:
    return sorted(OBJECT_TYPES)


def declared_relations() -> list[str]:
    return sorted(LINK_TYPES)


def schema() -> dict[str, Any]:
    """Le modèle complet, tel qu'exposé par `GET /schema`."""
    return {
        "mode": "pandora-ontology-schema",
        "propertyTypes": list(PROPERTY_TYPES),
        "objectTypes": [
            {"name": name, **definition} for name, definition in sorted(OBJECT_TYPES.items())
        ],
        "linkTypes": [
            {"name": name, **definition} for name, definition in sorted(LINK_TYPES.items())
        ],
        "counts": {"objectTypes": len(OBJECT_TYPES), "linkTypes": len(LINK_TYPES)},
        "vocabularyDivergence": VOCABULARY_DIVERGENCE,
        "policy": "un type, une relation ou une extrémité non déclarés sont des violations rapportées, pas des variantes tolérées",
    }


def _endpoint_ok(relation: str, source_type: str, target_type: str) -> bool:
    link = LINK_TYPES.get(relation)
    if not link:
        return False
    return source_type in link["source"] and target_type in link["target"]


def validate(graph: dict[str, Any], max_examples: int = 25) -> dict[str, Any]:
    """Confronte un graphe construit à l'ontologie déclarée.

    Ne lève jamais : renvoie toujours un rapport, avec au plus `max_examples`
    exemples par catégorie (les compteurs restent exhaustifs).
    """
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    by_id = {n.get("id"): n for n in nodes if isinstance(n, dict)}

    unknown_node_types: dict[str, int] = {}
    unknown_relations: dict[str, int] = {}
    invalid_endpoints: list[dict[str, str]] = []
    missing_endpoints = 0
    classification_conflicts: list[dict[str, str]] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type"))
        if node_type not in OBJECT_TYPES:
            unknown_node_types[node_type] = unknown_node_types.get(node_type, 0) + 1
            continue
        declared = OBJECT_TYPES[node_type]
        # Un nœud ne doit pas être plus diffus que son type ne l'autorise.
        if declared.get("classification") and not node.get("classification"):
            classification_conflicts.append({"id": str(node.get("id")), "detail": "classification absente"})

    for edge in edges:
        if not isinstance(edge, dict):
            continue
        relation = str(edge.get("relation"))
        source = by_id.get(edge.get("source"))
        target = by_id.get(edge.get("target"))
        if relation not in LINK_TYPES:
            unknown_relations[relation] = unknown_relations.get(relation, 0) + 1
            continue
        if source is None or target is None:
            missing_endpoints += 1
            continue
        if not _endpoint_ok(relation, str(source.get("type")), str(target.get("type"))):
            if len(invalid_endpoints) < max_examples:
                invalid_endpoints.append({
                    "id": str(edge.get("id")),
                    "relation": relation,
                    "sourceType": str(source.get("type")),
                    "targetType": str(target.get("type")),
                    "detail": f"{relation} n'autorise pas {source.get('type')} → {target.get('type')}",
                })

    violations = (
        sum(unknown_node_types.values())
        + sum(unknown_relations.values())
        + len(invalid_endpoints)
        + missing_endpoints
        + len(classification_conflicts)
    )

    return {
        "conforms": violations == 0,
        "checked": {"nodes": len(nodes), "edges": len(edges)},
        "violations": violations,
        "counts": {
            "unknownNodeTypes": sum(unknown_node_types.values()),
            "unknownRelations": sum(unknown_relations.values()),
            "invalidEndpoints": len(invalid_endpoints),
            "missingEndpoints": missing_endpoints,
            "classificationConflicts": len(classification_conflicts),
        },
        "examples": {
            "unknownNodeTypes": dict(sorted(unknown_node_types.items(), key=lambda kv: -kv[1])[:max_examples]),
            "unknownRelations": dict(sorted(unknown_relations.items(), key=lambda kv: -kv[1])[:max_examples]),
            "invalidEndpoints": invalid_endpoints,
            "classificationConflicts": classification_conflicts[:max_examples],
        },
        "policy": "un graphe qui ne conforme pas est rapporté, jamais corrigé en silence",
    }
