---
name: test-plan
description: Turn a spec or change into a risk-ranked test plan and run it - golden path, edges, failure modes, regressions - with evidence.
---
# Test plan

1. Read the spec's acceptance criteria and the diff. List what can break, ranked by likelihood x impact.
2. Write `qa/<ticket>-plan.md` with a table: case, type (golden path | edge | failure | regression | security), steps, expected, automated (y/n).
   - Golden path first: the one flow that must work.
   - Edges: empty, one, many, huge, unicode, timezones, concurrent use, slow network.
   - Failures: bad input, missing permissions, dependency down. The product must fail loudly and recoverably.
   - Regressions: nearby features that share code with this change.
3. Automate what will be run again; do the rest by hand and record exact steps.
4. Run everything. Record actual results next to expected, with command output or screenshot paths.
5. Verdict: PASS / PASS WITH ISSUES / FAIL. Every issue becomes a bug with reproduction steps and severity.

Never mark a case passed that you did not run.
