---
name: adr-writing
description: Record an architecture decision as a short ADR - context, options with trade-offs, decision, consequences - so future agents do not relitigate it.
---
# ADR writing

Write one when a choice is expensive to reverse: a dependency, a data model, a protocol, a hosting choice, a public API.

File: `docs/adr/NNNN-<slug>.md` (next free number). Sections, in order:

1. **Status**: proposed | accepted | superseded by NNNN. Date.
2. **Context**: the forces in 3-6 bullets. Facts, constraints, numbers. Link the ticket.
3. **Options**: at least two real options (doing nothing counts). For each: how it works in one line, pros, cons, cost, reversibility.
4. **Decision**: one sentence, active voice ("We use SQLite with WAL mode").
5. **Consequences**: what gets easier, what gets harder, what we must now watch, with a trigger to revisit ("revisit if writes exceed 50/s").
6. **Verify**: anything assumed but unverified, marked `(verify)`, with how to check it.

Rules:
- Under one page. If it needs more, the decision is too big; split it.
- A proposed ADR that crosses an approval gate (money, licence, direction) goes to `company/approvals.md` before it is accepted.
- Add one line to `company/decisions.md` linking the ADR.
