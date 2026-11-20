---
name: debugging
description: Find the root cause of a bug with evidence - reproduce, isolate, hypothesise, test one change at a time - before writing any fix.
---
# Debugging

Never fix what you have not reproduced.

1. **Reproduce.** Write the exact command, input and observed vs expected output. If you cannot reproduce it, stop and report what you tried; do not guess-fix.
2. **Shrink.** Cut the input and code path until removing anything else makes the bug disappear. Turn that into a failing test.
3. **Read before you change.** Trace the failing path: logs, stack trace, the code at each frame. Note every assumption you are making.
4. **Hypothesise, then test one thing.** Write the hypothesis down ("the cache returns stale data after a write"). Design a check that would prove it wrong. Change one variable per run.
5. **Bisect when lost.** `git bisect` across commits, or binary-search config, data or versions.
6. **Fix the cause, not the symptom.** If the fix is a guard or retry, explain why the root cause cannot be fixed here.
7. **Prove it.** The failing test now passes and the full suite still passes; paste both commands and results.

Handoff must include: root cause in one sentence, evidence, the fix, the test, and anything else likely affected by the same cause.
