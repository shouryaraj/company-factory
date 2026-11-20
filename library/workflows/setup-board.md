---
description: Create the company's Taskboard project, lanes and one agent per role (idempotent)
---
You are the $orchestrator of $company. Set up the Taskboard to mirror `company.toml`.

1. Call list_projects, list_agents and list_teams first. Reuse anything that already exists; never create duplicates or touch other projects.
2. Project: `$project`, prefix `$prefix`. Describe it with the mission from `company/charter.md`.
3. Lanes for that project, in order: $lanes.
4. Agents (kind `ai`, model `claude-code:<id>`), one per role:
$roles_list
5. One agent for the $founder, kind `human`.
6. Write all IDs to `company/board-ids.md` (project id, lane keys, agent id per role) so later commands can assign tickets.
7. Report what was created and what was reused.
