# The office

```bash
company-factory office <company dir> [--port 4477] [--open] [--demo]
```

## How it works
```
Claude Code ──hooks──> .claude/hooks/office-event.mjs ──append──> .office/events.jsonl
                                                                     │ tail
company.toml, company/*.md, handoffs/, Taskboard API ──read──> office server ──SSE──> browser
```

`build` registers one hook script for `SessionStart UserPromptSubmit PreToolUse PostToolUse PostToolUseFailure SubagentStart SubagentStop Stop Notification SessionEnd`. Tool events are **async**, so they never slow Claude down. `Stop` and `SessionEnd` are synchronous (one ~50 ms call per turn), because Claude Code kills async hooks when a `claude -p` run exits.

| Event | In the office |
|---|---|
| `UserPromptSubmit` | the founder walks to the Chief of Staff with your prompt |
| `PreToolUse` on `Agent` | a ticket flies from the Chief of Staff to the role's desk |
| `SubagentStart` | the role sits down; the monitor lights up |
| `PreToolUse` inside a subagent | a speech bubble shows the step: `editing app/x.py`, `$ run tests`, `googling …` |
| `SubagentStop` | the role walks the handoff to the shelf |
| built-in subagent types (Explore, …) | guests at the meeting table, who leave when done |
| `Notification` | a bell rings at the founder's desk |
| `Stop` / `SessionEnd` | everyone goes back to idle |

Idle people wander to the coffee machine, the water cooler or the couch.

## Data shown
- **Needs you**: unchecked items under `## Pending` in `company/approvals.md` (format `- [ ] A-001 (role, date): title | …`), plus tickets in the `needs_founder` lane.
- **Board**: from Taskboard when `[taskboard] enabled`; otherwise from the rows of `company/board.md` (`| KEY-1 | lane | role | title | done when |`).
- **Shelf**: the newest `handoffs/<KEY>-<n>-<role>.md` files.

## Privacy
The hook writes one line per event: time, event name, agent type, tool name and a short label. The label is a relative file path, a search pattern, a URL, a Bash description, or the first 90 characters of a prompt (prompts are only recorded for `UserPromptSubmit`). It never records file contents, tool output or subagent prompts. The log rotates at 1 MB and lives in `.office/`, which ignores itself in git.

## Security
- The server only reads. It has no endpoint that writes a file or runs anything.
- It binds to `127.0.0.1` and rejects requests whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS-rebinding reads from other websites.
- Static files are an allow-list: the page, one script and one stylesheet.

## Already have `.claude/settings.json`?
`build` never overwrites a file it did not create. Merge in the hooks from `company-factory office-hooks`.

## Demo mode
`?demo` on the URL (or `--demo`, or `company-factory demo`) plays scripted activity on top of the real data. Tickets move across the board in the browser only; nothing is written.

## Frontend
Written in TypeScript under `web/`: `scene.ts` draws the office on a `<canvas>` (all in code, no sprite files); `app.ts` is a [Preact](https://preactjs.com) + [htm](https://github.com/developit/htm) app styled with [Tailwind](https://tailwindcss.com). `npm run build` bundles them with esbuild into `dist/web` (about 40 KB of JS and 12 KB of CSS), so users never run a build and the page works offline.
