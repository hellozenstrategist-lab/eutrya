# KAH Ledger System

A ledger-first coordination layer for Hermes Agent workflows.

KAH started as an internal mod to the Kitsune Agent Harness. The original problem was volume: many agents were exploring lanes, hypotheses, invariants, proof ideas, and dead ends at the same time. Without a shared operational memory layer, agents could repeat the same work, lose why a lane had already been killed, or promote an idea before checking prior context.

This repository is a sanitized public slice of that system. It shows the core pattern without private targets, bounty evidence, exploit code, vendor communications, credentials, or unpublished vulnerability details.

## What KAH does

KAH gives agents a simple operating memory:

- record work as structured append-only ledger entries;
- derive stable fingerprints for duplicate-family detection;
- preserve status, evidence notes, and kill reasons;
- generate compact digests that can be injected into future Hermes prompts;
- rebuild indexes from the ledger instead of trusting fragile local state.

The current public version is intentionally small. It is a reference implementation of the pattern, not the full private control plane.

## How it fits with Hermes Agent

Hermes Agent already provides the execution environment: tools, skills, profiles, memory, cron jobs, messaging gateways, and terminal/file access.

KAH sits on top as a workflow control layer. It gives Hermes agents a shared source of truth for repeated multi-agent work. Before an agent spends time on a task, it can check the ledger, see related lanes, and decide whether the work is new, already dead, or supporting evidence for an existing thread.

In practice:

```text
Hermes Agent = agent runtime and tool access
KAH          = structured operational memory for high-volume agent work
```

## Why not just use an Obsidian brain?

Obsidian is a strong human knowledge base. KAH is an operational state layer.

I still like Obsidian for narrative notes, long-form thinking, and human review. The problem is that Markdown notes do not reliably enforce workflow when multiple agents are running. Agents need a smaller, stricter format they can read and write without guessing.

| Need | Obsidian brain | KAH ledger system |
| --- | --- | --- |
| Human notes | Excellent | Basic |
| Agent-readable state | Inconsistent Markdown | Structured JSONL records |
| Duplicate detection | Search-dependent | Stable lane fingerprints |
| Workflow status | Usually manual | Explicit states like `candidate`, `dead`, `proved` |
| Audit trail | Depends on note discipline | Append-only by default |
| Prompt injection | Large vault context or manual excerpts | Compact generated digests |
| Automation | Possible, but loose | Designed for agents and scripts |

Short version:

> Obsidian stores what we know. KAH operationalizes what we know.

Or even simpler:

> Obsidian is the library. KAH is air traffic control.

## Why ledger-first?

I chose append-only JSONL ledgers over a mutable task database for the first version.

That was deliberate. The expensive failure mode was not an ugly UI. The expensive failure mode was losing context, repeating dead work, or letting an agent act on an idea that had already failed. JSONL gave me a cheap source of truth that agents could update, humans could inspect, and scripts could rebuild into better views later.

A lane fingerprint is derived from the stable parts of the work:

```text
surface + invariant + impact sink + root-cause shape -> fingerprint
```

That means two agents can describe the same idea differently but still collide if the underlying lane is the same.

## Non-security uses

KAH is not limited to cybersecurity. The same pattern works anywhere agents explore many possibilities and need shared memory.

Examples:

- sales research: track accounts, outreach angles, dead leads, and duplicate company research;
- recruiting: track candidates, role fit, rejection reasons, and outreach history;
- product operations: collect feature requests, group duplicates, and preserve decision history;
- customer support: track recurring issues, attempted fixes, and escalation paths;
- software engineering: record flaky tests, refactor lanes, failed fixes, and architectural risks;
- market research: preserve hypotheses, source trails, confidence, and dead ends.

The common problem is not the domain. It is agent coordination under volume.

## Quick start

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e . pytest
pytest -q

kah-ledger init --root /tmp/kah-demo

kah-ledger add-lane --root /tmp/kah-demo \
  --agent scout-1 \
  --surface "state variable reads" \
  --invariant "state derived from invalidated writes must not authorize value movement" \
  --sink "direct loss of funds" \
  --root-cause "missing freshness check" \
  --hypothesis "downstream component may trust stale state"

kah-ledger digest --root /tmp/kah-demo
```

Example digest:

```text
KAH_LEDGER_DIGEST:
  lanes: 1
  families: 1
  status_counts: candidate=1
  recent_lanes:
    - lane_... [candidate] fp=... sink=direct loss of funds; surface=state variable reads; root=missing freshness check
```

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
docs/
  answer-to-dan.md
  obsidian-vs-kah.md
  applications-beyond-security.md
tests/
  test_ledger.py
```

## Design boundaries

This repository is a workflow/tooling artifact.

It is not:

- a vulnerability report;
- an exploit release;
- a target repository;
- a replacement for human review;
- a full replica of the private Kitsune system.

The examples are generic by design.

## License

MIT
