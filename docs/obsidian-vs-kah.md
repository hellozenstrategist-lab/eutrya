# KAH vs. an Obsidian brain

KAH is an upgrade from an Obsidian brain for agent operations because it changes the unit of memory.

Obsidian is excellent for human knowledge. It is flexible, searchable, and good for long-form notes. That flexibility is also the weakness when multiple agents need to coordinate. Markdown does not enforce state, duplicate checks, evidence shape, or next actions unless every agent follows the same note discipline perfectly.

KAH is stricter. It treats each lane as a structured record with a status, fingerprint, source fields, and notes. That gives agents something they can read, write, compare, and summarize without guessing.

## The difference

```text
Obsidian = knowledge archive
KAH      = operational memory
```

Obsidian answers: "What did we write down?"

KAH answers:

- Has this lane already been explored?
- Is it new, dead, parked, admitted, proved, or submitted?
- Which family does it belong to?
- Why did the previous agent kill it?
- What should the next agent know before spending time?

## Why this matters for Hermes agents

Hermes agents can already use memory, skills, files, cron jobs, and platform gateways. KAH adds a stricter coordination layer for high-volume work.

Instead of asking an agent to search a large vault and infer the current state, KAH gives the agent a compact digest generated from structured ledgers. That reduces context load and makes repeated work easier to catch.

## Comparison

| Capability | Obsidian brain | KAH |
| --- | --- | --- |
| Long-form thinking | Strong | Limited |
| Human readability | Strong | Good, but structured |
| Agent write reliability | Medium | High |
| Duplicate detection | Search and judgment | Fingerprint lookup |
| Status tracking | Manual | Schema-backed |
| Audit trail | Git/history dependent | Append-only ledger rows |
| Prompt context | Notes must be selected | Digest generated from state |
| Automation | Possible | Native design goal |

## Practical relationship

The best setup is not KAH instead of Obsidian. It is both:

- Obsidian for human-facing notes, strategy, and narrative writeups.
- KAH for agent-facing state, dedupe, status, and handoff control.

That division keeps the human brain readable and the agent brain reliable.
