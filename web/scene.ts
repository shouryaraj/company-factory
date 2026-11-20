// The office scene: a <canvas> drawn entirely in code (no sprite files).
// Owns layout, people, movement and drawing. app.ts (Preact) owns everything around it and talks to it through `scene`.
import type { FeedItem, HookEvent, Look, PersonInfo, Pt, Snapshot, Theme } from "./types.js";

interface LRoom {
  id: string; title: string; kind: "founder" | "hub" | "lounge" | "dept"; x: number; y: number; w: number; h: number;
  row: number; door: "top" | "bottom"; roles?: string[]; floor?: string; cols?: number; doorX: number; corridorY: number; doorIn: Pt;
}
interface Desk extends Pt { room: string; seat: Pt; big?: boolean }
type Spot = "inbox" | "visitChief" | "shelf" | "table" | "coffee" | "couch" | "cooler";
interface Layout {
  rooms: LRoom[]; W: number; H: number; desks: Record<string, Desk>; spots: Record<Spot, Pt>;
  corridors: number[]; meeting: Pt[]; roomOf: (pt: Pt) => LRoom | undefined;
}
interface Step { to?: Pt; wait?: number; fn?: (p: Person) => unknown }
interface Box { x: number; y: number; w: number; h: number }
type Effect = { kind: "paper"; from: Pt; to: Pt; t0: number; dur: number }
  | { kind: "spark" | "ring"; at: Pt; t0: number; dur: number };
// ---------- constants ----------
const TILE = 16, SPEED = 46, CORRIDOR = 34, GAP = 10, MARGIN = 26;
const DESK_W = 44, DESK_H = 42;
const HUMAN_TOOL: Record<string, string> = {
  Read: "reading", Edit: "editing", Write: "writing", MultiEdit: "editing", Bash: "running", Grep: "searching",
  Glob: "looking for", WebSearch: "googling", WebFetch: "reading the web", NotebookEdit: "editing notebook",
  Agent: "delegating", Task: "delegating", TodoWrite: "planning", Skill: "using a skill",
};
const ROOM_FLOORS = ["#d9c7a7", "#b9cbd9", "#c9d8b6", "#e0c3c3", "#d4c8e2", "#c8d6d3", "#e3d5b0"];

let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D = null!;
let S = 2;                       // css px per logical px
let state: Snapshot = null!, layout: Layout = null!, people = new Map<string, Person>(), effects: Effect[] = [], feed: FeedItem[] = [];
let themeMode: Theme = "auto", hoverId: string | null = null, hotRole: string | null = null, lastFrame = performance.now(), clock = 0;

