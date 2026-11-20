---
name: issue-triage
description: Triage a GitHub issue or PR into a label set, a repro result and a kind, specific draft reply.
---
# Issue triage

For each issue (read it with `gh issue view <n>` if available, otherwise from the ticket):

1. Classify: bug, feature request, question, docs, duplicate (link the original) or invalid.
2. Bugs: reproduce with the smallest example on the latest release and on `main`. Record the exact commands and output.
3. Draft labels from the project's existing label set only.
4. Draft a reply: thank them, state what you found, ask at most one question, and say what happens next. No promises about dates.
5. Save to `triage/<number>.md` with sections: Type, Labels, Repro, Draft reply, Suggested owner.
