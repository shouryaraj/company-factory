# Contributing

Thanks for helping. company-factory is deliberately small: TypeScript on Node, one runtime dependency (`smol-toml`), and a Preact + htm + Tailwind UI bundled at build time. Please keep it that way.

## Setup
```bash
git clone https://github.com/shouryaraj/company-factory && cd company-factory
npm install            # also builds dist/ (the `prepare` script)
npm test               # build + vitest, a few seconds
npm run typecheck      # strict tsc for src/ and web/
npm run demo           # the office with a sample company
```

## Layout
```
src/         the CLI (cli.ts), config loading and validation (config.ts), generated markdown (render.ts),
             building a workspace (build.ts), the office server (office.ts), and the Claude Code hook (hook/)
web/         the office UI: app.ts (Preact + htm components, Tailwind classes), scene.ts (the canvas), office.css
library/     built-in roles, skills, workflows and defaults (data, not code)
examples/    example companies
scripts/     build-web.mjs (esbuild + Tailwind into dist/web)
test/        vitest
```

## Good first contributions
- **A role** (`library/roles/<id>.toml`): give it a `department`, a sharp `description` (it tells the Chief of Staff when to delegate), `never` rules and a checkable `done`.
- **A skill** (`library/skills/<name>/SKILL.md`): one procedure, numbered steps, a named output file, and what "verified" means. Under about 40 lines.
- **An example company** (`examples/<name>/company.toml`): the first line must be `# <name>: <one-line description>`. Use fictional companies only.
- **Office art**: people, furniture and rooms are drawn in code in `web/scene.ts`. Keep it original; no sprite sheets from games.

## Rules of thumb
- No new runtime dependencies without an issue first. Dev dependencies are fine.
- The hook (`src/hook/office-event.ts`) is copied into every company and run with plain `node`: it may only import `node:` modules.
- Every config key is validated with a clear error message, and documented in `docs/config.md`.
- Generated files must stay deterministic, so rebuilds do not churn.
- The office server stays read-only.
- Add a test for behaviour you change (`test/factory.test.ts` shows the patterns).

## Pull requests
Small and focused, with a line in `CHANGELOG.md` under *Unreleased*. Screenshots or a GIF for anything visual.
