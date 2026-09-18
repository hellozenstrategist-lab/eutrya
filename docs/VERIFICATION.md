# Eutrya Native 0.4.0 — verification record

Build date: **September 18, 2026**. Clean CI environment: **GitHub Actions, Ubuntu, Node.js 22**.

## Current results

| Check | Result | Evidence |
| --- | --- | --- |
| Full test suite | **226 passed, 0 failed, 0 skipped** | GitHub Actions run 35373873266 |
| JavaScript syntax | **53 modules passed** | `npm run check` in the same CI run |
| Hunt-board persistence | **Passed** | `tests/hunt-board.test.mjs` |
| Busy-agent exclusion | **Passed** | Jev hunt routing regression test |
| Independent review routing | **Passed** | Original worker excluded when another specialist is idle |
| Multi-card distribution | **Passed** | One routing wave spreads cards across distinct idle residents |
| Hunt dependencies | **Passed** | Dependent cards remain Intake until prerequisites are Done |
| Existing research lane | **Passed** | Existing strategist/Jev and semantic-code tests remain green |
| Live paid inference | **Not part of CI** | No claim of live-provider quality certification |

## 0.4 hunt-board acceptance checks

The hunt board stores the authorized program page, normalized rules, scope, exclusions, testing constraints, cards, card dependencies, assignment history, results, blockers, and review results in the shared swarm workspace.

The router passes only currently idle, enabled non-Admin specialists to Jev. Busy residents are therefore unavailable by construction rather than merely discouraged by prompt text. Review-stage routing excludes the original worker whenever another idle specialist is available.

A routing wave assigns cards sequentially while launching the chosen resident jobs concurrently. Because a resident is marked Working before the next card is routed, subsequent Jev choices see the updated availability set and cannot pile work onto that resident.

Cards move through `intake → ready → active → review → done`, with explicit `blocked` and `parked` states. Dependencies keep a card in Intake until all prerequisite cards are Done.

## What these results do not establish

The suite validates controller wiring, persistence, availability filtering, deterministic mock routing, action validation, and prior runtime behavior. It does not establish live-model judgment quality, vulnerability-finding rates, bounty eligibility, production reliability, or formal security correctness. Real hunt activity must still remain within the supplied program rules and authorization.
