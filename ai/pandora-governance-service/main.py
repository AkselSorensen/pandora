"""Pandora Governance Service — ABAC policy decisions + tamper-evident audit journal.

Fail closed: if the journal cannot be written, the decision becomes a deny. An access
control decision that is not journalised is not a decision.
"""
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

import audit
from policy import ACTION_POLICY, CLASSIFICATIONS, CLASSIFICATION_LABELS, LEVEL_RANK, evaluate, policy_catalogue
from sources import API_RESOURCES, RETENTION_DAYS, resolve, summary as resource_summary

APP_NAME = "Pandora Governance Service"
APP_VERSION = "0.1.0"
app = FastAPI(title=APP_NAME, version=APP_VERSION)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Subject(BaseModel):
    operator: str = Field(...)
    role: str = Field("observer")
    clearance: str = Field("public")
    compartments: list[str] = Field(default_factory=list)
    attestation: str | None = None
    no_export: bool = False


class Resource(BaseModel):
    id: str | None = None
    type: str = Field(...)
    classification: str = Field(...)
    compartments: list[str] = Field(default_factory=list)
    owner: str | None = None
    retention_days: int | None = None


class EvaluateRequest(BaseModel):
    subject: Subject
    action: str = Field(...)
    resource: Resource


class OperatorProfile(BaseModel):
    role: str = Field("analyst")
    clearance: str = Field("confidentiel")
    compartments: list[str] = Field(default_factory=list)
    no_export: bool = False


@app.get("/health")
async def health() -> dict[str, Any]:
    conn = audit.connect()
    try:
        entries = conn.execute("SELECT COUNT(*) c FROM audit").fetchone()["c"]
        operators = conn.execute("SELECT COUNT(*) c FROM operators").fetchone()["c"]
    finally:
        conn.close()
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": APP_VERSION,
        "db": audit.DB_PATH,
        "entries": entries,
        "operators": operators,
        "timestamp": now(),
    }


@app.get("/labels")
async def labels() -> dict[str, Any]:
    """Everything the UI needs to render classification: vocabulary, policy, route table."""
    return {
        "mode": "pandora-governance-service",
        "generatedAt": now(),
        "classifications": [
            {"id": c, "label": CLASSIFICATION_LABELS[c], "rank": LEVEL_RANK[c], "retentionDays": RETENTION_DAYS[c]}
            for c in CLASSIFICATIONS
        ],
        "policy": policy_catalogue(),
        "resources": resource_summary(),
        "enforcement": {
            "mode": "fail_closed",
            "enforcedBy": "src/proxy.ts",
            "note": "A classified resource is served only on an explicit allow decision, journalised in the audit chain.",
        },
    }


@app.get("/resources")
async def resources() -> dict[str, Any]:
    return {"mode": "pandora-governance-service", "generatedAt": now(), **resource_summary()}


@app.post("/policy/evaluate")
async def policy_evaluate(req: EvaluateRequest) -> dict[str, Any]:
    subject = req.subject.model_dump()
    resource = req.resource.model_dump()
    decision = evaluate(subject, req.action, resource)

    conn = audit.connect()
    try:
        entry = audit.append(conn, subject, req.action, resource, decision)
    except Exception as exc:  # journal unavailable -> fail closed
        return {
            "decision": "deny",
            "reason": "audit_unavailable",
            "obligations": [],
            "at": now(),
            "journalError": str(exc)[:200],
        }
    finally:
        conn.close()

    return {**decision, "seq": entry["seq"], "hash": entry["hash"], "at": entry["at"]}


@app.get("/audit")
async def audit_tail(
    limit: int = Query(100, ge=1, le=1000),
    actor: str | None = None,
    decision: str | None = None,
    classification: str | None = None,
) -> dict[str, Any]:
    conn = audit.connect()
    try:
        entries = audit.tail(conn, limit=limit, actor=actor, decision=decision, classification=classification)
    finally:
        conn.close()
    return {
        "mode": "pandora-governance-service",
        "generatedAt": now(),
        "limit": limit,
        "count": len(entries),
        "entries": entries,
    }


@app.get("/audit/verify")
async def audit_verify() -> dict[str, Any]:
    conn = audit.connect()
    try:
        result = audit.verify(conn)
    finally:
        conn.close()
    return {"mode": "pandora-governance-service", **result}


@app.get("/posture")
async def posture() -> dict[str, Any]:
    conn = audit.connect()
    try:
        stats = audit.stats(conn)
        operators = audit.list_operators(conn)
    finally:
        conn.close()
    return {"mode": "pandora-governance-service", "generatedAt": now(), **stats, "operators": operators}


@app.get("/operators")
async def operators_list() -> dict[str, Any]:
    conn = audit.connect()
    try:
        operators = audit.list_operators(conn)
    finally:
        conn.close()
    return {"mode": "pandora-governance-service", "generatedAt": now(), "count": len(operators), "operators": operators}


@app.get("/operators/{operator}")
async def operator_get(operator: str) -> dict[str, Any]:
    conn = audit.connect()
    try:
        profile = audit.get_operator(conn, operator)
    finally:
        conn.close()
    if not profile:
        raise HTTPException(status_code=404, detail="operator_not_registered")
    return profile


@app.put("/operators/{operator}")
async def operator_put(operator: str, profile: OperatorProfile) -> dict[str, Any]:
    if profile.role not in {"observer", "auditor", "analyst", "lead"}:
        raise HTTPException(status_code=422, detail="unknown_role")
    if profile.clearance not in LEVEL_RANK:
        raise HTTPException(status_code=422, detail="unknown_clearance")
    conn = audit.connect()
    try:
        stored = audit.put_operator(conn, operator, profile.role, profile.clearance,
                                    profile.compartments, profile.no_export)
    finally:
        conn.close()
    return stored


@app.get("/policy/catalogue")
async def policy_catalogue_endpoint() -> dict[str, Any]:
    return {
        "mode": "pandora-governance-service",
        "generatedAt": now(),
        "actions": {a: {"minRole": r, "mutating": m} for a, (r, m) in ACTION_POLICY.items()},
        **policy_catalogue(),
        "resources": resource_summary(),
        "routeTableSize": len(API_RESOURCES),
    }
