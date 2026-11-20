---
name: release-notes
description: Turn the commits and merged PRs since the last tag into a changelog entry, migration notes and a release checklist.
---
# Release notes

1. List changes since the last tag: `git log --oneline <last-tag>..HEAD` and merged PR titles.
2. Group them as Breaking, Added, Fixed, Docs, Internal. Every breaking change gets a migration note with a before/after example.
3. Credit contributors by handle, as written in the PR.
4. Update `CHANGELOG.md` under a new version heading (Keep a Changelog style).
5. Write `release/<version>.md`: version bump locations, tests run, docs updated, upgrade tested from the previous release. Leave tagging and publishing to the Lead Maintainer.