// ---------- utils ----------
const clip = (s: unknown, n: number) => { const t = String(s || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("");
}
function rand(seed: string) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) | 0; return () => ((x = (x * 1103515245 + 12345) | 0) >>> 8) / 16777216; }
const isNight = () => themeMode === "night" || (themeMode === "auto" && ((h) => h < 7 || h >= 19)(new Date().getHours()));
function px(x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
const personById = (id: string) => people.get(id);
const roleColor = (id: string) => personById(id)?.look.shirt || "#999";

// ---------- layout: rooms placed from config ----------
function buildLayout(st: Snapshot): Layout {
  const rooms: LRoom[] = [];
  const fixed = [
    { id: "founder", title: st.people[0].title + "'s office", w: 128, kind: "founder" as const },
    { id: "hub", title: "HQ · " + (st.people[1].title), w: 250, kind: "hub" as const },
    { id: "lounge", title: "Lounge", w: 112, kind: "lounge" as const },
  ];
  const H1 = 140;
  let x = MARGIN;
  for (const f of fixed) { rooms.push({ ...f, x, y: 8, h: H1, row: 0, door: "bottom", doorX: 0, corridorY: 0, doorIn: { x: 0, y: 0 } }); x += f.w + GAP; }
  const totalW = x - GAP;
  // department rooms flow under the top row
  let rowY = 8 + H1 + CORRIDOR, rowX = MARGIN, row = 1, rowRooms: LRoom[] = [];
  const flush = () => { const h = Math.max(...rowRooms.map((r) => r.h)); rowRooms.forEach((r) => (r.h = h)); rowY += h + CORRIDOR; rowX = MARGIN; row++; rowRooms = []; };
  st.office.rooms.forEach((cfgRoom, i) => {
    const n = Math.max(1, cfgRoom.roles.length), cols = Math.min(n, 3), rows = Math.ceil(n / 3);
    const w = Math.max(120, 20 + cols * DESK_W + 8), h = 44 + rows * DESK_H + 14;
    if (rowX + w > MARGIN + totalW && rowRooms.length) flush();
    const r: LRoom = { id: cfgRoom.id, title: cfgRoom.title, kind: "dept", roles: cfgRoom.roles, x: rowX, y: rowY, w, h, row, door: "top",
      floor: cfgRoom.floor || ROOM_FLOORS[i % ROOM_FLOORS.length], cols, doorX: 0, corridorY: 0, doorIn: { x: 0, y: 0 } };
    rooms.push(r); rowRooms.push(r); rowX += w + GAP;
  });
  if (rowRooms.length) flush();
  // stretch each department row to the full width so the floor looks finished
  const byRow: Record<number, LRoom[]> = {};
  rooms.filter((r) => r.kind === "dept").forEach((r) => (byRow[r.row] ||= []).push(r));
  Object.values(byRow).forEach((rs) => { const last = rs[rs.length - 1], extra = MARGIN + totalW - (last.x + last.w); const each = Math.floor(extra / rs.length);
    rs.forEach((r, i) => { r.x += each * i; r.w += each; }); });

  const lay: Layout = { rooms, W: MARGIN + totalW + 8, H: rowY - CORRIDOR + 10, desks: {}, spots: {} as Layout["spots"], corridors: [], meeting: [], roomOf: () => undefined };
  for (let k = 1; k < row; k++) lay.corridors.push(rooms.find((r) => r.row === k)!.y - CORRIDOR / 2);
  if (!lay.corridors.length) lay.corridors.push(8 + H1 + CORRIDOR / 2);
  lay.H = Math.max(lay.H, 8 + H1 + CORRIDOR);

  for (const r of rooms) {
    r.doorX = r.x + Math.round(r.w / 2);
    r.corridorY = r.door === "bottom" ? lay.corridors[0] : lay.corridors[r.row - 1];
    r.doorIn = { x: r.doorX, y: r.door === "bottom" ? r.y + r.h - 10 : r.y + 34 };
    if (r.kind === "dept") {
      const inner = r.w - 16, cols = r.cols!, step = inner / cols;
      r.roles!.forEach((id, i) => {
        const cx = r.x + 8 + step * (i % cols) + step / 2, cy = r.y + 44 + Math.floor(i / cols) * DESK_H;
        lay.desks[id] = { x: Math.round(cx - 18), y: Math.round(cy + 10), room: r.id, seat: { x: Math.round(cx + 4), y: Math.round(cy + 12) } };
      });
    }
  }
  const F = rooms[0], H = rooms[1], L = rooms[2];
  lay.desks.founder = { x: F.x + 32, y: F.y + 66, room: "founder", seat: { x: F.x + 56, y: F.y + 68 }, big: true };
  lay.desks.chief = { x: H.x + 22, y: H.y + 80, room: "hub", seat: { x: H.x + 46, y: H.y + 82 }, big: true };
  lay.spots = {
    inbox: { x: F.x + 90, y: F.y + 70 },
    visitChief: { x: H.x + 74, y: H.y + 100 },
    shelf: { x: H.x + H.w - 30, y: H.y + 100 },
    table: { x: H.x + 140, y: H.y + 96 },
    coffee: { x: L.x + 28, y: L.y + 76 }, couch: { x: L.x + 74, y: L.y + 112 }, cooler: { x: L.x + 90, y: L.y + 62 },
  };
  lay.meeting = [-1, 0, 1].flatMap((dx) => [{ x: H.x + 140 + dx * 18, y: H.y + 80 }, { x: H.x + 140 + dx * 18, y: H.y + 122 }]);
  lay.roomOf = (pt: Pt) => rooms.find((r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h);
  return lay;
}

// path between two points through doors, corridors and the left spine
function route(a: Pt, b: Pt): Pt[] {
  const ra = layout.roomOf(a), rb = layout.roomOf(b);
  if (!ra || !rb || ra === rb) return [b];
  const pts = [ra.doorIn, { x: ra.doorX, y: ra.corridorY }];
  if (ra.corridorY !== rb.corridorY) pts.push({ x: 12, y: ra.corridorY }, { x: 12, y: rb.corridorY });
  pts.push({ x: rb.doorX, y: rb.corridorY }, rb.doorIn, b);
  return pts;
}

// ---------- people ----------
class Person implements PersonInfo {
  id!: string; title!: string; kind!: PersonInfo["kind"]; look!: Look; room?: string; model?: string; mission?: string;
  home: Pt; x: number; y: number; path: Pt[]; plan: Step[]; waitUntil: number;
  status: "idle" | "working"; activity: string; bubble: { text: string; until: number } | null; lastActive: number;
  nextWander: number; blink: number; facing = 1; leaving = false;
  constructor(p: PersonInfo) {
    Object.assign(this, p);
    const desk = layout.desks[p.id] || { seat: layout.meeting[people.size % 6] };
    this.home = desk.seat; this.x = desk.seat.x; this.y = desk.seat.y;
    this.path = []; this.plan = []; this.waitUntil = 0;
    this.status = "idle"; this.activity = ""; this.bubble = null; this.lastActive = 0;
    this.nextWander = clock + 6 + rand(p.id)() * 20; this.blink = rand(p.id + "b")() * 5;
  }
  get atHome() { return !this.path.length && Math.hypot(this.x - this.home.x, this.y - this.home.y) < 1; }
  go(pt: Pt) { const from = this.path.length ? this.path[this.path.length - 1] : { x: this.x, y: this.y }; this.path.push(...route(from, pt)); }
  say(text: string | undefined, secs = 5) { if (text) this.bubble = { text: clip(text, 34), until: clock + secs }; }
  queue(...steps: Step[]) { this.plan.push(...steps); }
  update(dt: number) {
    if (this.path.length) {
      const t = this.path[0], dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy), step = SPEED * dt;
      if (d <= step) { this.x = t.x; this.y = t.y; this.path.shift(); }
      else { this.x += (dx / d) * step; this.y += (dy / d) * step; this.facing = dx < 0 ? -1 : 1; }
      return;
    }
    if (clock < this.waitUntil) return;
    const next = this.plan.shift();
    if (next) {
      if (next.to) this.go(next.to);
      else if (next.wait) this.waitUntil = clock + next.wait;
      else if (next.fn) next.fn(this);
      return;
    }
    if (this.status === "idle" && clock > this.nextWander && this.kind !== "guest") this.wander();
  }
  wander() {
    const r = rand(this.id + Math.floor(clock))();
    this.nextWander = clock + 18 + r * 30;
    if (clock - this.lastActive < 20) return;
    const sp = layout.spots, room = layout.roomOf(this.home)!;
    const pick = r < 0.35 ? sp.coffee : r < 0.5 ? sp.cooler : r < 0.6 ? sp.couch
      : { x: room.x + 16 + r * (room.w - 32), y: Math.min(room.y + room.h - 14, this.home.y + 14) };
    this.queue({ to: pick }, { wait: 3 + r * 5 }, { fn: (p: Person) => r < 0.35 && p.say("☕", 2) }, { to: this.home });
  }
  get walking() { return this.path.length > 0; }
}

function ensureGuest(type: string): Person {
  const id = "guest:" + type;
  if (!people.has(id)) {
    const p = new Person({ id, title: type, kind: "guest", look: guestLook(type), mission: "Built-in Claude Code subagent." });
    const seat = layout.meeting.find((m) => ![...people.values()].some((q) => q.home === m)) || layout.meeting[0];
    p.home = seat; p.x = layout.spots.visitChief.x; p.y = layout.spots.visitChief.y; p.go(seat);
    people.set(id, p);
  }
  return people.get(id)!;
}
function guestLook(seed: string): Look {
  const r = rand(seed);
  return { shirt: "#8a8f9c", skin: ["#f6d5b8", "#d7a27a", "#8d5a3c"][Math.floor(r() * 3)], hair: "#3a3a3a", hair_style: "short", accessory: "cap" };
}

function syncPeople(st: Snapshot) {
  const ids = new Set(st.people.map((p) => p.id));
  for (const id of [...people.keys()]) if (!id.startsWith("guest:") && !ids.has(id)) people.delete(id);
  for (const p of st.people) {
    const old = people.get(p.id);
    const fresh = new Person(p);
    if (old) Object.assign(fresh, { x: old.x, y: old.y, status: old.status, activity: old.activity, bubble: old.bubble, lastActive: old.lastActive });
    people.set(p.id, fresh);
  }
}

// ---------- hook events -> behaviour ----------
function who(e: HookEvent) { return e.agent ? (people.has(e.agent) ? e.agent : "guest:" + e.agent) : "chief"; }
function describe(e: HookEvent) {
  if (e.tool === "Bash" && e.label) return "$ " + e.label;
  const verb = HUMAN_TOOL[e.tool ?? ""] || (e.tool?.startsWith("mcp__") ? "using " + e.tool.split("__")[1] : (e.tool || "").toLowerCase());
  return (verb + " " + (e.label || "")).trim();
}
function nameOf(id: string) { const p = personById(id); return p ? (p.kind === "guest" ? p.title + " (guest)" : p.title) : id; }

function applyEvent(e: HookEvent, live: boolean) {
  const chief = personById("chief")!, founder = personById("founder")!;
  let line: [string, string] | null = null;
  switch (e.ev) {
    case "UserPromptSubmit": {
      line = [`${founder.title}: “${e.label}”`, "founder"];
      chief.status = "working"; chief.lastActive = clock;
      if (live) {
        founder.lastActive = clock; founder.plan = [];
        founder.queue({ to: layout.spots.visitChief }, { fn: (p) => p.say(e.label, 6) }, { wait: 5 }, { to: founder.home });
        chief.say("on it", 3);
      }
      break;
    }
    case "PreToolUse": {
      const id = who(e);
      if (e.agent && !people.has(e.agent)) ensureGuest(e.agent);
      const p = personById(id); if (!p) break;
      p.status = "working"; p.activity = describe(e); p.lastActive = clock;
      if (e.tool === "Agent" || e.tool === "Task") {
        const sub = e.sub || "general-purpose", target = people.has(sub) ? personById(sub)! : ensureGuest(sub);
        line = [`${nameOf(id)} → ${nameOf(target.id)}: ${e.label}`, target.id];
        target.status = "working"; target.activity = "picked up: " + e.label; target.lastActive = clock;
        if (live) {
          p.say("→ " + target.title, 3);
          effects.push({ kind: "paper", from: { x: p.x, y: p.y - 14 }, to: target.home, t0: clock, dur: 1.1 });
          target.plan = []; if (!target.atHome) target.go(target.home);
          target.queue({ wait: 1.1 }, { fn: (q) => q.say(e.label, 4) });
        }
      } else {
        line = [`${nameOf(id)} · ${describe(e)}`, id];
        if (live) p.say(describe(e), 4);
        if (live && p.status === "working" && !p.atHome && !p.plan.length) { p.path = []; p.go(p.home); }
      }
      break;
    }
    case "PostToolUseFailure": {
      const p = personById(who(e)); if (p && live) p.say("✗ " + describe(e), 4);
      line = [`${nameOf(who(e))} · failed: ${describe(e)}`, who(e)];
      break;
    }
    case "SubagentStart": {
      if (!e.agent) break;
      const p = people.has(e.agent) ? personById(e.agent)! : ensureGuest(e.agent);
      p.status = "working"; p.lastActive = clock;
      if (live && !p.atHome) { p.plan = []; p.path = []; p.go(p.home); }
      break;
    }
    case "SubagentStop": {
      if (!e.agent) break;
      const id = who(e), p = personById(id); if (!p) break;
      p.status = "idle"; p.activity = ""; p.lastActive = clock;
      line = [`${nameOf(id)} handed off${e.label ? ": " + e.label : ""}`, id];
      if (live) {
        p.plan = [];
        p.queue({ fn: (q) => q.say("done ✓", 2) }, { to: layout.spots.shelf }, { wait: 1.2 },
          { fn: (q) => effects.push({ kind: "spark", at: { ...layout.spots.shelf }, t0: clock, dur: 0.8 }) },
          p.kind === "guest" ? { fn: (q) => { q.leaving = true; q.go({ x: layout.rooms[1].doorX, y: layout.rooms[1].corridorY }); } } : { to: p.home });
      } else if (p.kind === "guest") people.delete(id);
      break;
    }
    case "Stop": {
      chief.status = "idle"; chief.activity = ""; chief.lastActive = clock;
      if (live && e.label) chief.say(e.label, 6);
      line = [`${chief.title} is waiting for you`, "chief"];
      break;
    }
    case "Notification": {
      line = [`🔔 ${e.label || "needs your attention"}`, "founder"];
      if (live) { founder.say("🔔 " + (e.label || "needs you"), 8); effects.push({ kind: "ring", at: founder, t0: clock, dur: 2.4 }); }
      break;
    }
    case "SessionStart": line = [`session ${e.label || "started"}`, "chief"]; break;
    case "SessionEnd": {
      for (const [id, p] of people) { if (p.kind === "guest") { if (live) { p.leaving = true; p.go({ x: layout.rooms[1].doorX, y: layout.rooms[1].corridorY }); } else people.delete(id); } else { p.status = "idle"; p.activity = ""; } }
      line = [`session ended${e.label ? " (" + e.label + ")" : ""}`, "chief"];
      break;
    }
  }
  if (line) { feed.unshift({ ts: e.ts, text: line[0], id: line[1] }); feed.length = Math.min(feed.length, 80); }
}

// ---------- drawing ----------
function drawRoom(r: LRoom, night: boolean) {
  const floor = r.kind === "founder" ? "#c9a27a" : r.kind === "hub" ? "#cfc6b4" : r.kind === "lounge" ? "#b7c9a8" : r.floor!;
  px(r.x, r.y, r.w, r.h, shade(floor, -0.35));                               // wall frame
  px(r.x + 3, r.y + 3, r.w - 6, r.h - 6, floor);                             // floor
  for (let yy = r.y + 30; yy < r.y + r.h - 3; yy += 8)                       // planks
    for (let xx = r.x + 3 + ((yy / 8) % 2) * 12; xx < r.x + r.w - 3; xx += 24) px(xx, yy, 1, 8, shade(floor, -0.08));
  px(r.x + 3, r.y + 3, r.w - 6, 27, shade(floor, -0.18));                    // back wall
  px(r.x + 3, r.y + 29, r.w - 6, 2, shade(floor, -0.42));
  for (let wx = r.x + 14; wx < r.x + r.w - 28; wx += 46) {                   // windows
    px(wx, r.y + 7, 22, 15, shade(floor, -0.5));
    px(wx + 2, r.y + 9, 18, 11, night ? "#1d2747" : "#9fd3ef");
    if (night) { px(wx + 5, r.y + 11, 1, 1, "#fff"); px(wx + 14, r.y + 15, 1, 1, "#ffe9a8"); }
    else px(wx + 3, r.y + 10, 5, 2, "#e9f6fc");
    px(wx + 10, r.y + 9, 2, 11, shade(floor, -0.5));
  }
  // door gap
  const dy = r.door === "bottom" ? r.y + r.h - 3 : r.y;
  px(r.doorX - 9, dy, 18, 3, "#8c7b63");
  // name sign
  ctx.font = "bold 7px ui-monospace, Menlo, monospace";
  const tw = Math.ceil(ctx.measureText(r.title).width) + 8;
  px(r.x + r.w - tw - 8, r.y + 8, tw, 11, "#3a3226"); px(r.x + r.w - tw - 7, r.y + 9, tw - 2, 9, "#4b4132");
  ctx.fillStyle = "#f4e7c8"; ctx.fillText(r.title, r.x + r.w - tw - 4, r.y + 16);
}

function drawDesk(d: Desk, owner?: Person) {
  const w = d.big ? 40 : 36, wood = d.big ? "#7a4e2d" : "#a8754a";
  px(d.x, d.y, w, 4, shade(wood, 0.2)); px(d.x, d.y + 4, w, 7, wood);
  px(d.x + 1, d.y + 11, 2, 4, shade(wood, -0.3)); px(d.x + w - 3, d.y + 11, 2, 4, shade(wood, -0.3));
  // monitor
  const mx = d.x + 2, my = d.y - 8, on = owner && owner.status === "working";
  px(mx, my, 12, 9, "#2b2f3a"); px(mx + 1, my + 1, 10, 7, on ? "#7fe0b0" : "#3c4456");
  if (on) for (let i = 0; i < 3; i++) px(mx + 2, my + 2 + i * 2, 3 + ((Math.floor(clock * 6) + i * 3) % 6), 1, "#1f6f4c");
  px(mx + 5, my + 9, 2, 2, "#2b2f3a");
  px(d.x + w - 8, d.y + 1, 5, 2, "#ece6d8");   // papers
  if (d.big) px(d.x + 16, d.y - 3, 3, 4, "#d1495b");  // mug
}

function drawPerson(p: Person) {
  const L = p.look, x = Math.round(p.x), y = Math.round(p.y), walk = p.walking;
  const f = walk ? Math.floor(clock * 8) % 2 : 0, typing = !walk && p.status === "working" && p.atHome;
  ctx.globalAlpha = 0.22; px(x - 5, y - 1, 10, 2, "#000"); ctx.globalAlpha = 1;
  px(x - 3, y - 5, 2, 4 - f, "#353a4c"); px(x + 1, y - 5, 2, 3 + f, "#353a4c");                   // legs
  px(x - 4, y - 11, 8, 7, L.shirt); px(x - 4, y - 5, 8, 1, shade(L.shirt, -0.3));                // body
  const arm = typing ? Math.floor(clock * 10) % 2 : 0;
  px(x - 6, y - 11 + arm, 2, 5, shade(L.shirt, -0.15)); px(x + 4, y - 11 + (typing ? 1 - arm : 0), 2, 5, shade(L.shirt, -0.15));
  px(x - 6, y - 6 + arm, 2, 1, L.skin); px(x + 4, y - 6 + (typing ? 1 - arm : 0), 2, 1, L.skin);
  if (p.kind === "human") px(x - 1, y - 11, 2, 5, "#2b2f3a");                                     // founder's tie
  if (p.kind === "orchestrator") { px(x + 3, y - 10, 4, 5, "#e8dcc0"); px(x + 4, y - 9, 2, 1, "#777"); } // clipboard
  px(x - 4, y - 18, 8, 7, L.skin);                                                               // head
  const blink = ((clock + p.blink) % 5) < 0.12;
  if (!blink) { px(x - 2, y - 15, 1, 2, "#1d1d22"); px(x + 1, y - 15, 1, 2, "#1d1d22"); }
  const H = L.hair;
  switch (L.hair_style) {
    case "short": px(x - 4, y - 19, 8, 3, H); px(x - 4, y - 16, 1, 2, H); px(x + 3, y - 16, 1, 2, H); break;
    case "long": px(x - 5, y - 19, 10, 3, H); px(x - 5, y - 16, 2, 7, H); px(x + 3, y - 16, 2, 7, H); break;
    case "bun": px(x - 4, y - 19, 8, 3, H); px(x - 2, y - 22, 4, 3, H); break;
    case "spiky": px(x - 4, y - 19, 8, 2, H); for (let i = 0; i < 4; i++) px(x - 4 + i * 2, y - 21 + (i % 2), 1, 2, H); break;
    case "bald": px(x - 2, y - 18, 2, 1, shade(L.skin, 0.35)); break;
  }
  switch (L.accessory) {
    case "glasses": px(x - 3, y - 15, 3, 1, "#1d1d22"); px(x + 1, y - 15, 3, 1, "#1d1d22"); px(x, y - 15, 1, 1, "#1d1d22"); break;
    case "headset": px(x - 5, y - 20, 10, 1, "#2b2f3a"); px(x - 5, y - 17, 1, 3, "#2b2f3a"); px(x + 4, y - 17, 1, 3, "#2b2f3a"); px(x + 3, y - 13, 2, 1, "#2b2f3a"); break;
    case "cap": px(x - 4, y - 21, 8, 3, shade(L.shirt, -0.25)); px(p.facing === -1 ? x - 6 : x + 3, y - 19, 3, 1, shade(L.shirt, -0.4)); break;
    case "beanie": px(x - 5, y - 21, 10, 4, shade(L.shirt, 0.2)); px(x - 1, y - 23, 2, 2, shade(L.shirt, 0.4)); break;
  }
  if (p.status === "working" && !p.bubble) px(x + 5, y - 23, 2, 2, "#4f9d69");                   // working light
  if (hoverId === p.id || hotRole === p.id) { ctx.strokeStyle = "#3d85c6"; ctx.lineWidth = 1; ctx.strokeRect(x - 7.5, y - 24.5, 15, 26); }
}

function drawBubble(p: Person, placed: Box[]) {
  if (!p.bubble || clock > p.bubble.until) { p.bubble = null; return; }
  ctx.font = "7px ui-sans-serif, system-ui, sans-serif";
  const text = p.bubble.text, w = Math.ceil(ctx.measureText(text).width) + 8, h = 11;
  let bx = Math.round(p.x - w / 2), by = Math.round(p.y - 37);
  bx = Math.max(2, Math.min(layout.W - w - 2, bx));
  const hits = (q: Box) => bx < q.x + q.w + 2 && q.x < bx + w + 2 && by < q.y + q.h + 2 && q.y < by + h + 2;
  for (let i = 0; i < 4 && placed.some(hits); i++) by -= h + 3;   // stack instead of overlapping a neighbour
  placed.push({ x: bx, y: by, w, h });
  ctx.globalAlpha = Math.min(1, (p.bubble.until - clock) * 2);
  px(bx, by, w, h, "#1f2430"); px(bx + 1, by + 1, w - 2, h - 2, "#fffdf6");
  if (by === Math.round(p.y - 37)) { px(Math.round(p.x) - 1, by + h - 1, 3, 2, "#fffdf6"); px(Math.round(p.x), by + h + 1, 1, 1, "#1f2430"); }
  ctx.fillStyle = "#1f2430"; ctx.fillText(text, bx + 4, by + 8);
  ctx.globalAlpha = 1;
}

function drawFixtures(night: boolean) {
  const [F, H, L] = layout.rooms, st = state;
  // founder: rug, bookshelf, inbox with pending approvals
  px(F.x + 18, F.y + 92, 76, 34, "#8e3b46"); px(F.x + 21, F.y + 95, 70, 28, "#a94f5b");
  px(F.x + 10, F.y + 34, 22, 28, "#6b4a2f"); for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) px(F.x + 12 + j * 5, F.y + 37 + i * 9, 3, 7, ["#3d85c6", "#e07a5f", "#81b29a", "#f2cc8f"][(i + j) % 4]);
  const n = st.approvals.length, ib = layout.spots.inbox;
  px(ib.x - 8, ib.y - 6, 16, 8, "#5a4a3a"); px(ib.x - 7, ib.y - 5, 14, 3, "#ece6d8");
  for (let i = 0; i < Math.min(n, 4); i++) px(ib.x - 6, ib.y - 8 - i * 2, 12, 2, i % 2 ? "#fff" : "#f2e6c9");
  if (n) { const pulse = Math.floor(clock * 2) % 2; px(ib.x + 4, ib.y - 18, 9, 9, pulse ? "#d1495b" : "#b83246");
    ctx.fillStyle = "#fff"; ctx.font = "bold 7px ui-monospace, monospace"; ctx.fillText(String(Math.min(n, 9)), ib.x + 6, ib.y - 11); }
  plant(F.x + F.w - 18, F.y + 50);

  // hub: kanban wall, meeting table, handoff shelf
  const lanes = st.lanes, bw = Math.min(150, lanes.length * 25), bx = H.x + 12, by = H.y + 34;
  px(bx - 2, by - 2, bw + 4, 36, "#5e5240"); px(bx, by, bw, 32, "#f3efe4");
  lanes.forEach((lane, i) => {
    const cx = bx + 2 + i * (bw / lanes.length), ts = st.tickets.filter((t) => t.lane === lane);
    px(cx, by + 2, bw / lanes.length - 3, 2, "#c4b9a2");
    ts.slice(0, 8).forEach((t, k) => px(cx + (k % 2) * 10, by + 6 + Math.floor(k / 2) * 6, 8, 4,
      t.lane === "needs_founder" ? "#d1495b" : (people.get(t.role)?.look.shirt || "#bbb")));
  });
  px(H.x + 116, H.y + 88, 48, 22, "#7a5636"); px(H.x + 116, H.y + 88, 48, 3, "#946a44");          // table
  px(H.x + 128, H.y + 92, 8, 5, "#f2efe6"); px(H.x + 144, H.y + 95, 6, 4, "#f2efe6");
  const sx = H.x + H.w - 42;                                                                        // shelf
  px(sx, H.y + 40, 30, 48, "#6b4a2f");
  for (let s = 0; s < 3; s++) px(sx + 2, H.y + 52 + s * 14, 26, 2, "#4a321f");
  st.handoffs.slice(0, 9).forEach((h, i) => px(sx + 4 + (i % 3) * 8, H.y + 44 + Math.floor(i / 3) * 14, 6, 8, people.get(h.role)?.look.shirt || "#eee"));
  plant(H.x + H.w - 12, H.y + 118);

  // lounge: coffee machine, cooler, couch
  const c = layout.spots.coffee;
  px(c.x - 8, c.y - 22, 18, 20, "#7d8597"); px(c.x - 6, c.y - 20, 14, 6, "#2b2f3a"); px(c.x - 1, c.y - 12, 4, 4, "#f4f1ea");
  px(c.x + 1, c.y - 14 - (Math.floor(clock * 3) % 3), 1, 2, "#ddd");
  const k = layout.spots.cooler; px(k.x - 5, k.y - 24, 10, 10, "#9fd3ef"); px(k.x - 6, k.y - 14, 12, 12, "#e8e8e8");
  const u = layout.spots.couch; px(u.x - 22, u.y - 4, 44, 12, "#3d6b8c"); px(u.x - 22, u.y - 10, 44, 6, "#4b7fa3"); px(u.x - 25, u.y - 8, 4, 16, "#2f5670"); px(u.x + 21, u.y - 8, 4, 16, "#2f5670");
  plant(L.x + L.w - 14, L.y + 48);
  // corridors
  ctx.globalAlpha = night ? 0.4 : 0.25;
  layout.corridors.forEach((cy) => px(8, cy - 1, layout.W - 12, 2, "#9a8f7a"));
  px(11, layout.corridors[0], 2, layout.corridors[layout.corridors.length - 1] - layout.corridors[0] + 1, "#9a8f7a");
  ctx.globalAlpha = 1;
}
function plant(x: number, y: number) { px(x - 4, y - 4, 8, 7, "#9c5b3b"); px(x - 6, y - 12, 4, 8, "#4f9d69"); px(x - 1, y - 16, 4, 12, "#3f8a58"); px(x + 2, y - 11, 4, 6, "#5fb27a"); }

