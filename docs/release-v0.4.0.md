# Eutrya v0.4.0 — Public Alpha

Eutrya v0.4.0 is the first public-alpha release of the consolidated Eutrya harness.

## Highlights

- Five-agent security swarm: **Admin, Auditor, Operator, Sentinel, Analyst**
- Jev-native decision/evaluation layer
- Persistent Jev-routed security hunt Kanban
- Availability-aware agent routing
- Independent review stage for hunt cards
- Read-only strategist + Jev code-research lane
- Shared workspace, findings, blockers, memory, and agent state
- CLI as the primary interface
- Experimental Linux-first Tauri desktop interface
- Local approvals and effect journaling
- Protected `main` workflow with required CI

## Release status

This is a **developer/public-alpha release**, not a claim of production hardening or independent security audit.

- CLI: public alpha / primary supported interface
- Hunt Kanban: alpha
- Research lane: alpha
- Desktop: experimental, Linux-first

Review [SECURITY.md](../SECURITY.md) before using confidential workspaces, real credentials, effectful tools, or external security targets.

## Verification

The consolidated v0.4 codebase passed the repository regression suite and syntax/manifest validation before public-alpha packaging. See [VERIFICATION.md](VERIFICATION.md) for the current verification record.
