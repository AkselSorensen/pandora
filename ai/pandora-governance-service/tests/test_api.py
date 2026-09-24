"""End-to-end checks of the governance API against a throwaway database."""
import json
import os
import pathlib
import sqlite3
import sys
import tempfile

TMP = tempfile.mkdtemp(prefix="pandora-gov-")
os.environ["PANDORA_GOVERNANCE_DB"] = os.path.join(TMP, "governance.db")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from sources import resolve  # noqa: E402

client = TestClient(main.app)

SUBJ = {
    "operator": "a.sorensen",
    "role": "analyst",
    "clearance": "confidentiel",
    "compartments": ["nuclear", "investigation"],
    "attestation": "att-1",
}


def evaluate(subject, action, resource):
    r = client.post("/policy/evaluate", json={"subject": subject, "action": action, "resource": resource})
    assert r.status_code == 200, r.text
    return r.json()


def test_health_reports_db():
    d = client.get("/health").json()
    assert d["status"] == "ok" and d["db"].endswith("governance.db")


def test_labels_expose_the_route_table():
    d = client.get("/labels").json()
    assert d["enforcement"]["mode"] == "fail_closed"
    assert d["resources"]["total"] > 40
    assert d["resources"]["byClassification"]["secret"] >= 1


def test_resolve_order_and_conservative_default():
    assert resolve("/api/flights")["classification"] == "public"
    assert resolve("/api/cases/abc/evidence")["classification"] == "confidentiel"
    assert resolve("/api/cases/abc/evidence")["compartments"] == ["investigation"]
    assert resolve("/api/osint/whois")["classification"] == "diffusion_restreinte"
    assert resolve("/api/does-not-exist")["classification"] == "diffusion_restreinte"
    assert resolve("/api/does-not-exist")["matched"] is False


def test_secret_compartment_enforced():
    cleared = {**SUBJ, "clearance": "secret"}
    allow = evaluate(cleared, "read", {"type": "nuclear", "classification": "secret", "compartments": ["nuclear"]})
    assert allow["decision"] == "allow", allow
    denied = evaluate(cleared, "read", {"type": "nuclear", "classification": "secret", "compartments": ["cyber"]})
    assert denied["reason"] == "compartment_missing", denied
    too_low = evaluate(SUBJ, "read", {"type": "nuclear", "classification": "secret", "compartments": ["nuclear"]})
    assert too_low["reason"] == "clearance_insufficient", too_low


def test_chain_verifies_and_is_tamper_evident():
    evaluate(SUBJ, "read", {"type": "feed", "classification": "public"})
    before = client.get("/audit/verify").json()
    assert before["valid"] is True and before["entries"] >= 3, before

    conn = sqlite3.connect(os.environ["PANDORA_GOVERNANCE_DB"])
    row = conn.execute("SELECT seq, decision FROM audit WHERE decision='deny' ORDER BY seq LIMIT 1").fetchone()
    assert row, "expected at least one deny entry"
    conn.execute("UPDATE audit SET decision='allow' WHERE seq=?", (row[0],))
    conn.commit()
    conn.close()

    broken = client.get("/audit/verify").json()
    assert broken["valid"] is False and broken["brokenAtSeq"] == row[0], broken

    conn = sqlite3.connect(os.environ["PANDORA_GOVERNANCE_DB"])
    conn.execute("UPDATE audit SET decision='deny' WHERE seq=?", (row[0],))
    conn.commit()
    conn.close()
    assert client.get("/audit/verify").json()["valid"] is True


def test_audit_tail_and_posture():
    tail = client.get("/audit", params={"limit": 5}).json()
    assert tail["count"] == len(tail["entries"]) >= 3
    assert json.loads(tail["entries"][0]["obligations"]) == [] or isinstance(tail["entries"][0]["obligations"], str)
    posture = client.get("/posture").json()
    assert posture["total"] >= 4 and posture["denied"] >= 1
    assert "clearance_insufficient" in posture["deniedByReason"] or "compartment_missing" in posture["deniedByReason"]


def test_operator_roundtrip_and_validation():
    put = client.put("/operators/a.sorensen", json={
        "role": "lead", "clearance": "secret", "compartments": ["nuclear", "investigation"], "no_export": False,
    })
    assert put.status_code == 200 and put.json()["role"] == "lead"
    got = client.get("/operators/a.sorensen").json()
    assert got["clearance"] == "secret" and "nuclear" in got["compartments"]
    assert client.get("/operators/ghost").status_code == 404
    bad = client.put("/operators/bad", json={"role": "root", "clearance": "secret"})
    assert bad.status_code == 422
