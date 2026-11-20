// The office server: a live pixel view of a company built by company-factory.
//
// Read-only by design: it serves the page, a state snapshot and a stream of hook events. Nothing on the page
// can run commands or change files. It binds to 127.0.0.1 and rejects foreign Host headers, so other sites
// cannot read it through DNS rebinding.
//
// Sources (all optional, re-read on every snapshot):
//   company.toml            rooms, people, looks
//   .office/events.jsonl    Claude Code hook events (written by .claude/hooks/office-event.mjs)
//   Taskboard REST API      tickets per lane and owner, when [taskboard] enabled
//   company/board.md        tickets, when Taskboard is off
//   company/approvals.md    pending approvals (the founder's inbox)
//   handoffs/*.md           finished tickets (the handoff shelf)
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { DIST, read } from "./paths.js";
import { loadCompany, type Config } from "./config.js";

export interface Ticket { key: string; lane: string; role: string; title: string; priority?: string; blocked?: boolean }
type Event = Record<string, unknown>;

const STATIC: Record<string, [string, string]> = {  // an allow-list, not a static folder
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/office.css": ["office.css", "text/css"],
};
const MAX_EVENTS = 200;

export function pendingApprovals(companyDir: string) {
  const text = read(join(companyDir, "company", "approvals.md"));
  const pending = text.includes("## Pending") ? text.split("## Pending")[1].split("## Decided")[0] : "";
  return [...pending.matchAll(/^- \[ \] (A-\d+) \(([^,)]+)[^)]*\):\s*(.+)$/gm)]
    .map((m) => ({ id: m[1], role: m[2].trim(), title: m[3].split("|")[0].trim().slice(0, 160) }));
}