function drawEffects() {
  effects = effects.filter((fx) => clock - fx.t0 < fx.dur);
  for (const fx of effects) {
    const t = (clock - fx.t0) / fx.dur;
    if (fx.kind === "paper") {
      const x = fx.from.x + (fx.to.x - fx.from.x) * t, y = fx.from.y + (fx.to.y - 14 - fx.from.y) * t - Math.sin(t * Math.PI) * 30;
      px(x - 3, y - 2, 6, 4, "#fffdf6"); px(x - 2, y - 1, 4, 1, "#9aa");
    } else if (fx.kind === "spark") {
      for (let i = 0; i < 6; i++) { const a = i * 1.05, r = 4 + t * 12; px(fx.at.x + Math.cos(a) * r, fx.at.y - 20 + Math.sin(a) * r, 2, 2, "#f2cc8f"); }
    } else if (fx.kind === "ring") {
      ctx.strokeStyle = `rgba(209,73,91,${1 - t})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(fx.at.x, fx.at.y - 10, 8 + t * 22, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

function render() {
  const night = isNight();
  ctx.setTransform(S * devicePixelRatio, 0, 0, S * devicePixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  px(0, 0, layout.W, layout.H, night ? "#2a2c36" : "#cfc8b8");
  layout.rooms.forEach((r) => drawRoom(r, night));
  drawFixtures(night);
  // depth-sort desks and people by their base line
  const items: { y: number; draw: () => void }[] = [];
  for (const [id, d] of Object.entries(layout.desks)) items.push({ y: d.y + 11, draw: () => drawDesk(d, people.get(id)) });
  for (const p of people.values()) items.push({ y: p.y, draw: () => drawPerson(p) });
  items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
  if (night) {
    ctx.fillStyle = "rgba(12,16,44,.42)"; ctx.fillRect(0, 0, layout.W, layout.H);
    ctx.globalCompositeOperation = "lighter";
    for (const [id, d] of Object.entries(layout.desks)) {
      const on = people.get(id)?.status === "working", g = ctx.createRadialGradient(d.x + 8, d.y - 4, 1, d.x + 8, d.y - 4, on ? 30 : 16);
      g.addColorStop(0, on ? "rgba(120,230,170,.35)" : "rgba(255,210,130,.18)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(d.x - 20, d.y - 40, 80, 70);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  drawEffects();
  const placed: Box[] = [];
  [...people.values()].sort((a, b) => (b.bubble?.until || 0) - (a.bubble?.until || 0)).forEach((p) => drawBubble(p, placed));
}

function tick(now: number) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now; clock += dt;
  if (layout && ctx) {
    for (const [id, p] of people) { p.update(dt); if (p.leaving && !p.walking) people.delete(id); }
    render();
  }
  requestAnimationFrame(tick);
}

// ---------- public API ----------
let shape = "";
export const clipText = clip;
export type { Person };
export const scene = {
  get people() { return people; },
  get feed() { return feed; },
  mount(el: HTMLCanvasElement) { canvas = el; ctx = el.getContext("2d")!; lastFrame = performance.now(); requestAnimationFrame(tick); },
  /** New snapshot from the server. Rebuilds the layout only when rooms or people change. */
  setState(st: Snapshot) {
    const s = JSON.stringify([st.people.map((p) => [p.id, p.room, p.look]), st.office.rooms]);
    if (s !== shape) { shape = s; layout = buildLayout(st); syncPeople(st); }
    state = st;
  },
  /** Fit the canvas to a CSS width; returns the CSS height. */
  resize(width: number) {
    if (!layout || !canvas) return 0;
    S = width / layout.W;
    canvas.width = Math.round(layout.W * S * devicePixelRatio); canvas.height = Math.round(layout.H * S * devicePixelRatio);
    return Math.round(layout.H * S);
  },
  /** Rebuild "who is busy" from history without animating; only the last 30 minutes count as still working. */
  replay(events: HookEvent[]) {
    feed = [];
    for (const e of events) applyEvent(e, false);
    const history = feed, cutoff = Date.now() / 1000 - 30 * 60;
    people.forEach((p) => { p.status = "idle"; p.activity = ""; });
    for (const e of events.filter((e) => e.ts >= cutoff)) applyEvent(e, false);
    feed = history;
  },
  applyEvent(e: HookEvent, live = true) { applyEvent(e, live); },
  /** The person under a point in CSS pixels relative to the canvas. */
  hit(x: number, y: number): Person | null {
    x /= S; y /= S;
    return [...people.values()].filter((p) => Math.abs(p.x - x) < 7 && y > p.y - 24 && y < p.y + 2).sort((a, b) => b.y - a.y)[0] || null;
  },
  setHover(id: string | null) { hoverId = id; },
  setHot(id: string | null) { hotRole = id; },
  setTheme(mode: Theme) { themeMode = mode; },
  nameOf, roleColor, rand,
};
