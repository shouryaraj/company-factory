// Turning a Config into files on disk: init, build, plugins, doctor.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { CMD, DIST, EXAMPLES, LIB, read } from "./paths.js";
import { ConfigError, find, loadCompany, type Config } from "./config.js";
import * as render from "./render.js";

export type Say = (line: string) => void;
const MANIFEST = ".factory-manifest.json";
const HOOK_FILE = ".claude/hooks/office-event.mjs";

const ONCE_FILES: Record<string, string> = {
  "company/decisions.md": "# Decision log\n\n| Date | Decision | Why | Decided by |\n|---|---|---|---|\n",
  "company/approvals.md": "# Approvals queue\n\nAgents add requests under Pending. Only the founder decides.\n\n" +
    "## Pending\n<!-- - [ ] A-001 (role, YYYY-MM-DD): action | why | risk | recommendation -->\n\n## Decided\n",
  ".office/.gitignore": "# hook events for the office view; local only\n*\n",
  "company/board.md": "# Board\n\n| Key | Lane | Role | Title | Done when |\n|---|---|---|---|---|\n",
};

const OFFICE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "SubagentStart", "SubagentStop", "Stop", "Notification", "SessionEnd"];
// Claude Code kills async hooks when a `claude -p` run exits, so end-of-turn events record synchronously (~50 ms once per turn).
const OFFICE_SYNC = new Set(["Stop", "SessionEnd"]);

/** The hooks that feed the office. Async where it matters, so they never block a tool call. */
export function officeHooks() {
  const hook = (ev: string) => ({
    type: "command", command: `node "\${CLAUDE_PROJECT_DIR}/${HOOK_FILE}"`, ...(OFFICE_SYNC.has(ev) ? {} : { async: true }),
  });
  return Object.fromEntries(OFFICE_EVENTS.map((ev) => [ev, [ev.includes("Tool") ? { matcher: "*", hooks: [hook(ev)] } : { hooks: [hook(ev)] }]]));
}

/** .claude/settings.json: office hooks plus the company's plugin marketplaces. */
function projectSettings(cfg: Config): string {
  const settings: Record<string, unknown> = { hooks: officeHooks() };
  if (cfg.plugins.enable.length) {
    settings.extraKnownMarketplaces = Object.fromEntries(Object.entries(cfg.plugins.marketplaces).map(([k, v]) => [k, { source: v }]));
    settings.enabledPlugins = Object.fromEntries(cfg.plugins.enable.map((p) => [p, true]));
  }
  return JSON.stringify(settings, null, 2) + "\n";
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)]));
const posix = (p: string) => p.split(sep).join("/");

export function plan(cfg: Config) {
  const ctx = render.context(cfg);
  const gen: Record<string, string> = {
    "CLAUDE.md": render.claudeMd(cfg, ctx),
    "company/operating-rules.md": render.operatingRules(cfg, ctx),
    "company/charter.md": render.charter(cfg, ctx),
    "company/org-chart.md": render.orgChart(cfg, ctx),
    "handoffs/TEMPLATE.md": render.GEN_NOTE + "\n" + readFileSync(join(LIB, "handoff-template.md"), "utf8"),
  };
  for (const role of cfg.roles) gen[`.claude/agents/${role.id}.md`] = render.agent(role, cfg, ctx);
  for (const name of cfg.workflows.use) gen[`.claude/commands/${name}.md`] = render.sub(readFileSync(find("workflows", name, cfg.dir)!, "utf8"), ctx);
  for (const name of new Set(cfg.roles.flatMap((r) => r.skills))) {
    const src = dirname(find("skills", name, cfg.dir)!);
    for (const f of walk(src)) gen[`.claude/skills/${name}/${posix(relative(src, f))}`] = readFileSync(f, "utf8");
  }
  gen[HOOK_FILE] = readFileSync(join(DIST, "hook", "office-event.js"), "utf8");
  gen[".claude/settings.json"] = projectSettings(cfg);
  if (cfg.taskboard.enabled && cfg.taskboard.mcp)
    gen[".mcp.json"] = JSON.stringify({ mcpServers: { taskboard: { type: "stdio", command: cfg.taskboard.command, args: ["mcp"] } } }, null, 2) + "\n";
  const once: Record<string, string> = Object.fromEntries(Object.entries(ONCE_FILES).filter(([k]) => k !== "company/board.md" || !cfg.taskboard.enabled));
  once["company/goals.md"] = render.goals(cfg);
  const dirs = [...new Set([...cfg.roles.flatMap((r) => r.owns.filter((p) => p.endsWith("/"))), "handoffs/"])].sort();
  return { gen, once, dirs };
}

