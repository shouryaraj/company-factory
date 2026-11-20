# Changelog

## 0.3.0
- **Rewritten in TypeScript.** Node 20+, strict TypeScript, one runtime dependency (`smol-toml`). Install with `npm install -g github:shouryaraj/company-factory`, or try it with `npx github:shouryaraj/company-factory demo`. Generated companies are unchanged; rebuilding replaces the Python hook with `.claude/hooks/office-event.mjs` (run with `node`). Default looks are identical, so everyone keeps their face.
- **Office UI**: a Preact + htm app styled with Tailwind (`web/app.ts`), with the canvas in `web/scene.ts`, bundled by esbuild into `dist/web`.
- **Taskboard is a documented prerequisite**: the examples use it, the README lists it under Prerequisites, `build` warns when it is not installed, and the demo still runs without it.
- **`company-factory doctor [<dir>]`** checks Node, Claude Code, Taskboard (installed, running, project set up), marketplace plugins and the office hooks.
- Tests moved to vitest; CI builds, typechecks and tests on Linux, macOS and Windows.

## 0.2.0
- **Installable**: `pipx install git+https://github.com/shouryaraj/company-factory`, or `uvx --from git+… company-factory demo`. `python3 factory.py` still works from a clone.
- **`company-factory demo`**: try the office with a sample company and scripted activity in 30 seconds.
- **New examples**: `saas`, `open-source` (custom roles and a custom `/triage` workflow), `content-studio`. The Flightscope example was removed.
- **10 new skills**: debugging, test-plan, security-review, adr-writing, release-notes, issue-triage, pricing-research, ux-review, launch-checklist, decision-memo. Roles preload their skills (`skills:` in the agent frontmatter).
- **Marketplace skills via `[plugins]`**: Anthropic's `document-skills` and `example-skills` are on by default; roles reference them with `plugin_skills = ["plugin:skill"]`. `company-factory plugins <dir> --install` installs them.
- **Taskboard**: `build` writes `.mcp.json` for the Taskboard MCP server (`[taskboard] command`, `mcp`); the office links to the board.
- **Office**: the sidebar is now built with htm + Preact (vendored, no build step); in demo mode tickets move across lanes; overlapping speech bubbles stack.
- Docs: config reference, office, skills, Taskboard. Added CONTRIBUTING, Code of Conduct, SECURITY.

## 0.1.1
- The office records `Stop` and `SessionEnd` synchronously, so `claude -p` runs end cleanly.

## 0.1.0
- First release: company.toml → Claude Code workspace, and the live pixel office.
