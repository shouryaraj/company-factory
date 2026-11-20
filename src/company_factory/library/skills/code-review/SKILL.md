---
name: code-review
description: Review a change for correctness first, then tests, simplicity and fit; report concrete findings.
---
# Code review

1. Read the spec's acceptance criteria, then the diff (`git diff main...<branch>`).
2. Run the tests and the change itself. Never review code you have not run.
3. Look for, in order: wrong behaviour, unhandled edge cases and errors, missing tests, security/data issues, needless complexity, mismatch with surrounding style.
4. Report each finding as: `path:line`, severity (blocker / should-fix / nit), what fails and when, suggested fix.
5. Verdict: approve, approve with fixes, or request changes. Blockers mean request changes.

Do not rewrite the code yourself; findings go back through the Chief of Staff to the engineer.
