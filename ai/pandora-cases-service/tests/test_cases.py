"""Integration checks for the cases service.

Requires the governance service on 127.0.0.1:7715 (that is the point: writes are refused
without a journal).
"""
import json
import os
import pathlib
import sys
import tempfile

TMP = tempfile.mkdtemp(prefix="pandora-cases-")
os.environ["PANDORA_CASES_DB"] = os.path.join(TMP, "cases.db")
os.environ["PANDORA_GOVERNANCE_URL"] = "http://127.0.0.1:7715"
# Ontology/alerts are not running during this test -> generate must degrade honestly.
os.environ["PANDORA_ONTOLOGY_URL"] = "http://127.0.0.1:9"
os.environ["PANDORA_ALERTS_URL"] = "http://127.0.0.1:9"

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)

ANALYST = {"operator": "a.sorensen", "role": "analyst", "clearance": "confidentiel",
           "compartments": ["investigation"], "attestation": "att-1"}
LEAD = {**ANALYST, "role": "lead"}
LOW = {**ANALYST, "clearance": "public"}
HEAD = lambda s: {"X-Pandora-Subject": json.dumps(s)}  # noqa: E731

STATE: dict[str, str] = {}


def test_health_reports_db_and_counts():
    d = client.get("/health").json()
    assert d["status"] == "ok" and d["db"].endswith("cases.db")
    assert d["governance_url"] == "http://127.0.0.1:7715"


def test_create_requires_clearance():
    r = client.post("/cases", json={"title": "Refus attendu"}, headers=HEAD(LOW))
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["reason"] == "clearance_insufficient"


def test_create_case_with_analyst():
    r = client.post("/cases", json={"title": "Veille Baltique", "summary": "Escalade documentée",
                                    "hypothesis": "Corrélation incidents + AIS", "priority": "high"},
                    headers=HEAD(ANALYST))
    assert r.status_code == 201, r.text
    case = r.json()
    STATE["id"] = case["id"]
    assert case["classification"] == "confidentiel" and case["compartments"] == ["investigation"]
    assert case["status"] == "open" and case["origin"] == "manual"
    events = client.get(f"/cases/{case['id']}").json()["events"]
    assert [e["kind"] for e in events] == ["created"]


def test_evidence_is_hashed_and_verifiable():
    cid = STATE["id"]
    r = client.post(f"/cases/{cid}/evidence", headers=HEAD(ANALYST), json={
        "kind": "entity", "label": "Vol identifié ADS-B",
        "source_url": "https://example.org/adsb/abc",
        "payload": {"entity_id": "aircraft-abc", "type": "aircraft", "risk": 62},
    })
    assert r.status_code == 201, r.text
    digest = r.json()["evidence"]["payload_hash"]
    assert len(digest) == 64
    verify = client.get(f"/cases/{cid}/verify").json()
    assert verify["valid"] is True and verify["checked"] == 1
    full = client.get(f"/cases/{cid}").json()
    assert full["evidenceIntegrity"]["valid"] is True
    assert any(s["step"] == "collected" for s in full["custody"])


def test_close_requires_lead_role():
    cid = STATE["id"]
    denied = client.patch(f"/cases/{cid}", json={"status": "closed"}, headers=HEAD(ANALYST))
    assert denied.status_code == 403 and denied.json()["detail"]["reason"] == "role_insufficient"
    ok = client.patch(f"/cases/{cid}", json={"status": "closed"}, headers=HEAD(LEAD))
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["status"] == "closed" and body["closedAt"]
    assert body["auditDecision"]["seq"] and body["auditDecision"]["reason"] == "policy_allow"


def test_export_markdown_contains_custody_and_hashes():
    cid = STATE["id"]
    r = client.get(f"/cases/{cid}/export", params={"format": "md"}, headers=HEAD(LEAD))
    assert r.status_code == 200, r.text
    body = r.text
    assert "# Veille Baltique" in body
    assert "Chaîne de traçabilité" in body
    assert "SHA-256" in body
    assert "attachment" in r.headers["content-disposition"]


def test_invalid_payloads_are_rejected():
    cid = STATE["id"]
    assert client.post("/cases", json={"title": "x", "priority": "urgent"},
                       headers=HEAD(ANALYST)).status_code == 422
    assert client.post(f"/cases/{cid}/evidence", headers=HEAD(ANALYST),
                       json={"kind": "guess", "label": "nope"}).status_code == 422
    assert client.get("/cases/case-unknown").status_code == 404


def test_generate_degrades_honestly_when_sources_are_down():
    r = client.post("/cases/generate", headers=HEAD(ANALYST))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 0
    assert set(body["degraded"]) == {"ontology", "alerts"}


def test_writes_are_refused_without_governance():
    real = main.GOVERNANCE_URL
    main.GOVERNANCE_URL = "http://127.0.0.1:9"
    try:
        r = client.post("/cases", json={"title": "Sans journal"}, headers=HEAD(ANALYST))
        assert r.status_code == 503, r.text
        assert r.json()["detail"]["error"] == "governance_unavailable"
    finally:
        main.GOVERNANCE_URL = real


def test_list_orders_by_priority():
    body = client.get("/cases").json()
    assert body["total"] >= 1
    assert body["stats"]["cases"] >= 1 and body["cases"][0]["evidenceCount"] >= 1
