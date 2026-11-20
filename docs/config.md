# company.toml reference

Only `[company] name`, `[company] mission` and one `[[roles]]` entry are required. Everything else has a default.
Run `company-factory validate <dir>` to check a config: it reports every problem at once, before anything is written.

## [company]
| Key | Default | Meaning |
|---|---|---|
| `name` | required | Company name, used everywhere. |
| `mission` | required | One sentence: who you help, with what. |
| `founder_title` | `"Founder"` | Your title. Agents escalate to this person. |
| `bet` | `""` | The current product bet (multi-line string). Goes into the charter. |
| `icp` | `""` | Who the customers are, and who they are not. |
| `principles` | `[]` | Numbered principles in the charter. |

## [orchestrator]
| `title` | `"Chief of Staff"` | What the main Claude Code session is called. |
|---|---|---|

## [defaults]
Applied to every role unless the role overrides it: `model` (`opus`, `sonnet`, `haiku`, `fable` or `inherit`), `tools` (a list of Claude Code tool names).

## [[roles]]
Start from a built-in role with `use = "<id>"` (see `company-factory list roles`), or define one from scratch with `id`, `title`, `description`, `mission`.

| Key | Meaning |
|---|---|
| `use` | Built-in or `custom/roles/<id>.toml` template to start from. |
| `id` | kebab-case id; becomes `.claude/agents/<id>.md`. Defaults to `use`. |
| `title`, `description`, `mission` | Who they are. `description` tells the Chief of Staff when to delegate to them. |
| `department` | Groups roles into default office rooms. |
| `model`, `tools` | Claude Code subagent settings. |
| `skills` | Local skills (built-in or `custom/skills/`), preloaded into the subagent. |
| `plugin_skills` | Marketplace skills as `"plugin:skill"`; the plugin must be enabled in `[plugins]`. |
| `owns` | Paths this role may edit. Folders ending in `/` are created on build. |
| `responsibilities`, `never`, `done` | Bullet lists in the agent's instructions. |
| `look` | Office appearance: `shirt`, `skin`, `hair` (`#rrggbb`), `hair_style` (`short long bun spiky bald`), `accessory` (`none glasses headset cap beanie`). Unset keys get a stable look derived from the id. |

Every list key also has an `_add` form (`skills_add`, `plugin_skills_add`, `owns_add`, `responsibilities_add`, `never_add`, `done_add`, `tools_add`) that extends the template instead of replacing it.

## [policy] and [[gates]]
Defaults live in `library/defaults.toml`: six approval gates (External communication, Publishing, Money, Legal and identity, Irreversible, Direction), an autonomy list and working rules.

- `[policy] rules = [...]` / `autonomy = [...]` replace the defaults; `extra_rules` / `extra_autonomy` extend them.
- `[[gates]]` entries (`name`, `examples`) replace the default gates; `[policy] extra_gates = [{ name, examples }]` extends them.

## [[goals]]
`objective` plus `key_results = [...]`. Written to `company/goals.md` once, then the file is yours.

## [workflows]
`use = [...]` picks the slash commands (built-in or `custom/workflows/<name>.md`). Default: `standup kickoff approvals weekly-review setup-board hire`. `setup-board` is dropped when Taskboard is off.

Workflow files are Markdown prompts with frontmatter (`description`, optional `argument-hint`) and these variables:
`$company $founder $orchestrator $prefix $project $lanes $board_read $board_write $board_rule $roles_table $roles_list $factory`, plus Claude Code's `$ARGUMENTS`.

## [plugins]
Skills from Claude Code plugin marketplaces. Defaults:
```toml
[plugins]
marketplaces = { anthropic-agent-skills = "github:anthropics/skills" }
enable = ["document-skills@anthropic-agent-skills", "example-skills@anthropic-agent-skills"]
```
- `marketplaces` adds to the defaults. Sources: `github:owner/repo`, `git:<url>`, `https://….git`, `path:<dir>`.
- `enable = [...]` replaces the default plugin list (`[]` turns marketplace plugins off); `extra_enable = [...]` extends it.
- `build` writes them to `.claude/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`). Claude Code does not install project plugins automatically, so run `company-factory plugins <dir> --install` once per machine.

## [taskboard]
| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | `true`: tickets live in Taskboard via MCP. `false`: in `company/board.md`. |
| `project` | `"<name> HQ"` | Taskboard project name. |
| `prefix` | `"TASK"` | Ticket key prefix, 2-8 uppercase letters or digits. |
| `lanes` | `backlog todo in_progress review needs_founder done` | Board columns, in order. The last lane counts as done; `needs_founder` feeds *Needs you*. |
| `command` | `"taskboard"` | Taskboard binary registered in `.mcp.json` as `<command> mcp`. |
| `mcp` | `true` | Write `.mcp.json`. Set `false` if you registered Taskboard yourself. |

## [office]
| Key | Default | Meaning |
|---|---|---|
| `title` | `"<name> HQ"` | Page title. |
| `subtitle` | the mission | Line under the title. |
| `theme` | `"auto"` | `auto` (by local time), `day` or `night`. |
| `port` | `4477` | Local port. |
| `refresh_seconds` | `5` | How often the board, approvals and config are re-read. |
| `events` | `".office/events.jsonl"` | Where the hook writes events. |
| `taskboard_url` | `"http://127.0.0.1:3010"` | Taskboard web/API address. |
| `founder_look`, `orchestrator_look` | derived | Same keys as a role's `look`. |

`[[office.rooms]]`: `id`, `title`, `roles = [...]`, optional `floor = "#rrggbb"`. Each role can be in only one room; roles you do not place go to "Open floor". Without any rooms, there is one room per `department`.
