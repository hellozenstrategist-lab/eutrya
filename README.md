# KAH Ledger System

A sanitized public slice of the Kitsune Agent Harness control plane.

KAH started as a small internal mod to my agent harness. The problem was volume: too many agents, lanes, invariants, proof ideas, dead ends, and duplicate hypotheses moving at the same time. Without a shared memory layer, agents would rediscover the same idea, spend proof time twice, or lose the reason a lane had already been killed.

This repo shows the core technical decision I made: keep the system ledger-first.

Instead of starting with a database or dashboard, every agent writes normalized lane records to append-only JSONL ledgers. The system derives fingerprints from the economic sink, invariant, surface, and root-cause shape. Agents can then check whether a new idea is actually new, related to an existing lane, or already dead.

That trade-off made the tool useful fast:

- JSONL is easy for humans and agents to write.
- Append-only records preserve the audit trail.
- Fingerprints reduce duplicate work without needing perfect semantic search.
- Derived indexes can be rebuilt, so the ledger stays the source of truth.
- The system works locally and does not need a live service to be valuable.

This public version is intentionally sanitized. It does not include private targets, bounty evidence, exploit code, vendor messages, credentials, or unpublished vulnerability details.

## What it does

- Records security research lanes as structured ledger entries.
- Generates stable fingerprints for duplicate detection.
- Builds a small index of lane families.
- Produces a digest agents can paste into prompts before doing new work.
- Keeps the design simple enough to run from a terminal or agent wrapper.

## Quick start

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e . pytest
pytest -q

kah-ledger init --root /tmp/kah-demo
kah-ledger add-lane --root /tmp/kah-demo   --agent scout-1   --surface "state variable reads"   --invariant "state derived from invalidated writes must not authorize value movement"   --sink "direct loss of funds"   --root-cause "missing freshness check"   --hypothesis "downstream component may trust stale state"

kah-ledger digest --root /tmp/kah-demo
```

## One technical decision

I chose append-only ledgers over a mutable task database for the first version.

That was deliberate. In bug hunting, the expensive failure mode is not an ugly UI. The expensive failure mode is repeating the same lane, losing the kill reason, or letting an agent promote a proof idea that already failed. Append-only JSONL gave me a cheap source of truth that agents could update, humans could inspect, and scripts could rebuild into better views later.

Once the ledgers started paying for themselves, I added stricter schema checks, digest generation, and duplicate-family lookup. I did not try to make the system perfect first. I made it hard to lose the truth.

## Repository map

```text
kah_ledger/
  cli.py        terminal interface
  ledger.py     append-only JSONL store
  models.py     lane schema and fingerprinting
  digest.py     agent-readable summaries
examples/
  sanitized_lanes.jsonl
  agent_prompt_context.md
tests/
  test_ledger.py
```

## Safety boundary

This repo is a workflow/tooling artifact. It is not a target repository, not a vulnerability report, and not a PoC release. The examples are generic by design.
