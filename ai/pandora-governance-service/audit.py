"""Tamper-evident audit journal.

Each entry stores sha256(prev_hash + canonical_json(entry)). Modification or deletion
of a row breaks the chain from that point on — verify() reports the first broken seq.
"""
import hashlib
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any

DB_PATH = os.getenv("PANDORA_GOVERNANCE_DB", "/data/governance.db")
GENESIS = "0" * 64
_LOCK = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS audit (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  role        TEXT NOT NULL,
  clearance   TEXT NOT NULL,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  classification TEXT NOT NULL,
  decision    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  obligations TEXT NOT NULL DEFAULT '[]',
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit(actor);
CREATE TABLE IF NOT EXISTS operators (
  operator     TEXT PRIMARY KEY,
  role         TEXT NOT NULL,
  clearance    TEXT NOT NULL,
  compartments TEXT NOT NULL DEFAULT '[]',
  no_export    INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL
);
"""

ENTRY_FIELDS = ("at", "actor", "role", "clearance", "action", "resource",
                "classification", "decision", "reason", "obligations")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    parent = os.path.dirname(DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


def _digest(prev_hash: str, entry: dict[str, Any]) -> str:
    """Digest over the 10 journalised fields only (never over prev_hash/hash themselves)."""
    payload = {k: entry[k] for k in ENTRY_FIELDS}
    canonical = json.dumps({k: payload[k] for k in sorted(payload)}, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(f"{prev_hash}|{canonical}".encode()).hexdigest()


def append(conn: sqlite3.Connection, subject: dict[str, Any], action: str,
           resource: dict[str, Any], decision: dict[str, Any]) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "at": now(),
        "actor": str(subject.get("operator") or "unknown"),
        "role": str(subject.get("role") or "unknown"),
        "clearance": str(subject.get("clearance") or "unknown"),
        "action": action,
        "resource": str(resource.get("id") or resource.get("type") or "unknown"),
        "classification": str(resource.get("classification") or "unknown"),
        "decision": decision["decision"],
        "reason": decision["reason"],
        "obligations": json.dumps(decision.get("obligations") or [], ensure_ascii=False),
    }
    with _LOCK:
        row = conn.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        prev_hash = row["hash"] if row else GENESIS
        entry["prev_hash"] = prev_hash
        entry["hash"] = _digest(prev_hash, entry)
        cur = conn.execute(
            """INSERT INTO audit (at,actor,role,clearance,action,resource,classification,
                                  decision,reason,obligations,prev_hash,hash)
               VALUES (:at,:actor,:role,:clearance,:action,:resource,:classification,
                       :decision,:reason,:obligations,:prev_hash,:hash)""",
            entry,
        )
        conn.commit()
        entry["seq"] = cur.lastrowid
    return entry


def tail(conn: sqlite3.Connection, limit: int = 100, actor: str | None = None,
         decision: str | None = None, classification: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM audit"
    clauses: list[str] = []
    params: list[Any] = []
    if actor:
        clauses.append("actor = ?")
        params.append(actor)
    if decision:
        clauses.append("decision = ?")
        params.append(decision)
    if classification:
        clauses.append("classification = ?")
        params.append(classification)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY seq DESC LIMIT ?"
    params.append(max(1, min(limit, 1000)))
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def verify(conn: sqlite3.Connection) -> dict[str, Any]:
    prev = GENESIS
    count = 0
    for row in conn.execute("SELECT * FROM audit ORDER BY seq ASC").fetchall():
        entry = {k: row[k] for k in ENTRY_FIELDS}
        if row["prev_hash"] != prev or _digest(prev, entry) != row["hash"]:
            return {"valid": False, "entries": count, "brokenAtSeq": row["seq"], "checkedAt": now()}
        prev = row["hash"]
        count += 1
    return {"valid": True, "entries": count, "brokenAtSeq": None, "checkedAt": now()}


def stats(conn: sqlite3.Connection) -> dict[str, Any]:
    total = conn.execute("SELECT COUNT(*) c FROM audit").fetchone()["c"]
    denied = conn.execute("SELECT COUNT(*) c FROM audit WHERE decision='deny'").fetchone()["c"]
    by_class = {r["classification"]: r["c"] for r in conn.execute(
        "SELECT classification, COUNT(*) c FROM audit GROUP BY classification").fetchall()}
    by_actor = {r["actor"]: r["c"] for r in conn.execute(
        "SELECT actor, COUNT(*) c FROM audit GROUP BY actor ORDER BY c DESC LIMIT 20").fetchall()}
    by_reason = {r["reason"]: r["c"] for r in conn.execute(
        "SELECT reason, COUNT(*) c FROM audit WHERE decision='deny' GROUP BY reason ORDER BY c DESC LIMIT 20").fetchall()}
    first = conn.execute("SELECT at FROM audit ORDER BY seq ASC LIMIT 1").fetchone()
    last = conn.execute("SELECT at,seq FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
    return {
        "total": total,
        "denied": denied,
        "allowed": total - denied,
        "byClassification": by_class,
        "byActor": by_actor,
        "deniedByReason": by_reason,
        "firstEntryAt": first["at"] if first else None,
        "lastEntry": {"at": last["at"], "seq": last["seq"]} if last else None,
    }


def put_operator(conn: sqlite3.Connection, operator: str, role: str, clearance: str,
                 compartments: list[str], no_export: bool) -> dict[str, Any]:
    conn.execute(
        """INSERT INTO operators (operator, role, clearance, compartments, no_export, updated_at)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(operator) DO UPDATE SET
             role=excluded.role, clearance=excluded.clearance,
             compartments=excluded.compartments, no_export=excluded.no_export,
             updated_at=excluded.updated_at""",
        (operator, role, clearance, json.dumps(compartments, ensure_ascii=False), int(bool(no_export)), now()),
    )
    conn.commit()
    return get_operator(conn, operator) or {}


def get_operator(conn: sqlite3.Connection, operator: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM operators WHERE operator = ?", (operator,)).fetchone()
    if not row:
        return None
    return {
        "operator": row["operator"],
        "role": row["role"],
        "clearance": row["clearance"],
        "compartments": json.loads(row["compartments"] or "[]"),
        "no_export": bool(row["no_export"]),
        "updatedAt": row["updated_at"],
    }


def list_operators(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [get_operator(conn, r["operator"]) or {} for r in
            conn.execute("SELECT operator FROM operators ORDER BY operator").fetchall()]
