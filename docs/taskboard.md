# Taskboard

[Taskboard](https://github.com/tcarac/taskboard) is a local, open-source kanban board (single binary, SQLite) with a built-in MCP server. It is a prerequisite for the examples; set `[taskboard] enabled = false` to use `company/board.md` instead.

`company-factory doctor <dir>` checks that Taskboard is installed, running and set up for the company.

## Setup
```bash
brew tap tcarac/taskboard && brew install taskboard     # or build from source
taskboard start                                         # web UI + API on http://localhost:3010
```
In `company.toml`:
```toml
[taskboard]
enabled = true
project = "Acme HQ"      # created by /setup-board
prefix = "ACME"          # ticket keys ACME-1, ACME-2, ...
lanes = ["backlog", "todo", "in_progress", "review", "needs_founder", "done"]
command = "taskboard"    # or an absolute path, if the binary is not on your PATH
```
Then:
1. `company-factory build <dir>` writes `.mcp.json` with `{"taskboard": {"command": "taskboard", "args": ["mcp"]}}`. When you start `claude` in the folder, Claude Code asks you to approve this project MCP server.
2. In Claude Code, run **`/setup-board`**. It is idempotent: it lists existing projects, agents and teams first and reuses them. It creates the project, your lanes in order, one AI agent per role (`claude-code:<model>`) and a human agent for you, then writes every id to `company/board-ids.md`.
3. `/kickoff <goal>` now creates tickets in Taskboard and assigns them to role agents. The office reads tickets live from `http://127.0.0.1:3010/api` and maps each ticket's owner to a desk.

Already registered Taskboard globally (`claude mcp add taskboard -- /path/to/taskboard mcp`)? Set `mcp = false` to skip `.mcp.json`, so you do not get two `taskboard` servers.

## Troubleshooting
- **The office says "Taskboard unreachable"**: run `taskboard start`, or set `[office] taskboard_url` if it runs on another port.
- **"no Taskboard project yet"**: run `/setup-board` in Claude Code.
- **Tickets show no owner in the office**: owners come from the ticket's agent (ids in `company/board-ids.md`), the agent's name, or an `Owner: <role>` line in the description.
