"""Pandora Cases Service — persistent analyst cases with chain of custody.

Every mutation is authorised by the governance service (ABAC) and journalised. If the
governance service is unreachable, writes are refused (503): a classified case must never
be modified without a journal entry.
"""
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

import db

APP_NAME = "Pandora Cases Service"
APP_VERSION = "0.2.0"
ONTOLOGY_URL = os.getenv("PANDORA_ONTOLOGY_URL", "http://pandora-ontology:7704").rstrip("/")
ALERTS_URL = os.getenv("PANDORA_ALERTS_URL", "http://pandora-alerts:7703").rstrip("/")
GOVERNANCE_URL = os.getenv("PANDORA_GOVERNANCE_URL", "http://pandora-governance:7715").rstrip("/")

# Fallback subject when the request does not carry one (direct service call / health probes).
SERVICE_SUBJECT = {
    "operator": "pandora-cases",
    "role": "analyst",
    "clearance": "confidentiel",
    "compartments": ["investigation"],
    "attestation": "service-internal",
}

app = FastAPI(title=APP_NAME, version=APP_VERSION)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sid(value: Any) -> str:
    return hashlib.sha1(str(value).encode("utf-8")).hexdigest()[:10]


def subject_from(header: str | None) -> dict[str, Any]:
    if not header:
        return dict(SERVICE_SUBJECT)
    try:
        parsed = json.loads(header)
        if isinstance(parsed, dict) and parsed.get("operator"):
            return parsed
    except Exception:
        pass
    return dict(SERVICE_SUBJECT)


class CaseCreate(BaseModel):
    title: str = Field(...)
    summary: str = ""
    hypothesis: str = ""
    priority: str = "watch"
    status: str = "open"
    owner: str | None = None
    classification: str = "confidentiel"
    compartments: list[str] = Field(default_factory=lambda: ["investigation"])
    origin: str = "manual"


class CaseUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    hypothesis: str | None = None
    status: str | None = None
    priority: str | None = None
    owner: str | None = None


class EvidenceCreate(BaseModel):
    kind: str = Field("source_ref")
    label: str = Field(...)
    source_url: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class EventCreate(BaseModel):
    kind: str = Field("note")
    body: dict[str, Any] | str = Field(default_factory=dict)


async def authorize(action: str, resource: dict[str, Any], subject: dict[str, Any]) -> dict[str, Any]:
    payload = {"subject": subject, "action": action, "resource": resource}
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(f"{GOVERNANCE_URL}/policy/evaluate", json=payload,
                                  headers={"User-Agent": "Pandora-Cases-Service/1.0"})
            r.raise_for_status()
            decision = r.json()
    except Exception as exc:
        return {"decision": "deny", "reason": "governance_unavailable",
                "obligations": [], "unavailable": True, "detail": str(exc)[:200]}
    return decision


def enforce(decision: dict[str, Any]) -> None:
    if decision.get("decision") == "allow":
        return
    if decision.get("unavailable"):
        raise HTTPException(status_code=503, detail={
            "error": "governance_unavailable",
            "reason": "no journal, no write",
            "governanceUrl": GOVERNANCE_URL,
            "detail": decision.get("detail"),
        })
    raise HTTPException(status_code=403, detail={
        "error": "abac_denied",
        "reason": decision.get("reason"),
        "obligations": decision.get("obligations") or [],
    })


def case_resource(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": case["id"],
        "type": "case",
        "classification": case.get("classification", "confidentiel"),
        "compartments": case.get("compartments") or ["investigation"],
        "owner": case.get("owner"),
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    conn = db.connect()
    try:
        stats = db.stats(conn)
    finally:
        conn.close()
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": APP_VERSION,
        "db": db.DB_PATH,
        "governance_url": GOVERNANCE_URL,
        "ontology_url": ONTOLOGY_URL,
        "alerts_url": ALERTS_URL,
        "counts": stats,
        "timestamp": now(),
    }


