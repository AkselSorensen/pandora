import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from policy import evaluate  # noqa: E402

SUBJ = {
    "operator": "a.sorensen",
    "role": "analyst",
    "clearance": "confidentiel",
    "compartments": ["nuclear"],
    "attestation": "att-1",
}


def test_allow_nominal():
    r = evaluate(SUBJ, "read", {"type": "case", "classification": "confidentiel"})
    assert r["decision"] == "allow", r


def test_deny_without_attestation():
    s = {**SUBJ, "attestation": None}
    r = evaluate(s, "read", {"type": "case", "classification": "public"})
    assert r["reason"] == "missing_attestation", r


def test_deny_clearance_insufficient():
    s = {**SUBJ, "clearance": "public"}
    r = evaluate(s, "read", {"type": "case", "classification": "confidentiel"})
    assert r["reason"] == "clearance_insufficient", r


def test_deny_unclassified_resource():
    r = evaluate(SUBJ, "read", {"type": "case"})
    assert r["reason"] == "unclassified_resource", r


def test_deny_unknown_action_and_role():
    assert evaluate(SUBJ, "nuke", {"type": "case", "classification": "public"})["reason"] == "unknown_action"
    s = {**SUBJ, "role": "root"}
    assert evaluate(s, "read", {"type": "case", "classification": "public"})["reason"] == "unknown_role"


def test_deny_secret_without_compartment():
    s = {**SUBJ, "clearance": "secret"}
    r = evaluate(s, "read", {"type": "case", "classification": "secret"})
    assert r["reason"] == "secret_without_compartment", r


def test_deny_compartment_missing():
    s = {**SUBJ, "clearance": "secret", "compartments": ["investigation"]}
    r = evaluate(s, "read", {"type": "case", "classification": "secret", "compartments": ["nuclear"]})
    assert r["reason"] == "compartment_missing", r


def test_deny_no_write_on_secret():
    s = {**SUBJ, "clearance": "secret"}
    r = evaluate(s, "write", {"type": "case", "classification": "secret", "compartments": ["nuclear"]})
    assert r["reason"] == "no_write_on_secret", r


def test_auditor_read_only():
    s = {**SUBJ, "role": "auditor"}
    r = evaluate(s, "write", {"type": "case", "classification": "public"})
    assert r["reason"] == "auditor_read_only", r


def test_close_requires_lead():
    r = evaluate(SUBJ, "close", {"type": "case", "classification": "public"})
    assert r["reason"] == "role_insufficient", r


def test_export_obligation_on_nuclear_compartment():
    r = evaluate(SUBJ, "export", {"type": "case", "classification": "confidentiel", "compartments": ["nuclear"]})
    assert r["decision"] == "allow" and "log_to_nuclear_register" in r["obligations"], r


def test_no_export_attribute_denies():
    s = {**SUBJ, "no_export": True}
    r = evaluate(s, "export", {"type": "case", "classification": "confidentiel"})
    assert r["reason"] == "export_forbidden_by_attribute", r


def test_retention_obligation():
    r = evaluate(SUBJ, "read", {"type": "case", "classification": "public", "retention_days": 90})
    assert "retention_90d" in r["obligations"], r
