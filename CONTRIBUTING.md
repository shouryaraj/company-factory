# Contributing

Thanks for helping. company-factory is deliberately small: Python standard library, one HTML page, no build step. Please keep it that way.

## Setup
```bash
git clone https://github.com/shouryaraj/company-factory && cd company-factory
python3 -m unittest discover -s tests     # all tests, under a second
python3 factory.py demo                   # the office with a sample company
```

## Good first contributions
- **A role** (`src/company_factory/library/roles/<id>.toml`): give it a `department`, a sharp `description` (it tells the Chief of Staff when to delegate), `never` rules and a checkable `done`.
- **A skill** (`src/company_factory/library/skills/<name>/SKILL.md`): one procedure, numbered steps, a named output file, and what "verified" means. Under about 40 lines.
- **An example company** (`src/company_factory/examples/<name>/company.toml`): the first line must be `# <name>: <one-line description>`. Use fictional companies only.
- **Office art**: people, furniture and rooms are drawn in code in `library/office/index.html`. Keep it original; no sprite sheets from games.

## Rules of thumb
- No new runtime dependencies. If a feature needs one, open an issue first.
- Every config key is validated with a clear error message, and documented in `docs/config.md`.
- Generated files must stay deterministic, so rebuilds do not churn.
- The office server stays read-only.
- Add a test for behaviour you change (`tests/test_office.py` shows the patterns).

## Pull requests
Small and focused, with a line in `CHANGELOG.md` under *Unreleased*. Screenshots or a GIF for anything visual.
