---
name: code-change
description: Make a small, tested code change on a feature branch, matching the surrounding code.
---
# Code change

1. Read the spec/ticket, any ADR, and the code you will touch plus its tests.
2. Branch: `git switch -c <ticket-key>-<slug>` (local only).
3. Write a failing test for the behaviour first when practical.
4. Make the smallest change that passes. Match existing naming, comment density and idiom.
5. Run the full relevant test suite and any linter the project uses. Paste the exact command and result in your handoff.
6. Update docs/examples affected by the change.
7. Commit with a message: `<ticket-key>: <what and why>`.

Stop and report instead of guessing when: the spec is ambiguous, a dependency is needed, or the change spreads beyond the ticket's files.
