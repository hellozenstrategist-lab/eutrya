from __future__ import annotations

from collections import Counter
from typing import Iterable, List

from .models import LaneRecord


def build_digest(records: Iterable[LaneRecord], limit: int = 20) -> str:
    rows = list(records)
    if not rows:
        return "KAH_LEDGER_DIGEST: no lanes recorded yet."

    status_counts = Counter(r.status for r in rows)
    family_count = len({r.fingerprint for r in rows})
    lines: List[str] = [
        "KAH_LEDGER_DIGEST:",
        f"  lanes: {len(rows)}",
        f"  families: {family_count}",
        "  status_counts: " + ", ".join(f"{k}={v}" for k, v in sorted(status_counts.items())),
        "  recent_lanes:",
    ]
    for record in rows[-limit:]:
        lines.append(
            f"    - {record.lane_id} [{record.status}] fp={record.fingerprint} "
            f"sink={record.sink}; surface={record.surface}; root={record.root_cause}"
        )
    return "\n".join(lines)
