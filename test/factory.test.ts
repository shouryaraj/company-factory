import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadCompany } from "../src/config.js";
import { build, examples, init } from "../src/build.js";
import { EventLog, seedDemo, snapshot } from "../src/office.js";
import { sub } from "../src/render.js";

const quiet = () => {};
const HOOK = join(__dirname, "..", "dist", "hook", "office-event.js");

function company(extra = "", example = "starter") {
  const dir = mkdtempSync(join(tmpdir(), "cf-test-"));
  init(dir, example, quiet);
  const toml = join(dir, "company.toml");
  // tests run offline: the examples ship with Taskboard on
  writeFileSync(toml, readFileSync(toml, "utf8").replace(/^enabled = true/m, "enabled = false"));
  if (extra) appendFileSync(toml, "\n" + extra);
  return dir;
}
const edit = (dir: string, f: (s: string) => string) => writeFileSync(join(dir, "company.toml"), f(readFileSync(join(dir, "company.toml"), "utf8")));
const errorOf = (dir: string) => { try { loadCompany(dir); } catch (e) { if (e instanceof ConfigError) return e.message; throw e; } return ""; };

describe("office config", () => {
  it("defaults rooms to role departments", () => {
    const cfg = loadCompany(company());
    const rooms = new Map(cfg.office.rooms.map((r) => [r.id, r.roles]));
    for (const role of cfg.roles) expect(rooms.get(role.room)).toContain(role.id);
    expect(cfg.office.port).toBe(4477);
  });

  it("keeps looks stable and lets you override them", () => {
    const dir = company();
    const looks = () => Object.fromEntries(loadCompany(dir).roles.map((r) => [r.id, r.look]));
    const before = looks();
    expect(looks()).toEqual(before);
    edit(dir, (s) => s.replace('use = "engineer"', 'use = "engineer"\nlook = { shirt = "#112233", accessory = "headset" }'));
    const eng = loadCompany(dir).roles.find((r) => r.id === "engineer")!;
    expect([eng.look.shirt, eng.look.accessory]).toEqual(["#112233", "headset"]);
    expect(eng.look.hair).toBe(before.engineer.hair);
  });

  it("reports every bad office setting at once", () => {
    const msg = errorOf(company('[office]\ntheme = "dusk"\n[[office.rooms]]\nid = "lab"\nroles = ["nobody"]\nfloor = "red"\n'));
    for (const needle of ["theme `dusk`", "unknown role `nobody`", "floor `red`"]) expect(msg).toContain(needle);
  });

  it("puts roles you did not place on the open floor", () => {
    const cfg = loadCompany(company('[[office.rooms]]\nid = "lab"\nroles = ["engineer"]\n'));
    expect(cfg.office.rooms.map((r) => r.id)).toEqual(["lab", "floor"]);
  });
});

describe("build", () => {
  it("writes the office hooks and keeps a settings file it did not create", () => {
    const dir = company();
    build(dir, { say: quiet });
    const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.PreToolUse[0].hooks[0].async).toBe(true);
    expect(settings.hooks.Stop[0].hooks[0].async).toBeUndefined();  // must survive `claude -p` exiting
    expect(existsSync(join(dir, ".claude/hooks/office-event.mjs"))).toBe(true);
    expect(readFileSync(join(dir, ".office/.gitignore"), "utf8").trim().split("\n").at(-1)).toBe("*");

    const mine = company();
    mkdirSync(join(mine, ".claude"));
    writeFileSync(join(mine, ".claude/settings.json"), '{"mine": true}');
    const said: string[] = [];
    build(mine, { say: (l) => said.push(l) });
    expect(readFileSync(join(mine, ".claude/settings.json"), "utf8")).toBe('{"mine": true}');
    expect(said.join("\n")).toContain("office-hooks");
  });

  it("registers the Taskboard MCP server only when Taskboard is enabled", () => {
    const dir = company();
    build(dir, { say: quiet });
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
    edit(dir, (s) => s.replace("enabled = false", "enabled = true"));
    const said: string[] = [];
    build(dir, { say: (l) => said.push(l) });
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers.taskboard;
    expect([mcp.command, mcp.args]).toEqual(["taskboard", ["mcp"]]);
    edit(dir, (s) => s.replace('[taskboard]', '[taskboard]\ncommand = "definitely-not-installed-taskboard"'));
    said.length = 0;
    build(dir, { say: (l) => said.push(l) });
    expect(said.join("\n")).toContain("is not installed");
  });

  it("is idempotent and removes files for roles that were dropped", () => {
    const dir = company();
    build(dir, { say: quiet });
    const again = build(dir, { say: quiet });
    expect(again.log.write).toEqual([]);
    edit(dir, (s) => s.replace('[[roles]]\nuse = "qa-engineer"\n', ""));
    const dropped = build(dir, { say: quiet });
    expect(dropped.log["remove-stale"]).toContain(".claude/agents/qa-engineer.md");
  });
});

