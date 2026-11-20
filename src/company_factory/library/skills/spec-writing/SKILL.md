---
name: spec-writing
description: Write a product spec that an engineer and QA can act on without follow-up questions.
---
# Spec writing

Save as `product/specs/<ticket-key>-<slug>.md`:

1. **Problem**: who has it, what they do today, evidence (link interviews/research; mark assumptions).
2. **Goal**: the one outcome this delivers. How we will know it worked.
3. **Scope**: what is in, as user-visible behaviour.
4. **Non-goals**: what is deliberately out, so nobody builds it.
5. **Acceptance criteria**: numbered, each testable (Given / When / Then, or a command and its expected output).
6. **Open questions & assumptions**: each with how and when to resolve it.
7. **Tickets**: proposed split, one role each, in dependency order.

Rules: one page if possible. No solution detail the tech lead should decide. If you cannot write a testable criterion, the scope is not clear yet: say so.
