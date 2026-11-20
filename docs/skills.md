# Skills

A skill is a folder with a `SKILL.md`: frontmatter `name` and `description`, then a procedure. Roles list skills in `skills`; `build` copies them to `.claude/skills/` and preloads them into each role's subagent.

## Built-in
`company-factory list skills` shows them all:

| Skill | For |
|---|---|
| `code-change` | small, tested changes that read like the surrounding code |
| `code-review` | correctness-first review of a diff |
| `debugging` | reproduce, shrink, hypothesise, prove; root cause before fix |
| `test-plan` | risk-ranked test plan, run with evidence |
| `security-review` | trust boundaries and concrete attack paths |
| `adr-writing` | one-page architecture decision records |
| `release-notes` | changelog, migration notes, release checklist |
| `spec-writing` | specs with acceptance criteria |
| `customer-interview` | interview guides and synthesis without leading questions |
| `competitor-research` | sourced competitor tables |
| `pricing-research` | value metric, market prices, tier options |
| `ux-review` | flows, states, accessibility, prioritised fixes |
| `content-writing` | posts and docs for one channel and one audience |
| `launch-checklist` | brief, message, assets, channels, runbook |
| `outreach-drafting` | personal outreach drafts (never sent) |
| `issue-triage` | labels, repro and a kind first reply |
| `metrics-report` | honest metric reports |
| `decision-memo` | one-page memos for the founder's decisions |

## Your own
Create `<company>/custom/skills/<name>/SKILL.md`:
```markdown
---
name: incident-postmortem
description: Write a blameless postmortem - timeline, impact, root cause, actions with owners.
---
# Incident postmortem
1. ...
```
Add it to a role's `skills` (or `skills_add`) and rebuild. A custom skill with the same name as a built-in replaces it for that company.

## From plugin marketplaces
Claude Code plugins can bundle skills. company-factory enables Anthropic's [skills marketplace](https://github.com/anthropics/skills) by default:

| Plugin | Skills |
|---|---|
| `document-skills` | xlsx, docx, pptx, pdf |
| `example-skills` | frontend-design, webapp-testing, doc-coauthoring, skill-creator, mcp-builder, brand-guidelines, internal-comms, theme-factory, canvas-design, … |

Built-in roles use some of them by default: designer → `example-skills:frontend-design`, engineer and QA → `example-skills:webapp-testing`, PM → `example-skills:doc-coauthoring`, finance → `document-skills:xlsx`, growth → `document-skills:pptx`, sales → `document-skills:pdf`.

Add another marketplace:
```toml
[plugins]
marketplaces = { team-tools = "github:your-org/claude-plugins" }
extra_enable = ["incident-kit@team-tools"]

[[roles]]
use = "tech-lead"
plugin_skills_add = ["incident-kit:postmortem"]
```
Then `company-factory build <dir>` and, once per machine, `company-factory plugins <dir> --install`. That command runs `claude plugin marketplace add … --scope project` and `claude plugin install … --scope project`.

Turn marketplace plugins off with `[plugins] enable = []` (and remove `plugin_skills` from roles; `validate` tells you which).
