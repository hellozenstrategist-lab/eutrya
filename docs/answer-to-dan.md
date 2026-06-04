Link: https://github.com/hellozenstrategist-lab/kah-ledger-system

This is a sanitized public slice of my KAH system, which I built as a mod to my internal Hermes agent harness. I built it because the volume of parallel agent work got too high: agents were exploring lanes, invariants, proof ideas, and dead ends at the same time. Without shared operational memory, they could repeat work or lose why a lane had already been killed.

One technical decision I made was to make the system ledger-first. Instead of starting with a heavier database or dashboard, I used append-only JSONL ledgers. Each agent can write a normalized lane record, and the system derives a fingerprint from the surface, invariant, impact sink, and root-cause shape. That lets later agents check whether an idea is new, related, or already dead before spending time on it.

I chose that because the expensive problem was not UI polish. The expensive problem was duplicate work and lost context. JSONL was simple, inspectable, easy to diff, easy to rebuild into indexes, and reliable enough to start paying for itself immediately.
