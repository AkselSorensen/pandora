"""SQLite persistence for analyst cases.

A case is a durable, auditable object: a status, an owner, a hypothesis, a set of evidence
items whose payload is hashed (so a third party can re-verify it) and an append-only event
log that forms the chain of custody.

Evidence payloads hold PUBLIC source references only (url, feed id, entity id) — never
personal data.
"""
import hashlib
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

DB_PATH = os.getenv("PANDORA_CASES_DB", "/data/cases.db")
_LOCK = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS cases (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  hypothesis    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open',
  priority      TEXT NOT NULL DEFAULT 'watch',
  classification TEXT NOT NULL DEFAULT 'confidentiel',
  compartments  TEXT NOT NULL DEFAULT '["investigation"]',
  owner         TEXT,
  origin        TEXT NOT NULL DEFAULT 'manual',
  audit_seq     INTEGER,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  closed_at     TEXT
);
CREATE TABLE IF NOT EXISTS evidence (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  label        TEXT NOT NULL,
  source_url   TEXT,
  payload      TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  collected_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  at      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  kind    TEXT NOT NULL,
  body    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status, priority);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_events_case ON case_events(case_id, at);
"""

STATUSES = ("open", "active", "watch", "closed")
PRIORITIES = ("critical", "high", "watch")
EVIDENCE_KINDS = ("source_ref", "entity", "alert", "note")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    parent = os.path.dirname(DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def hash_payload(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _case_row(row: sqlite3.Row, evidence_count: int | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "summary": row["summary"],
        "hypothesis": row["hypothesis"],
        "status": row["status"],
        "priority": row["priority"],
        "classification": row["classification"],
        "compartments": json.loads(row["compartments"] or "[]"),
        "owner": row["owner"],
        "origin": row["origin"],
        "auditSeq": row["audit_seq"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "closedAt": row["closed_at"],
        **({"evidenceCount": evidence_count} if evidence_count is not None else {}),
    }


def create_case(conn: sqlite3.Connection, *, title: str, summary: str = "", hypothesis: str = "",
                priority: str = "watch", status: str = "open", owner: str | None = None,
                classification: str = "confidentiel", compartments: list[str] | None = None,
                origin: str = "manual", case_id: str | None = None, actor: str = "unknown") -> dict[str, Any]:
    if priority not in PRIORITIES:
        raise ValueError("invalid_priority")
    if status not in STATUSES:
        raise ValueError("invalid_status")
    cid = case_id or new_id("case")
    ts = now()
    with _LOCK:
        conn.execute(
            """INSERT INTO cases (id,title,summary,hypothesis,status,priority,classification,
                                  compartments,owner,origin,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (cid, title, summary, hypothesis, status, priority, classification,
             json.dumps(compartments or ["investigation"]), owner, origin, ts, ts),
        )
        conn.execute(
            "INSERT INTO case_events (case_id,at,actor,kind,body) VALUES (?,?,?,?,?)",
            (cid, ts, actor, "created", json.dumps({"origin": origin, "priority": priority, "title": title},
                                                   ensure_ascii=False, sort_keys=True)),
        )
        conn.commit()
    return get_case(conn, cid) or {}


