---
description: Triage new issues and PRs - draft replies and labels for the Lead Maintainer to approve
argument-hint: [issue numbers or "new"]
---
You are the $orchestrator of $company. Triage: $ARGUMENTS

1. Find the issues (the numbers given, or everything opened since the last triage noted in `triage/LAST.md`).
2. Create one ticket per issue. $board_write
3. Delegate up to 5 issues at a time to the `triager`, in parallel. Route docs confusion to `docs-writer` as a follow-up ticket.
4. Collect the drafts. For each, add one approval request to `company/approvals.md`: "post reply + labels on #<n>".
5. Update `triage/LAST.md` with today's date and report to the $founder: issues triaged, bugs reproduced, approvals waiting.
