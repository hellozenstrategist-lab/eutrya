from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
import re
from typing import Any, Dict
from uuid import uuid4

_ALLOWED_STATUS = {"candidate", "admitted", "parked", "dead", "proved", "submitted"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_text(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def family_fingerprint(surface: str, invariant: str, sink: str, root_cause: str) -> str:
    """Return a stable short hash for duplicate-family lookup.

    The fingerprint intentionally ignores prose-heavy fields such as the full
    hypothesis. Two agents can describe the same idea differently but should
    still collide if they point at the same surface, invariant, impact sink,
    and root-cause shape.
    """
    parts = [surface, invariant, sink, root_cause]
    normalized = "|".join(normalize_text(p) for p in parts)
    return sha256(normalized.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class LaneRecord:
    agent: str
    surface: str
    invariant: str
    sink: str
    root_cause: str
    hypothesis: str
    status: str = "candidate"
    lane_id: str = field(default_factory=lambda: f"lane_{uuid4().hex[:10]}")
    created_at: str = field(default_factory=utc_now)
    notes: str = ""

    def __post_init__(self) -> None:
        if self.status not in _ALLOWED_STATUS:
            raise ValueError(f"unsupported status {self.status!r}; expected one of {sorted(_ALLOWED_STATUS)}")
        for name in ("agent", "surface", "invariant", "sink", "root_cause", "hypothesis"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} is required")

    @property
    def fingerprint(self) -> str:
        return family_fingerprint(self.surface, self.invariant, self.sink, self.root_cause)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "lane_id": self.lane_id,
            "created_at": self.created_at,
            "agent": self.agent,
            "surface": self.surface,
            "invariant": self.invariant,
            "sink": self.sink,
            "root_cause": self.root_cause,
            "hypothesis": self.hypothesis,
            "status": self.status,
            "fingerprint": self.fingerprint,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, raw: Dict[str, Any]) -> "LaneRecord":
        return cls(
            lane_id=raw["lane_id"],
            created_at=raw["created_at"],
            agent=raw["agent"],
            surface=raw["surface"],
            invariant=raw["invariant"],
            sink=raw["sink"],
            root_cause=raw["root_cause"],
            hypothesis=raw["hypothesis"],
            status=raw.get("status", "candidate"),
            notes=raw.get("notes", ""),
        )