/** Is `cmd` runnable? (`<cmd> <probe>` exits 0; Taskboard has no --version, so it is probed with --help) */
export const hasCommand = (cmd: string, probe = "--version") => spawnSync(cmd, [probe], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;

export function build(companyDir: string, { dryRun = false, force = false, say = console.log as Say } = {}) {
  const cfg = loadCompany(companyDir);
  const { gen, once, dirs } = plan(cfg);
  const manifestPath = join(companyDir, MANIFEST);
  const old = new Set<string>(existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : []);
  const log: Record<string, string[]> = { write: [], unchanged: [], create: [], "skip-user-file": [], "remove-stale": [], mkdir: [] };
  const write = (rel: string, content: string) => {
    if (dryRun) return;
    mkdirSync(dirname(join(companyDir, rel)), { recursive: true });
    writeFileSync(join(companyDir, rel), content);
  };

  for (const [rel, content] of Object.entries(gen)) {
    const p = join(companyDir, rel);
    if (existsSync(p) && !old.has(rel) && !force) { log["skip-user-file"].push(rel); continue; }
    if (existsSync(p) && readFileSync(p, "utf8") === content) { log.unchanged.push(rel); continue; }
    log.write.push(rel); write(rel, content);
  }
  for (const [rel, content] of Object.entries(once))
    if (!existsSync(join(companyDir, rel))) { log.create.push(rel); write(rel, content); }
  for (const rel of [...old].filter((r) => !(r in gen)).sort())
    if (existsSync(join(companyDir, rel))) { log["remove-stale"].push(rel); if (!dryRun) unlinkSync(join(companyDir, rel)); }
  for (const d of dirs)
    if (!existsSync(join(companyDir, d))) { log.mkdir.push(d); if (!dryRun) { mkdirSync(join(companyDir, d), { recursive: true }); writeFileSync(join(companyDir, d, ".gitkeep"), ""); } }
  if (!dryRun) writeFileSync(manifestPath, JSON.stringify(Object.keys(gen).filter((r) => !log["skip-user-file"].includes(r)).sort(), null, 1) + "\n");

  const skills = new Set(cfg.roles.flatMap((r) => r.skills)).size;
  say(`${dryRun ? "[dry run] " : ""}${cfg.company.name}: ${cfg.roles.length} roles, ${skills} skills, ${cfg.workflows.use.length} workflows`);
  for (const [action, items] of Object.entries(log)) if (items.length && action !== "unchanged") say(`  ${action}: ${items.join(", ")}`);
  if (log["skip-user-file"].length) say("  (skipped files exist but were not generated by the factory; rerun with --force to overwrite)");
  if (log["skip-user-file"].includes(".mcp.json")) say(`  taskboard: your own .mcp.json was kept; make sure it has a \`taskboard\` server (${cfg.taskboard.command} mcp).`);
  if (log["skip-user-file"].includes(".claude/settings.json"))
    say(`  office: your own .claude/settings.json was kept, so live events are off. Merge the hooks from \`${CMD} office-hooks\` into it.`);
  if (cfg.taskboard.enabled && !dryRun && !hasCommand(cfg.taskboard.command, "--help"))
    say(`  taskboard: \`${cfg.taskboard.command}\` is not installed. Install it (brew install tcarac/taskboard/taskboard), run \`taskboard start\`, ` +
      "then /setup-board in Claude Code. Or set [taskboard] enabled = false to use company/board.md.");
  if (cfg.plugins.enable.length && !dryRun)
    say(`  plugins: ${cfg.plugins.enable.length} marketplace plugins declared; install them once with \`${CMD} plugins ${companyDir} --install\``);
  return { cfg, log };
}

/** Claude Code does not auto-install plugins a project enables; this installs (or prints) them. */
export function plugins(companyDir: string, install = false, say: Say = console.log) {
  const cfg = loadCompany(companyDir);
  const cmds = [
    ...Object.values(cfg.plugins.marketplaces).map((s) =>
      ["claude", "plugin", "marketplace", "add", "repo" in s ? s.repo : "url" in s ? s.url : s.path, "--scope", "project"]),
    ...cfg.plugins.enable.map((p) => ["claude", "plugin", "install", p, "--scope", "project"]),
  ];
  for (const c of cmds) {
    say("$ " + c.join(" "));
    if (install && spawnSync(c[0], c.slice(1), { cwd: companyDir, stdio: "inherit", shell: process.platform === "win32" }).status !== 0)
      throw new ConfigError(`\`${c.join(" ")}\` failed; fix it and rerun`);
  }
  if (!install) say(`(run \`${CMD} plugins ${companyDir} --install\` to do this, then /reload-plugins in Claude Code)`);
}

/** Check every prerequisite for a company, or for company-factory in general when no dir is given. */
export async function doctor(companyDir: string | undefined, say: Say = console.log): Promise<boolean> {
  let ok = true;
  const check = (pass: boolean, label: string, fix: string) => { say(`${pass ? "✓" : "✗"} ${label}${pass ? "" : `\n    → ${fix}`}`); ok &&= pass; };
  const major = Number(process.versions.node.split(".")[0]);
  check(major >= 20, `Node ${process.versions.node}`, "install Node 20 or newer");
  check(hasCommand("claude"), "Claude Code (`claude`)", "install Claude Code: https://docs.claude.com/en/docs/claude-code");
  if (!companyDir) return ok;
  let cfg: Config;
  try { cfg = loadCompany(companyDir); check(true, `company.toml (${cfg.company.name}, ${cfg.roles.length} roles)`, ""); }
  catch (e) { check(false, "company.toml", (e as Error).message); return false; }
  check(existsSync(join(companyDir, MANIFEST)), "workspace built", `${CMD} build ${companyDir}`);
  check(read(join(companyDir, ".claude", "settings.json")).includes("office-event"), "office hooks in .claude/settings.json", `${CMD} build ${companyDir} (or merge \`${CMD} office-hooks\`)`);
  if (cfg.taskboard.enabled) {
    check(hasCommand(cfg.taskboard.command, "--help"), `Taskboard (\`${cfg.taskboard.command}\`)`, "brew tap tcarac/taskboard && brew install taskboard (or set [taskboard] enabled = false)");
    let up = false;
    try { up = (await fetch(cfg.office.taskboard_url + "/api/projects", { signal: AbortSignal.timeout(2000) })).ok; } catch { /* not running */ }
    check(up, `Taskboard server at ${cfg.office.taskboard_url}`, "taskboard start");
    if (up) check(existsSync(join(companyDir, "company", "board-ids.md")), "Taskboard project set up", "run /setup-board in Claude Code");
  }
  if (cfg.plugins.enable.length) {
    const listed = spawnSync("claude", ["plugin", "list"], { cwd: companyDir, encoding: "utf8", shell: process.platform === "win32" }).stdout ?? "";
    const missing = cfg.plugins.enable.filter((p) => !listed.includes(p));
    check(!missing.length, `marketplace plugins (${cfg.plugins.enable.length})`, `${CMD} plugins ${companyDir} --install   (missing: ${missing.join(", ")})`);
  }
  return ok;
}

/** name -> one-line description (the first `# name: description` comment of its company.toml). */
export function examples(): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of readdirSync(EXAMPLES).sort()) {
    const toml = join(EXAMPLES, d, "company.toml");
    if (!existsSync(toml)) continue;
    const first = readFileSync(toml, "utf8").split("\n")[0];
    out.set(d, first.startsWith("#") ? first.slice(first.indexOf(":") + 1).trim() : "");
  }
  return out;
}

export function init(companyDir: string, example: string, say: Say = console.log) {
  const src = join(EXAMPLES, example);
  if (!existsSync(join(src, "company.toml"))) throw new ConfigError(`no example \`${example}\`; choose from: ${[...examples().keys()].join(", ")}`);
  mkdirSync(companyDir, { recursive: true });
  const copied: string[] = [];
  for (const f of walk(src)) {
    let rel = relative(src, f);
    if (rel.split(sep)[0] === "seed") rel = rel.split(sep).slice(1).join(sep);
    const dst = join(companyDir, rel);
    if (existsSync(dst)) continue;
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(f, dst);
    copied.push(posix(rel));
  }
  say(`init ${companyDir} from \`${example}\`: ${copied.join(", ") || "nothing new (all files exist)"}`);
  say(`next: edit ${join(companyDir, "company.toml")}, then \`${CMD} build ${companyDir}\``);
}