describe("plugins", () => {
  it("declares the default marketplace plugins in settings and agents", () => {
    const dir = company();
    build(dir, { say: quiet });
    const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
    expect(settings.extraKnownMarketplaces["anthropic-agent-skills"].source).toEqual({ source: "github", repo: "anthropics/skills" });
    expect(settings.enabledPlugins["document-skills@anthropic-agent-skills"]).toBe(true);
    const agent = readFileSync(join(dir, ".claude/agents/engineer.md"), "utf8");
    expect(agent).toContain("skills: code-change, debugging");
    expect(agent).toContain("example-skills:webapp-testing");
  });

  it("can be turned off, and validates plugin skills", () => {
    expect(errorOf(company("[plugins]\nenable = []\n"))).toContain("plugin skill `example-skills:webapp-testing`");
    const dir = company("[plugins]\nenable = []\n");
    edit(dir, (s) => s.replace(/(use = "(engineer|product-manager|qa-engineer|growth-marketer)")/g, "$1\nplugin_skills = []"));
    build(dir, { say: quiet });
    expect(JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8")).enabledPlugins).toBeUndefined();
  });
});

describe("examples", () => {
  it.each([...examples().keys()])("%s builds", (name) => {
    const dir = company("", name);
    build(dir, { say: quiet });
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(true);
  });

  it("demo seeding fills the board, inbox and shelf", async () => {
    const dir = company("", "saas");
    build(dir, { say: quiet });
    const cfg = loadCompany(dir);
    seedDemo(cfg);
    const s = await snapshot(cfg);
    expect(s.tickets.length).toBeGreaterThanOrEqual(8);
    expect(s.approvals).toHaveLength(2);
    expect(s.handoffs.length).toBeGreaterThan(0);
  });
});

describe("hook", () => {
  const run = (dir: string, payload: string) =>
    spawnSync(process.execPath, [HOOK], { input: payload, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });

  it("records small, redacted events", () => {
    const dir = mkdtempSync(join(tmpdir(), "cf-hook-"));
    run(dir, JSON.stringify({ hook_event_name: "PreToolUse", agent_type: "engineer", tool_name: "Write",
      tool_input: { file_path: join(dir, "app", "x.py"), content: "SECRET" } }));
    run(dir, JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Agent",
      tool_input: { subagent_type: "qa-engineer", description: "test it", prompt: "SECRET" } }));
    run(dir, "garbage");
    const lines = readFileSync(join(dir, ".office/events.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.join("")).not.toContain("SECRET");
    const [first, second] = lines.map((l) => JSON.parse(l));
    expect([first.agent, first.label]).toEqual(["engineer", "app/x.py"]);
    expect([second.sub, second.label]).toEqual(["qa-engineer", "test it"]);
  });
});

describe("snapshot", () => {
  it("reads the board, approvals and handoffs", async () => {
    const dir = company();
    build(dir, { say: quiet });
    const cfg = loadCompany(dir), p = cfg.taskboard.prefix;
    appendFileSync(join(dir, "company/board.md"), `| ${p}-1 | in_progress | engineer | Build it | tests pass |\n`);
    const approvals = join(dir, "company/approvals.md");
    writeFileSync(approvals, readFileSync(approvals, "utf8").replace("## Decided", "- [ ] A-001 (engineer, 2026-11-21): Push to GitHub | why | risk | rec\n\n## Decided"));
    writeFileSync(join(dir, "handoffs", `${p}-1-engineer.md`), "done");
    const s = await snapshot(cfg);
    expect(s.tickets).toEqual([{ key: `${p}-1`, lane: "in_progress", role: "engineer", title: "Build it" }]);
    expect(s.approvals).toEqual([{ id: "A-001", role: "engineer", title: "Push to GitHub" }]);
    expect(s.handoffs[0].role).toBe("engineer");
    expect(s.people.slice(0, 2).map((x) => x.id)).toEqual(["founder", "chief"]);
  });

  it("tails the event log across truncation", () => {
    const path = join(mkdtempSync(join(tmpdir(), "cf-log-")), "e.jsonl");
    writeFileSync(path, '{"a": 1}\n{"a": 2}\n{"a"');
    const log = new EventLog(path);
    const [events, offset] = log.since(0);
    expect(events).toEqual([{ a: 1 }, { a: 2 }]);
    writeFileSync(path, '{"a": 3}\n');
    expect(log.since(offset)[0]).toEqual([{ a: 3 }]);
  });
});

describe("templates", () => {
  it("substitutes like Python's Template.safe_substitute", () => {
    expect(sub("$company ${founder} $ARGUMENTS $$5", { company: "Acme", founder: "Ana" })).toBe("Acme Ana $ARGUMENTS $5");
  });
});
