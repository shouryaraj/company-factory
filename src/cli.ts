#!/usr/bin/env node
// company-factory: build a one-human, many-agent company workspace from company.toml, and watch it work.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CMD, VERSION } from "./paths.js";
import { available, ConfigError, find, frontmatterField, loadCompany, loadToml, type Kind } from "./config.js";
import { build, doctor, examples, init, officeHooks, plugins } from "./build.js";
import { seedDemo, serve } from "./office.js";

const HELP = `company-factory ${VERSION}: describe a company in company.toml, get a team of Claude Code agents, watch them work.

  ${CMD} demo [--example NAME] [--port N] [--no-open]   try the live office with a sample company
  ${CMD} init <dir> [--example NAME]                     start a company from an example
  ${CMD} build <dir> [--dry-run] [--force]               generate or update the workspace
  ${CMD} validate <dir>                                  check company.toml
  ${CMD} doctor [<dir>]                                  check prerequisites (Node, Claude Code, Taskboard, plugins)
  ${CMD} plugins <dir> [--install]                       install the company's marketplace plugins
  ${CMD} office <dir> [--port N] [--open] [--demo]       serve the live office
  ${CMD} list roles|skills|workflows|examples [--dir D]   what can be plugged in
  ${CMD} office-hooks                                    the hooks block for your own .claude/settings.json

Lookup order for roles, skills and workflows: <company>/custom/<kind>/ first, then the built-in library.`;

const quiet = () => {};

/** A throwaway company from an example, built and served with the office's demo playback. */
async function demo(example: string, port: number | undefined, open: boolean) {
  const dir = mkdtempSync(join(tmpdir(), `company-factory-${example}-`));
  init(dir, example, quiet);
  // The demo runs offline: tickets come from company/board.md, not a Taskboard server.
  const toml = join(dir, "company.toml");
  writeFileSync(toml, readFileSync(toml, "utf8").replace(/^enabled = true/m, "enabled = false"));
  build(dir, { say: quiet });
  seedDemo(loadCompany(dir));
  console.log(`demo company \`${example}\` built in ${dir}`);
  console.log(`  make it yours: ${CMD} init ./my-company --example ${example}`);
  await serve(dir, { port, open, demo: true });
}

function list(kind: string, dir?: string) {
  if (kind === "examples") {
    for (const [name, desc] of examples()) console.log(`${name.padEnd(22)} ${desc}`);
    return;
  }
  if (!["roles", "skills", "workflows"].includes(kind)) throw new ConfigError(`list what? roles, skills, workflows or examples`);
  for (const [name, origin] of available(kind as Kind, dir)) {
    const path = find(kind as Kind, name, dir)!;
    const desc = kind === "roles" ? String(loadToml(path).description ?? "") : frontmatterField(readFileSync(path, "utf8"), "description");
    console.log(`${name.padEnd(22)} [${origin}] ${desc.slice(0, 100)}`);
  }
}

async function main() {
  const { values: o, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      example: { type: "string" }, port: { type: "string" }, dir: { type: "string" },
      "dry-run": { type: "boolean" }, force: { type: "boolean" }, install: { type: "boolean" },
      open: { type: "boolean" }, "no-open": { type: "boolean" }, demo: { type: "boolean" },
      version: { type: "boolean", short: "v" }, help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, arg] = positionals;
  if (o.version) return console.log(`company-factory ${VERSION}`);
  if (o.help || !cmd) return console.log(HELP);
  const port = o.port ? Number(o.port) : undefined;
  const dir = () => {
    if (!arg) throw new ConfigError(`\`${cmd}\` needs a company folder, e.g. \`${CMD} ${cmd} ./acme\``);
    return resolve(arg);
  };

  switch (cmd) {
    case "demo": return demo(o.example ?? "saas", port, !o["no-open"]);
    case "init": return init(dir(), o.example ?? "starter");
    case "validate": { const cfg = loadCompany(dir()); return console.log(`ok: ${cfg.company.name} (${cfg.roles.length} roles)`); }
    case "build": build(dir(), { dryRun: o["dry-run"], force: o.force }); return;
    case "doctor": if (!(await doctor(arg ? resolve(arg) : undefined))) process.exitCode = 1; return;
    case "plugins": return plugins(dir(), o.install);
    case "office": return serve(dir(), { port, open: o.open || o.demo, demo: o.demo });
    case "office-hooks": return console.log(JSON.stringify({ hooks: officeHooks() }, null, 2));
    case "list": return list(arg ?? "", o.dir ? resolve(o.dir) : undefined);
    default: throw new ConfigError(`unknown command \`${cmd}\`\n\n${HELP}`);
  }
}

main().catch((e) => {
  if (e instanceof ConfigError) {
    console.error(`config error:\n${e.message}`);
    process.exit(1);
  }
  if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`that port is busy; pass --port <another>`);
    process.exit(1);
  }
  throw e;
});