def list_cases(conn: sqlite3.Connection, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    sql = """SELECT c.*, (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id) AS ev
             FROM cases c"""
    params: list[Any] = []
    if status:
        sql += " WHERE c.status = ?"
        params.append(status)
    sql += """ ORDER BY CASE c.priority WHEN 'critical' THEN 3 WHEN 'high' THEN 2 ELSE 1 END DESC,
                        c.updated_at DESC LIMIT ?"""
    params.append(max(1, min(limit, 200)))
    return [_case_row(r, r["ev"]) for r in conn.execute(sql, params).fetchall()]


def get_case(conn: sqlite3.Connection, case_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    if not row:
        return None
    evidence = [dict(r) for r in conn.execute(
        "SELECT * FROM evidence WHERE case_id = ? ORDER BY collected_at ASC", (case_id,)).fetchall()]
    events = [dict(r) for r in conn.execute(
        "SELECT * FROM case_events WHERE case_id = ? ORDER BY id ASC", (case_id,)).fetchall()]
    case = _case_row(row, len(evidence))
    case["evidence"] = evidence
    case["events"] = events
    case["custody"] = chain_of_custody(case, evidence, events)
    return case


def update_case(conn: sqlite3.Connection, case_id: str, *, actor: str, fields: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    if not row:
        raise KeyError(case_id)
    allowed = {"title", "summary", "hypothesis", "status", "priority", "owner"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return get_case(conn, case_id) or {}
    if "status" in updates and updates["status"] not in STATUSES:
        raise ValueError("invalid_status")
    if "priority" in updates and updates["priority"] not in PRIORITIES:
        raise ValueError("invalid_priority")
    ts = now()
    updates["updated_at"] = ts
    if updates.get("status") == "closed":
        updates["closed_at"] = ts
    sets = ", ".join(f"{k} = ?" for k in updates)
    with _LOCK:
        conn.execute(f"UPDATE cases SET {sets} WHERE id = ?", (*updates.values(), case_id))
        conn.execute(
            "INSERT INTO case_events (case_id,at,actor,kind,body) VALUES (?,?,?,?,?)",
            (case_id, ts, actor, "status" if "status" in updates else "update",
             json.dumps({k: v for k, v in updates.items() if k != "updated_at"}, ensure_ascii=False, sort_keys=True)),
        )
        conn.commit()
    return get_case(conn, case_id) or {}


def set_audit_seq(conn: sqlite3.Connection, case_id: str, seq: int | None) -> None:
    if seq is None:
        return
    conn.execute("UPDATE cases SET audit_seq = ? WHERE id = ?", (seq, case_id))
    conn.commit()


def add_evidence(conn: sqlite3.Connection, case_id: str, *, actor: str, kind: str, label: str,
                 source_url: str | None, payload: Any) -> dict[str, Any]:
    if kind not in EVIDENCE_KINDS:
        raise ValueError("invalid_kind")
    if not conn.execute("SELECT 1 FROM cases WHERE id = ?", (case_id,)).fetchone():
        raise KeyError(case_id)
    payload_json = json.dumps(payload if payload is not None else {}, ensure_ascii=False, sort_keys=True)
    eid = new_id("ev")
    ts = now()
    with _LOCK:
        conn.execute(
            """INSERT INTO evidence (id,case_id,kind,label,source_url,payload,payload_hash,
                                     collected_at,collected_by)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (eid, case_id, kind, label, source_url, payload_json, hash_payload(payload if payload is not None else {}),
             ts, actor),
        )
        conn.execute("UPDATE cases SET updated_at = ? WHERE id = ?", (ts, case_id))
        conn.execute(
            "INSERT INTO case_events (case_id,at,actor,kind,body) VALUES (?,?,?,?,?)",
            (case_id, ts, actor, "evidence",
             json.dumps({"evidenceId": eid, "kind": kind, "label": label, "sourceUrl": source_url},
                        ensure_ascii=False, sort_keys=True)),
        )
        conn.commit()
    return dict(conn.execute("SELECT * FROM evidence WHERE id = ?", (eid,)).fetchone())


def add_event(conn: sqlite3.Connection, case_id: str, *, actor: str, kind: str, body: Any) -> dict[str, Any]:
    if not conn.execute("SELECT 1 FROM cases WHERE id = ?", (case_id,)).fetchone():
        raise KeyError(case_id)
    ts = now()
    body_json = json.dumps(body, ensure_ascii=False, sort_keys=True) if not isinstance(body, str) else body
    with _LOCK:
        cur = conn.execute(
            "INSERT INTO case_events (case_id,at,actor,kind,body) VALUES (?,?,?,?,?)",
            (case_id, ts, actor, kind, body_json),
        )
        conn.execute("UPDATE cases SET updated_at = ? WHERE id = ?", (ts, case_id))
        conn.commit()
    return {"id": cur.lastrowid, "caseId": case_id, "at": ts, "actor": actor, "kind": kind, "body": body_json}


def chain_of_custody(case: dict[str, Any], evidence: list[dict[str, Any]],
                     events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every state change and every collection step, in chronological order."""
    steps: list[dict[str, Any]] = []
    for e in events:
        steps.append({"at": e["at"], "actor": e["actor"], "step": e["kind"],
                      "detail": e["body"], "ref": f"event:{e['id']}"})
    for ev in evidence:
        steps.append({"at": ev["collected_at"], "actor": ev["collected_by"], "step": "collected",
                      "detail": ev["label"], "ref": ev["id"], "hash": ev["payload_hash"]})
    steps.sort(key=lambda s: s["at"])
    return steps


def verify_evidence(conn: sqlite3.Connection, case_id: str) -> dict[str, Any]:
    rows = conn.execute("SELECT id, payload, payload_hash FROM evidence WHERE case_id = ?", (case_id,)).fetchall()
    checked, broken = 0, []
    for r in rows:
        checked += 1
        if hash_payload(json.loads(r["payload"])) != r["payload_hash"]:
            broken.append(r["id"])
    return {"checked": checked, "valid": not broken, "brokenEvidence": broken, "checkedAt": now()}


def stats(conn: sqlite3.Connection) -> dict[str, Any]:
    total = conn.execute("SELECT COUNT(*) c FROM cases").fetchone()["c"]
    by_status = {r["status"]: r["c"] for r in conn.execute(
        "SELECT status, COUNT(*) c FROM cases GROUP BY status").fetchall()}
    by_priority = {r["priority"]: r["c"] for r in conn.execute(
        "SELECT priority, COUNT(*) c FROM cases GROUP BY priority").fetchall()}
    evidence = conn.execute("SELECT COUNT(*) c FROM evidence").fetchone()["c"]
    events = conn.execute("SELECT COUNT(*) c FROM case_events").fetchone()["c"]
    return {"cases": total, "evidence": evidence, "events": events,
            "byStatus": by_status, "byPriority": by_priority}


def export_markdown(case: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# {case['title']}")
    lines.append("")
    lines.append(f"- **ID** : `{case['id']}`")
    lines.append(f"- **Statut** : {case['status']}")
    lines.append(f"- **Priorité** : {case['priority']}")
    lines.append(f"- **Classification** : {case['classification']}")
    lines.append(f"- **Compartiments** : {', '.join(case['compartments']) or '—'}")
    lines.append(f"- **Propriétaire** : {case['owner'] or '—'}")
    lines.append(f"- **Origine** : {case['origin']}")
    lines.append(f"- **Créé** : {case['createdAt']}")
    lines.append(f"- **Mis à jour** : {case['updatedAt']}")
    if case.get("auditSeq"):
        lines.append(f"- **Décision d'audit** : seq {case['auditSeq']}")
    lines.append("")
    lines.append("## Résumé")
    lines.append("")
    lines.append(case["summary"] or "—")
    lines.append("")
    lines.append("## Hypothèse de travail")
    lines.append("")
    lines.append(case["hypothesis"] or "—")
    lines.append("")
    lines.append(f"## Preuves ({len(case['evidence'])})")
    lines.append("")
    lines.append("| # | Type | Libellé | Source | SHA-256 | Collecté par |")
    lines.append("|---|---|---|---|---|---|")
    for i, ev in enumerate(case["evidence"], 1):
        lines.append(f"| {i} | {ev['kind']} | {ev['label']} | {ev['source_url'] or '—'} | "
                     f"`{ev['payload_hash'][:16]}…` | {ev['collected_by']} |")
    lines.append("")
    lines.append("## Chaîne de traçabilité")
    lines.append("")
    for step in case["custody"]:
        lines.append(f"- **{step['at']}** — {step['actor']} — `{step['step']}` — {step['detail']}"
                     + (f" — hash `{step['hash'][:16]}…`" if step.get("hash") else ""))
    lines.append("")
    return "\n".join(lines)