export function handoffs(companyDir: string, limit = 12) {
  const dir = join(companyDir, "handoffs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "TEMPLATE.md")
    .map((f) => ({ f, at: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.at - a.at).slice(0, limit)
    .map(({ f, at }) => {
      const m = f.replace(/\.md$/, "").match(/^([A-Z][A-Z0-9]*-\d+)-(.+)$/);
      return { file: f, ticket: m?.[1] ?? "", role: m?.[2] ?? "", at: Math.floor(at / 1000) };
    });
}

export function boardFileTickets(companyDir: string): Ticket[] {
  return read(join(companyDir, "company", "board.md")).split("\n").flatMap((line) => {
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    return cells.length >= 4 && /^[A-Z][A-Z0-9]*-\d+$/.test(cells[0]) ? [{ key: cells[0], lane: cells[1], role: cells[2], title: cells[3] }] : [];
  });
}

const owner = (description = "") => description.match(/\bOwner:\s*([a-z][a-z0-9-]*)/)?.[1] ?? "";

/** Tickets of this company's Taskboard project, or an error to show in the office. */
export async function taskboardTickets(cfg: Config): Promise<[Ticket[], string | null]> {
  const tb = cfg.taskboard, base = cfg.office.taskboard_url.replace(/\/$/, "");
  // Agent ids written by /setup-board, so tickets map to roles even if agents were renamed.
  const agentRole = new Map([...read(join(cfg.dir, "company", "board-ids.md")).matchAll(/^\|\s*([a-z][a-z0-9-]*)\s*\|\s*`([^`]+)`/gm)].map((m) => [m[2], m[1]]));
  const get = async (path: string) => (await fetch(base + path, { signal: AbortSignal.timeout(2000) })).json();
  let raw;
  try {
    const project = (await get("/api/projects")).find((p: { prefix: string; name: string }) => p.prefix === tb.prefix || p.name === tb.project);
    if (!project) return [[], `no Taskboard project \`${tb.project}\` yet (run /setup-board in Claude Code)`];
    raw = await get(`/api/tickets?projectId=${project.id}`);
  } catch (e) {
    return [[], `Taskboard unreachable at ${base}: run \`taskboard start\` (${(e as Error).name})`];
  }
  return [raw.map((t: Record<string, any>) => ({  // eslint-disable-line @typescript-eslint/no-explicit-any
    key: `${t.projectPrefix || tb.prefix}-${t.number}`, lane: t.status ?? "",
    role: agentRole.get(t.agentId ?? "") || t.agent?.name || owner(t.description), title: String(t.title ?? "").slice(0, 140),
    priority: t.priority ?? "", blocked: Boolean(t.blockedBy?.length),
  })), null];
}

export async function snapshot(cfg: Config) {
  const { company: co, office } = cfg;
  const [tickets, boardError] = cfg.taskboard.enabled ? await taskboardTickets(cfg) : [boardFileTickets(cfg.dir), null];
  const people = [
    { id: "founder", title: co.founder_title, kind: "human", room: "founder", look: office.founder_look },
    { id: "chief", title: cfg.orchestrator.title, kind: "orchestrator", room: "hub", look: office.orchestrator_look },
    ...cfg.roles.map((r) => ({ id: r.id, title: r.title, kind: "agent", room: r.room, model: r.model, look: r.look, mission: r.mission })),
  ];
  return {
    office: { title: office.title, subtitle: office.subtitle, theme: office.theme, rooms: office.rooms, board_url: cfg.taskboard.enabled ? office.taskboard_url : null },
    company: { name: co.name, mission: co.mission, prefix: cfg.taskboard.prefix },
    lanes: cfg.taskboard.lanes, people, tickets, board_error: boardError,
    approvals: pendingApprovals(cfg.dir), handoffs: handoffs(cfg.dir),
    goals: cfg.goals.map((g) => g.objective), now: Math.floor(Date.now() / 1000),
  };
}

const DEMO_WORK: Record<string, string[]> = {
  engineer: ["Fix the flaky checkout test", "Add CSV export", "Upgrade the web framework"],
  "tech-lead": ["ADR: queue or cron for imports", "Review the auth refactor"],
  "qa-engineer": ["Regression pass on v1.4", "Write the smoke test suite"],
  "product-manager": ["Spec onboarding v2", "Rank the Q3 roadmap"],
  designer: ["Empty-state illustrations", "Settings page redesign"],
  researcher: ["Map competitor pricing", "Find sources for this week's idea"],
  customer: ["Interview 5 churned users", "Synthesize beta feedback"],
  market: ["Map competitor pricing", "Size the mid-market segment"],
  growth: ["Draft the launch post", "Write the changelog email"],
  sales: ["Research 20 target accounts", "Draft 3 outreach emails"],
  finance: ["Monthly spend report", "Model the pricing change"],
  writer: ["Draft Tuesday's issue", "Script the explainer video"],
  triager: ["Triage 12 new issues", "Reproduce the Windows path bug"],
  docs: ["Rewrite the install guide", "Document the new config flag"],
  release: ["Prepare v2.4 release notes", "Migration guide for v3"],
};

/** Sample board, approvals and handoffs so `company-factory demo` looks like a company mid-week. */
export function seedDemo(cfg: Config) {
  const { prefix, lanes } = cfg.taskboard;
  const rows: string[] = [];
  let n = 0;
  cfg.roles.forEach((role, i) => {
    const work = DEMO_WORK[role.id] ?? Object.entries(DEMO_WORK).find(([k]) => role.id.includes(k))?.[1] ?? [`${role.title}: first task`];
    work.slice(0, 2).forEach((title, j) => {
      n++;
      const lane = (i + j) % 5 === 0 ? lanes.at(-1)! : lanes[(i + j) % 2 ? 1 : 0];
      rows.push(`| ${prefix}-${n} | ${lane} | ${role.id} | ${title} | reviewed by the ${cfg.orchestrator.title} |`);
      if (lane === lanes.at(-1)) writeFileSync(join(cfg.dir, "handoffs", `${prefix}-${n}-${role.id}.md`), `# ${prefix}-${n}: ${title}\n\nDone.\n`);
    });
  });
  const board = join(cfg.dir, "company", "board.md");
  writeFileSync(board, read(board) + rows.join("\n") + "\n");
  const approvals = join(cfg.dir, "company", "approvals.md");
  writeFileSync(approvals, read(approvals).replace("## Decided",
    `- [ ] A-001 (${cfg.roles[0].id}, demo): Publish the launch post | ready | low | approve\n` +
    `- [ ] A-002 (${cfg.roles.at(-1)!.id}, demo): Spend $40/month on an error-tracking plan | needed for beta | low | approve\n\n## Decided`));
}

/** Tails .office/events.jsonl by byte offset; survives truncation by the hook's rotation. */
export class EventLog {
  constructor(readonly path: string) {}

  since(offset: number): [Event[], number] {
    if (!existsSync(this.path)) return [[], 0];
    const size = statSync(this.path).size;
    if (offset > size) offset = 0;
    const buf = Buffer.alloc(size - offset);
    const fd = openSync(this.path, "r");
    try { readSync(fd, buf, 0, buf.length, offset); } finally { closeSync(fd); }
    const end = buf.lastIndexOf(0x0a) + 1;
    const events: Event[] = [];
    for (const line of buf.subarray(0, end).toString("utf8").split("\n")) {
      try { if (line) events.push(JSON.parse(line)); } catch { /* a torn or foreign line */ }
    }
    return [events, offset + end];
  }

  tail(n = MAX_EVENTS): [Event[], number] {
    const [events, end] = this.since(0);
    return [events.slice(-n), end];
  }
}

function openBrowser(url: string) {
  const [cmd, ...args] = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

export function serve(companyDir: string, { port, open = false, demo = false }: { port?: number; open?: boolean; demo?: boolean } = {}) {
  let cfg = loadCompany(companyDir);
  port ??= cfg.office.port;
  const log = new EventLog(join(companyDir, cfg.office.events));
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

  const state = async () => {
    let configError: string | null = null;
    try { cfg = loadCompany(companyDir); }  // pick up company.toml edits without a restart
    catch (e) { configError = (e as Error).message; }  // keep the last good office on screen
    return { ...(await snapshot(cfg)), config_error: configError };
  };
  const send = (res: ServerResponse, code: number, body: string | Buffer, type: string) => {
    res.writeHead(code, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(body);
  };

  const server = createServer(async (req, res) => {
    if (req.method !== "GET" || !allowedHosts.has(req.headers.host ?? "")) return send(res, 403, "forbidden", "text/plain");
    const url = new URL(req.url ?? "/", "http://office");
    const file = STATIC[url.pathname];
    if (file) return send(res, 200, readFileSync(join(DIST, "web", file[0])), file[1]);
    if (url.pathname === "/api/state") {
      const [events, offset] = log.tail();
      return send(res, 200, JSON.stringify({ ...(await state()), events, offset }), "application/json");
    }
    if (url.pathname === "/api/stream") {
      // Server-sent events: `hook` per hook event, `state` every few seconds.
      let offset = Number(url.searchParams.get("offset") ?? log.tail()[1]), lastState = 0, busy = false;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
      const timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        const [events, next] = log.since(offset);
        offset = next;
        for (const e of events) res.write(`event: hook\ndata: ${JSON.stringify(e)}\n\n`);
        if (Date.now() - lastState > cfg.office.refresh_seconds * 1000) {
          lastState = Date.now();
          res.write(`event: state\ndata: ${JSON.stringify(await state())}\n\n`);
        }
        res.write(": ping\n\n");
        busy = false;
      }, 400);
      req.on("close", () => clearInterval(timer));
      return;
    }
    send(res, 404, "not found", "text/plain");
  });

  return new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}${demo ? "/?demo" : ""}`;
      console.log(`${cfg.office.title} is open at ${url}  (Ctrl+C to close)`);
      console.log(`  events: ${log.path}`);
      if (open) openBrowser(url);
      process.on("SIGINT", () => { console.log("\noffice closed"); process.exit(0); });
      resolve();
    });
  });
}