@app.get("/cases")
async def list_cases(status: str | None = Query(None), limit: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    if status and status not in db.STATUSES:
        raise HTTPException(status_code=422, detail="invalid_status")
    conn = db.connect()
    try:
        cases = db.list_cases(conn, status=status, limit=limit)
        stats = db.stats(conn)
    finally:
        conn.close()
    return {"mode": APP_NAME, "generatedAt": now(), "total": len(cases), "cases": cases, "stats": stats}


@app.post("/cases", status_code=201)
async def create_case(body: CaseCreate, x_pandora_subject: str | None = Header(None)) -> dict[str, Any]:
    subject = subject_from(x_pandora_subject)
    resource = {"type": "case", "classification": body.classification,
                "compartments": body.compartments or ["investigation"], "owner": body.owner}
    enforce(await authorize("write", resource, subject))
    conn = db.connect()
    try:
        try:
            case = db.create_case(conn, title=body.title, summary=body.summary, hypothesis=body.hypothesis,
                                  priority=body.priority, status=body.status, owner=body.owner,
                                  classification=body.classification, compartments=body.compartments,
                                  origin=body.origin, actor=subject["operator"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    finally:
        conn.close()
    return case


@app.get("/cases/{case_id}")
async def get_case(case_id: str) -> dict[str, Any]:
    conn = db.connect()
    try:
        case = db.get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="case_not_found")
        verification = db.verify_evidence(conn, case_id)
    finally:
        conn.close()
    case["evidenceIntegrity"] = verification
    return case


@app.patch("/cases/{case_id}")
async def patch_case(case_id: str, body: CaseUpdate, x_pandora_subject: str | None = Header(None)) -> dict[str, Any]:
    subject = subject_from(x_pandora_subject)
    conn = db.connect()
    try:
        existing = db.get_case(conn, case_id)
        if not existing:
            raise HTTPException(status_code=404, detail="case_not_found")
        action = "close" if body.status == "closed" else "write"
        decision = await authorize(action, case_resource(existing), subject)
        enforce(decision)
        try:
            case = db.update_case(conn, case_id, actor=subject["operator"], fields=body.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except KeyError:
            raise HTTPException(status_code=404, detail="case_not_found")
        db.set_audit_seq(conn, case_id, decision.get("seq"))
    finally:
        conn.close()
    case["auditDecision"] = {"seq": decision.get("seq"), "hash": decision.get("hash"), "reason": decision.get("reason")}
    return case


@app.post("/cases/{case_id}/evidence", status_code=201)
async def add_evidence(case_id: str, body: EvidenceCreate,
                       x_pandora_subject: str | None = Header(None)) -> dict[str, Any]:
    subject = subject_from(x_pandora_subject)
    conn = db.connect()
    try:
        existing = db.get_case(conn, case_id)
        if not existing:
            raise HTTPException(status_code=404, detail="case_not_found")
        decision = await authorize("write", case_resource(existing), subject)
        enforce(decision)
        try:
            evidence = db.add_evidence(conn, case_id, actor=subject["operator"], kind=body.kind,
                                       label=body.label, source_url=body.source_url, payload=body.payload)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except KeyError:
            raise HTTPException(status_code=404, detail="case_not_found")
    finally:
        conn.close()
    return {"mode": APP_NAME, "caseId": case_id, "evidence": evidence,
            "auditDecision": {"seq": decision.get("seq"), "reason": decision.get("reason")}}


@app.post("/cases/{case_id}/events", status_code=201)
async def add_event(case_id: str, body: EventCreate,
                    x_pandora_subject: str | None = Header(None)) -> dict[str, Any]:
    subject = subject_from(x_pandora_subject)
    conn = db.connect()
    try:
        existing = db.get_case(conn, case_id)
        if not existing:
            raise HTTPException(status_code=404, detail="case_not_found")
        decision = await authorize("write", case_resource(existing), subject)
        enforce(decision)
        event = db.add_event(conn, case_id, actor=subject["operator"], kind=body.kind, body=body.body)
    finally:
        conn.close()
    return {"mode": APP_NAME, "caseId": case_id, "event": event,
            "auditDecision": {"seq": decision.get("seq"), "reason": decision.get("reason")}}


@app.get("/cases/{case_id}/export")
async def export_case(case_id: str, format: str = Query("json", pattern="^(json|md)$"),
                      x_pandora_subject: str | None = Header(None)):
    subject = subject_from(x_pandora_subject)
    conn = db.connect()
    try:
        case = db.get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="case_not_found")
        decision = await authorize("export", case_resource(case), subject)
        enforce(decision)
        case["evidenceIntegrity"] = db.verify_evidence(conn, case_id)
    finally:
        conn.close()
    if format == "md":
        return PlainTextResponse(
            db.export_markdown(case),
            headers={"Content-Disposition": f'attachment; filename="{case_id}.md"'},
        )
    return {"mode": APP_NAME, "exportedAt": now(), "case": case,
            "auditDecision": {"seq": decision.get("seq"), "reason": decision.get("reason")},
            "custodySteps": len(case.get("custody") or [])}


async def fetch_json(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    r = await client.get(url, headers={"User-Agent": "Pandora-Cases-Service/1.0"})
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, dict) else {}


def draft_from_alerts(alerts: dict[str, Any], ontology: dict[str, Any],
                      degraded: list[str]) -> list[dict[str, Any]]:
    """Cluster real alerts into case drafts. Deterministic ids -> no duplicates on re-runs."""
    drafts: list[dict[str, Any]] = []
    alert_rows = [a for a in (alerts.get("alerts") or []) if isinstance(a, dict)]
    grouped: dict[str, list[dict[str, Any]]] = {}
    for a in alert_rows:
        grouped.setdefault(str(a.get("category") or "General"), []).append(a)
    for category, items in grouped.items():
        top = items[0]
        priority = ("critical" if any(i.get("level") == "critical" for i in items)
                    else "high" if any(i.get("level") == "high" for i in items) else "watch")
        drafts.append({
            "id": f"case-auto-{sid(category + str(top.get('id')))}",
            "title": f"{category} — {len(items)} signal(aux)",
            "summary": f"Dossier généré depuis {len(items)} signal(aux) réel(s) de catégorie {category}.",
            "priority": priority,
            "origin": "alerts",
            "degraded": degraded,
            "alerts": items[:8],
            "ontologyRefs": [n.get("id") for n in (ontology.get("nodes") or [])
                             if isinstance(n, dict) and category.lower() in str(n.get("label", "")).lower()][:10],
        })
    drafts.sort(key=lambda d: {"critical": 3, "high": 2, "watch": 1}[d["priority"]], reverse=True)
    return drafts[:20]


@app.post("/cases/generate")
async def generate(x_pandora_subject: str | None = Header(None)) -> dict[str, Any]:
    subject = subject_from(x_pandora_subject)
    enforce(await authorize("write", {"type": "case", "classification": "confidentiel",
                                      "compartments": ["investigation"], "owner": None}, subject))

    degraded: list[str] = []
    ontology: dict[str, Any] = {}
    alerts: dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=40) as client:
        try:
            ontology = await fetch_json(client, f"{ONTOLOGY_URL}/ontology")
        except Exception:
            degraded.append("ontology")
        try:
            alerts = await fetch_json(client, f"{ALERTS_URL}/alerts")
        except Exception:
            degraded.append("alerts")

    drafts = draft_from_alerts(alerts, ontology, degraded)

    created: list[dict[str, Any]] = []
    existing: list[str] = []
    conn = db.connect()
    try:
        for draft in drafts:
            if conn.execute("SELECT 1 FROM cases WHERE id = ?", (draft["id"],)).fetchone():
                existing.append(draft["id"])
                continue
            case = db.create_case(conn, title=draft["title"], summary=draft["summary"],
                                  priority=draft["priority"], origin="alerts", case_id=draft["id"],
                                  actor="pandora-cases:generate",
                                  compartments=["investigation"])
            db.set_audit_seq(conn, draft["id"], None)
            for alert in draft["alerts"]:
                url = alert.get("url") if isinstance(alert.get("url"), str) and str(alert.get("url")).startswith("http") else None
                db.add_evidence(conn, draft["id"], actor="pandora-cases:generate", kind="alert",
                                label=str(alert.get("title") or "signal")[:200], source_url=url,
                                payload={k: alert.get(k) for k in
                                         ("id", "title", "category", "level", "source", "timestamp", "location")})
            created.append(case)
    finally:
        conn.close()

    return {
        "mode": APP_NAME,
        "generatedAt": now(),
        "created": len(created),
        "alreadyKnown": len(existing),
        "degraded": degraded,
        "cases": created,
        "sources": {"alerts": alerts.get("total"), "ontologyNodes": (ontology.get("summary") or {}).get("nodes")},
    }


@app.get("/cases/{case_id}/verify")
async def verify_case(case_id: str) -> dict[str, Any]:
    conn = db.connect()
    try:
        if not db.get_case(conn, case_id):
            raise HTTPException(status_code=404, detail="case_not_found")
        result = db.verify_evidence(conn, case_id)
    finally:
        conn.close()
    return {"mode": APP_NAME, "caseId": case_id, **result}
