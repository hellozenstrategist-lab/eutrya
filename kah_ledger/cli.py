from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .digest import build_digest
from .ledger import LaneLedger
from .models import LaneRecord


def _add_common_root(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root", default=".kah", help="KAH ledger root directory")


def cmd_init(args: argparse.Namespace) -> int:
    ledger = LaneLedger(args.root)
    ledger.init()
    print(json.dumps({"ok": True, "ledger": str(ledger.path)}, indent=2))
    return 0


def cmd_add_lane(args: argparse.Namespace) -> int:
    ledger = LaneLedger(args.root)
    record = LaneRecord(
        agent=args.agent,
        surface=args.surface,
        invariant=args.invariant,
        sink=args.sink,
        root_cause=args.root_cause,
        hypothesis=args.hypothesis,
        status=args.status,
        notes=args.notes or "",
    )
    family = ledger.find_family(record.surface, record.invariant, record.sink, record.root_cause)
    ledger.append(record)
    print(json.dumps({
        "ok": True,
        "lane_id": record.lane_id,
        "fingerprint": record.fingerprint,
        "prior_family_matches": [r.lane_id for r in family],
    }, indent=2))
    return 0


def cmd_check_duplicate(args: argparse.Namespace) -> int:
    ledger = LaneLedger(args.root)
    matches = ledger.find_family(args.surface, args.invariant, args.sink, args.root_cause)
    print(json.dumps({
        "duplicate_family_found": bool(matches),
        "matches": [r.to_dict() for r in matches],
    }, indent=2))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    ledger = LaneLedger(args.root)
    print(json.dumps([r.to_dict() for r in ledger.read_all()], indent=2))
    return 0


def cmd_digest(args: argparse.Namespace) -> int:
    ledger = LaneLedger(args.root)
    print(build_digest(ledger.read_all(), limit=args.limit))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="kah-ledger")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="create the ledger directory")
    _add_common_root(p)
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("add-lane", help="append a lane record")
    _add_common_root(p)
    p.add_argument("--agent", required=True)
    p.add_argument("--surface", required=True)
    p.add_argument("--invariant", required=True)
    p.add_argument("--sink", required=True)
    p.add_argument("--root-cause", required=True)
    p.add_argument("--hypothesis", required=True)
    p.add_argument("--status", default="candidate", choices=["candidate", "admitted", "parked", "dead", "proved", "submitted"])
    p.add_argument("--notes")
    p.set_defaults(func=cmd_add_lane)

    p = sub.add_parser("check-duplicate", help="look up existing lanes in the same family")
    _add_common_root(p)
    p.add_argument("--surface", required=True)
    p.add_argument("--invariant", required=True)
    p.add_argument("--sink", required=True)
    p.add_argument("--root-cause", required=True)
    p.set_defaults(func=cmd_check_duplicate)

    p = sub.add_parser("list", help="print all lane records as JSON")
    _add_common_root(p)
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("digest", help="print agent-readable context")
    _add_common_root(p)
    p.add_argument("--limit", type=int, default=20)
    p.set_defaults(func=cmd_digest)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
