---
description: Add, change or remove a role (or plug a skill into one) via company.toml
argument-hint: <role change, e.g. "add a designer" or "give sales-dev the content-writing skill">
---
Change requested by the $founder: $ARGUMENTS

You are the $orchestrator of $company. Roles are config, not hand-written files.

1. See what exists: `$factory list roles --dir .` and `$factory list skills --dir .`
2. Edit `company.toml`:
   - New role: add a `[[roles]]` entry. Reuse a library role with `use = "<id>"` and override only what differs (`model`, `owns`, `skills`, or `skills_add` to extend).
   - New capability: plug an existing skill into the role's `skills`. If no skill fits, write `custom/skills/<name>/SKILL.md` (frontmatter `name`, `description`, then the procedure).
   - A role unlike any library role: write `custom/roles/<id>.toml` (copy the shape of a library role).
3. Run `$factory build . --dry-run` and show the $founder the planned changes and the `company.toml` diff.
4. This is a Direction gate: build for real only after the $founder approves. Then run `$factory build .`. If the Taskboard is enabled, run /setup-board to add the new agent.
