from pathlib import Path

import pytest

from kah_ledger.digest import build_digest
from kah_ledger.ledger import LaneLedger, UnsafeLedgerPath
from kah_ledger.models import LaneRecord, family_fingerprint


def test_append_and_read_roundtrip(tmp_path: Path):
    ledger = LaneLedger(tmp_path)
    record = LaneRecord(
        agent="scout",
        surface="State Variable Reads",
        invariant="Invalidated writes must not authorize value movement",
        sink="Direct loss of funds",
        root_cause="Missing freshness check",
        hypothesis="A downstream component may trust stale state.",
    )

    ledger.append(record)
    rows = ledger.read_all()

    assert len(rows) == 1
    assert rows[0].lane_id == record.lane_id
    assert rows[0].fingerprint == record.fingerprint


def test_duplicate_family_ignores_prose(tmp_path: Path):
    ledger = LaneLedger(tmp_path)
    original = LaneRecord(
        agent="scout-a",
        surface="definition validation",
        invariant="acceptance-time validation and execution-time validation must agree",
        sink="transaction processing halt",
        root_cause="validation mismatch",
        hypothesis="First phrasing of the idea.",
    )
    ledger.append(original)

    matches = ledger.find_family(
        surface="Definition validation!!",
        invariant="Acceptance time validation and execution time validation must agree.",
        sink="transaction-processing halt",
        root_cause="validation mismatch",
    )

    assert [m.lane_id for m in matches] == [original.lane_id]


def test_digest_is_agent_readable(tmp_path: Path):
    ledger = LaneLedger(tmp_path)
    ledger.append(LaneRecord(
        agent="triage",
        surface="authorization checks",
        invariant="callers must not bypass role checks",
        sink="privileged state mutation",
        root_cause="missing caller check",
        hypothesis="A role check may be absent.",
        status="dead",
    ))

    digest = build_digest(ledger.read_all())

    assert "KAH_LEDGER_DIGEST" in digest
    assert "status_counts: dead=1" in digest
    assert "privileged state mutation" in digest


def test_refuses_filesystem_root():
    with pytest.raises(UnsafeLedgerPath):
        LaneLedger("/")
