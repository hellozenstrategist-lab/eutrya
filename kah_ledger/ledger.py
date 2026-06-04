from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Iterable, List

from .models import LaneRecord, family_fingerprint


class UnsafeLedgerPath(ValueError):
    pass


class LaneLedger:
    """Append-only JSONL lane ledger.

    The write path favors auditability over cleverness: append one JSON object,
    flush, fsync, and rebuild indexes from the file when needed.
    """

    def __init__(self, root: str | Path) -> None:
        self.root = self._safe_root(Path(root))
        self.ledger_dir = self.root / "ledgers"
        self.path = self.ledger_dir / "lanes.jsonl"

    @staticmethod
    def _safe_root(root: Path) -> Path:
        root = root.expanduser().resolve()
        if root == Path("/"):
            raise UnsafeLedgerPath("refusing to use filesystem root as KAH root")
        if any(part in {".git", ".."} for part in root.parts):
            raise UnsafeLedgerPath("unsafe root path")
        return root

    def init(self) -> None:
        self.ledger_dir.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    def append(self, record: LaneRecord) -> None:
        self.init()
        encoded = json.dumps(record.to_dict(), sort_keys=True, separators=(",", ":")) + "\n"
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(encoded)
            fh.flush()
            os.fsync(fh.fileno())

    def read_all(self) -> List[LaneRecord]:
        if not self.path.exists():
            return []
        records: List[LaneRecord] = []
        with self.path.open("r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(LaneRecord.from_dict(json.loads(line)))
                except Exception as exc:  # pragma: no cover - defensive error text
                    raise ValueError(f"bad ledger row {self.path}:{line_no}: {exc}") from exc
        return records

    def index_by_fingerprint(self) -> Dict[str, List[LaneRecord]]:
        index: Dict[str, List[LaneRecord]] = {}
        for record in self.read_all():
            index.setdefault(record.fingerprint, []).append(record)
        return index

    def find_family(self, surface: str, invariant: str, sink: str, root_cause: str) -> List[LaneRecord]:
        fp = family_fingerprint(surface, invariant, sink, root_cause)
        return self.index_by_fingerprint().get(fp, [])

    def latest_by_family(self) -> Dict[str, LaneRecord]:
        latest: Dict[str, LaneRecord] = {}
        for record in self.read_all():
            latest[record.fingerprint] = record
        return latest
