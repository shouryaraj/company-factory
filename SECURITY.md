# Security

## Reporting
Please report vulnerabilities privately through [GitHub security advisories](https://github.com/shouryaraj/company-factory/security/advisories/new), not in public issues. You will get a reply within a week.

## Design
- **The office server only reads.** No endpoint writes files or runs commands. It binds to `127.0.0.1`, rejects foreign `Host` headers (DNS rebinding) and serves an allow-list of static files.
- **The hook** (`.claude/hooks/office-event.mjs`, run with `node`, imports nothing outside Node) **records very little:** event names, agent and tool names, and short labels (relative paths, search patterns, a Bash description, the first 90 characters of a user prompt). It never records file contents, tool output or subagent prompts.
- **Generated agents** are told never to cross approval gates (external communication, publishing, money, legal, irreversible actions, direction). That is guidance to the model, not a sandbox: your Claude Code permission settings are the real boundary.
- **Marketplace plugins** you enable run with your permissions. Only enable marketplaces you trust.
