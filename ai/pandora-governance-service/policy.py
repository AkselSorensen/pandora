"""Pandora ABAC policy engine.

Zero Trust: deny by default. A request is authorised only if an explicit rule allows it.
No external calls, no state — pure function of (subject, action, resource).
"""
from typing import Any, Literal

Classification = Literal["public", "diffusion_restreinte", "confidentiel", "secret"]
Action = Literal["read", "search", "export", "share", "write", "close", "delete", "annotate"]

CLASSIFICATIONS: list[str] = ["public", "diffusion_restreinte", "confidentiel", "secret"]
LEVEL_RANK = {level: i for i, level in enumerate(CLASSIFICATIONS)}

# Nomenclature FR (équivalent NP / DR / C / S) — le vocabulaire interne reste snake_case.
CLASSIFICATION_LABELS = {
    "public": "NP — Non protégé (sources ouvertes)",
    "diffusion_restreinte": "DR — Diffusion restreinte",
    "confidentiel": "C — Confidentiel",
    "secret": "S — Secret (compartiment obligatoire)",
}

ROLE_RANK = {"observer": 1, "auditor": 2, "analyst": 2, "lead": 3}

# action -> (role minimum, mutating)
ACTION_POLICY: dict[str, tuple[int, bool]] = {
    "read": (1, False),
    "search": (1, False),
    "export": (2, False),
    "share": (2, False),
    "write": (2, True),
    "close": (3, True),
    "delete": (3, True),
    # `annotate` produit un objet NOUVEAU qui référence la cible ; ce n'est pas une
    # modification de la cible, donc `write` ne décrirait pas l'acte. Marqué mutant à
    # dessein : annoter hérite ainsi de `no_write_on_secret` (on n'annote pas un objet
    # secret) et un auditeur, en lecture seule, ne peut pas annoter.
    "annotate": (2, True),
}

# Nature de l'annotation — une DONNÉE, pas une action. Trois actions de politique
# pour « noter / confirmer / écarter » dupliqueraient les mêmes règles.
ANNOTATION_KINDS: tuple[str, ...] = ("note", "confirm", "dismiss")

COMPARTMENT_REQUIRED_LEVELS = {"secret"}
NEVER_DELEGABLE = {"export", "share", "delete"}


def evaluate(subject: dict[str, Any], action: str, resource: dict[str, Any]) -> dict[str, Any]:
    """Return {'decision': 'allow'|'deny', 'reason': str, 'obligations': [str]}."""
    obligations: list[str] = []

    # --- Zero Trust preconditions -------------------------------------------------
    if not subject.get("attestation"):
        return {"decision": "deny", "reason": "missing_attestation", "obligations": []}
    if action not in ACTION_POLICY:
        return {"decision": "deny", "reason": "unknown_action", "obligations": []}
    role = str(subject.get("role") or "")
    if role not in ROLE_RANK:
        return {"decision": "deny", "reason": "unknown_role", "obligations": []}
    classification = str(resource.get("classification") or "")
    if classification not in LEVEL_RANK:
        return {"decision": "deny", "reason": "unclassified_resource", "obligations": []}

    # --- Clearance vs classification ---------------------------------------------
    clearance = str(subject.get("clearance") or "")
    if clearance not in LEVEL_RANK:
        return {"decision": "deny", "reason": "unknown_clearance", "obligations": []}
    if LEVEL_RANK[clearance] < LEVEL_RANK[classification]:
        return {"decision": "deny", "reason": "clearance_insufficient", "obligations": []}

    # --- Compartimentation --------------------------------------------------------
    needed = set(resource.get("compartments") or [])
    held = set(subject.get("compartments") or [])
    if classification in COMPARTMENT_REQUIRED_LEVELS and not needed:
        return {"decision": "deny", "reason": "secret_without_compartment", "obligations": []}
    if needed - held:
        return {"decision": "deny", "reason": "compartment_missing", "obligations": []}

    # --- Action rules -------------------------------------------------------------
    min_role, mutating = ACTION_POLICY[action]
    if ROLE_RANK[role] < min_role:
        return {"decision": "deny", "reason": "role_insufficient", "obligations": []}
    if mutating and classification == "secret":
        return {"decision": "deny", "reason": "no_write_on_secret", "obligations": []}

    # --- Séparation des tâches : l'auditeur ne modifie jamais ---------------------
    if role == "auditor" and mutating:
        return {"decision": "deny", "reason": "auditor_read_only", "obligations": []}

    # --- Compartiment nucléaire : tout export laisse une trace dédiée -------------
    if action in NEVER_DELEGABLE and "nuclear" in needed:
        obligations.append("log_to_nuclear_register")
    if subject.get("no_export") and action in NEVER_DELEGABLE:
        return {"decision": "deny", "reason": "export_forbidden_by_attribute", "obligations": obligations}

    if resource.get("owner") and resource.get("owner") != subject.get("operator") and mutating:
        obligations.append("cross_owner_write")

    # --- Rétention ----------------------------------------------------------------
    if resource.get("retention_days") is not None:
        obligations.append(f"retention_{int(resource['retention_days'])}d")

    return {"decision": "allow", "reason": "policy_allow", "obligations": obligations}


def policy_catalogue() -> dict[str, Any]:
    """Machine-readable view of the policy for the UI and the docs."""
    return {
        "classifications": [{"id": c, "label": CLASSIFICATION_LABELS[c], "rank": LEVEL_RANK[c]} for c in CLASSIFICATIONS],
        "roles": ROLE_RANK,
        "actions": {a: {"minRole": r, "mutating": m} for a, (r, m) in ACTION_POLICY.items()},
        "rules": [
            "attestation_required",
            "deny_by_default",
            "clearance_gte_classification",
            "compartments_must_be_held",
            "secret_requires_compartment",
            "no_write_on_secret",
            "auditor_read_only",
            "no_export_attribute",
        ],
    }
