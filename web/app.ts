// The office UI: Preact + htm components styled with Tailwind (web/office.css, compiled at build time).
// The pixel office itself is drawn by scene.ts; this file owns data, the layout around it, and the sidebar.
import { render, type ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { html } from "htm/preact";
import { scene, clipText as clip, type Person } from "./scene.js";
import type { Approval, FeedItem, HookEvent, Snapshot, Theme, Ticket } from "./types.js";

const DEMO = new URLSearchParams(location.search).has("demo");
const THEMES: Record<Theme, string> = { auto: "◐ auto", day: "☀ day", night: "☾ night" };
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// ---------- small pieces ----------
const Card = ({ title, right, children }: { title: ComponentChildren; right?: ComponentChildren; children?: ComponentChildren }) => html`
  <section class="min-w-0 rounded-[10px] border border-line bg-panel px-3 py-2.5">
    <h2 class="mb-2 flex justify-between text-xs uppercase tracking-[.08em] text-muted">${title}<span class="text-ink">${right}</span></h2>
    ${children}
  </section>`;

const Empty = ({ children }: { children?: ComponentChildren }) => html`<div class="text-xs text-muted">${children}</div>`;

const Row = ({ k, warn, role, children }: { k?: string; warn?: boolean; role?: string; children?: ComponentChildren }) => html`
  <div class="min-w-0 border-t border-line py-1.5 first:border-t-0" data-role=${role}>
    ${k && html`<span class="mr-1.5 font-mono text-[11px] font-semibold ${warn ? "text-warn" : "text-accent"}">${k}</span>`}${children}
  </div>`;

// ---------- header ----------
function Header({ st, live, theme, onTheme }: { st: Snapshot | null; live: string; theme: Theme; onTheme: () => void }) {
  return html`<header class="flex flex-wrap items-baseline gap-3 px-4 pt-3.5 pb-2">
    <h1 class="m-0 text-lg font-semibold">${st?.office.title || "Office"}</h1>
    <div class="min-w-0 flex-[1_1_320px] truncate text-muted" title=${st?.office.subtitle}>${st?.office.subtitle}</div>
    <button class="cursor-pointer rounded-md border border-line bg-chip px-2 py-0.5 text-xs" title="Day / night" onClick=${onTheme}>${THEMES[theme]}</button>
    <div class="flex items-center gap-1.5 text-xs text-muted">
      <i class="size-2 rounded-full ${live === "live" ? "bg-ok shadow-[0_0_0_3px_color-mix(in_srgb,var(--ok)_25%,transparent)]" : "bg-muted"}"></i>${live}
    </div>
  </header>`;
}

// ---------- the canvas ----------
interface TipState { p: Person; x: number; y: number }

function Stage({ st, banner }: { st: Snapshot; banner: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0), [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => { scene.mount(canvas.current!); }, []);
  useEffect(() => {
    const fit = () => setHeight(scene.resize(box.current!.clientWidth));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(box.current!);
    return () => ro.disconnect();
  }, [st.people.length, JSON.stringify(st.office.rooms)]);

  const move = (ev: MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect(), p = scene.hit(ev.clientX - r.left, ev.clientY - r.top);
    scene.setHover(p?.id || null);
    setTip(p ? { p, x: Math.min(ev.clientX - r.left + 14, r.width - 290), y: ev.clientY - r.top + 14 } : null);
  };
  const leave = () => { scene.setHover(null); setTip(null); };

  return html`<div ref=${box} class="relative overflow-hidden rounded-[10px] border border-line bg-panel">
    ${banner && html`<div class="whitespace-pre-wrap border-b border-line bg-warn/15 px-3 py-2 text-xs">${banner}</div>`}
    <canvas ref=${canvas} class="block w-full [image-rendering:pixelated]" style=${{ height: height + "px" }}
      onMouseMove=${move} onMouseLeave=${leave}></canvas>
    ${tip && html`<${Tip} ...${tip} tickets=${st.tickets} />`}
  </div>`;
}

function Tip({ p, x, y, tickets }: TipState & { tickets: Ticket[] }) {
  const owned = tickets.filter((t) => t.role === p.id && t.lane !== "done");
  return html`<div class="pointer-events-none absolute z-10 max-w-[280px] rounded-lg border border-line bg-panel px-2.5 py-2 text-xs shadow-xl"
    style=${{ left: x + "px", top: y + "px" }}>
    <b class="block text-[13px]">${p.title}</b>
    <div class="text-muted">${p.kind === "agent" ? `${p.id} · ${p.model}` : p.kind}</div>
    ${p.activity ? html`<div>▶ ${p.activity}</div>` : html`<div class="text-muted">${p.status === "working" ? "working" : "idle"}</div>`}
    ${p.mission && html`<div class="mt-1 text-muted">${clip(p.mission, 140)}</div>`}
    ${owned.length > 0 && html`<div class="mt-1 flex flex-wrap gap-1">${owned.map((t) => html`<${Chip} t=${t} />`)}</div>`}
  </div>`;
}

// ---------- sidebar ----------
const Chip = ({ t }: { t: Ticket }) => html`
  <span class="inline-flex cursor-default items-center gap-1.5 rounded-[5px] bg-chip px-1.5 py-0.5 font-mono text-[11px]"
    data-role=${t.role} title=${t.title + (t.role ? " · " + t.role : "")}>
    <i class="inline-block size-[7px] rounded-[2px]" style=${{ background: scene.roleColor(t.role) }}></i>${t.key}</span>`;

function NeedsYou({ approvals, blocked }: { approvals: Approval[]; blocked: Ticket[] }) {
  return html`<${Card} title="Needs you" right=${approvals.length + blocked.length}>
    ${approvals.map((a) => html`<${Row} key=${a.id} k=${a.id} warn role=${a.role}>
      <span class="[overflow-wrap:anywhere]">${clip(a.title, 120)}</span><div class="text-xs text-muted">from ${scene.nameOf(a.role)}</div></${Row}>`)}
    ${blocked.map((t) => html`<${Row} key=${t.key} k=${t.key} warn role=${t.role}>${t.title}</${Row}>`)}
    ${!approvals.length && !blocked.length && html`<${Empty}>Nothing waiting on you.</${Empty}>`}
  </${Card}>`;
}

function Board({ lanes, tickets, url }: { lanes: string[]; tickets: Ticket[]; url: string | null }) {
  const open = tickets.filter((t) => t.lane !== lanes[lanes.length - 1]).length;
  const title = html`<span>Board ${url && html`<a class="ml-1.5 normal-case tracking-normal text-accent no-underline" href=${url} target="_blank" rel="noopener">open ↗</a>`}</span>`;
  return html`<${Card} title=${title} right=${open + " open"}>
    <div class="flex flex-col gap-1.5">${lanes.map((lane) => {
      const ts = tickets.filter((t) => t.lane === lane);
      return html`<div key=${lane} class="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-2">
        <div class="truncate pt-0.5 text-xs text-muted" title=${lane}>${lane.replace(/_/g, " ")} · ${ts.length}</div>
        <div class="flex min-w-0 flex-wrap gap-1">${ts.map((t) => html`<${Chip} key=${t.key} t=${t} />`)}</div>
      </div>`;
    })}</div>
  </${Card}>`;
}

function Team({ people }: { people: Person[] }) {
  return html`<${Card} title="Team">
    <div class="grid grid-cols-2 gap-x-2.5 gap-y-1">${people.map((p) => {
      const dot = p.status === "working" ? "bg-ok" : !p.atHome && p.kind !== "guest" ? "bg-away" : "bg-line";
      return html`<div key=${p.id} class="flex min-w-0 cursor-pointer items-center gap-1.5 text-xs" data-role=${p.id} title=${p.activity || p.title}>
        <i class="size-2 flex-none rounded-full ${dot}"></i><span class="truncate">${p.title}</span></div>`;
    })}</div>
  </${Card}>`;
}

function Feed({ items }: { items: FeedItem[] }) {
  const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return html`<${Card} title="Activity">
    <div class="max-h-[300px] overflow-auto">${items.length ? items.slice(0, 60).map((f, i) => html`
      <div key=${f.ts + ":" + i} class="grid grid-cols-[44px_minmax(0,1fr)] gap-1.5 border-t border-line py-1.5 text-xs first:border-t-0" data-role=${f.id}>
        <span class="pt-px font-mono text-[11px] text-muted">${time(f.ts)}</span><span class="[overflow-wrap:anywhere]">${f.text}</span></div>`)
      : html`<${Empty}>No activity yet. Start <code>claude</code> in the company folder.</${Empty}>`}</div>
  </${Card}>`;
}

// ---------- data: snapshot + server-sent events ----------
function useOffice() {
  const [st, setSt] = useState<Snapshot | null>(null), [live, setLive] = useState("connecting"), [, setTick] = useState(0);
  const demoTickets = useRef<Ticket[] | null>(null);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const apply = useCallback((next: Snapshot) => {
    if (demoTickets.current) next = { ...next, tickets: demoTickets.current };
    scene.setState(next); setSt(next);
  }, []);

  useEffect(() => {
    let es: EventSource | undefined, timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
    const connect = async () => {
      let first: Snapshot;
      try { first = await (await fetch("/api/state")).json(); }
      catch { setLive("office server is not running"); timer = setTimeout(connect, 3000); return; }
      apply(first); scene.replay(first.events ?? []); refresh();
      if (DEMO && !demoTickets.current) startDemo(first, demoTickets, apply, refresh);
      es = new EventSource("/api/stream?offset=" + first.offset);
      es.addEventListener("hook", (m: MessageEvent) => { scene.applyEvent(JSON.parse(m.data)); refresh(); });
      es.addEventListener("state", (m: MessageEvent) => apply(JSON.parse(m.data)));
      es.onopen = () => setLive("live");
      es.onerror = () => { setLive("reconnecting"); es!.close(); if (!stopped) timer = setTimeout(connect, 2000); };
    };
    connect();
    const beat = setInterval(refresh, 1000);  // people move and change status inside the scene
    return () => { stopped = true; es && es.close(); clearTimeout(timer); clearInterval(beat); };
  }, []);
  return { st, live };
}

// ?demo plays a scripted day so the office can be tried without a Claude session.
// Tickets move across the board in the browser only; nothing is written.
function startDemo(st: Snapshot, demoTickets: { current: Ticket[] | null }, apply: (s: Snapshot) => void, refresh: () => void) {
  const tickets = (demoTickets.current = st.tickets.map((t) => ({ ...t })));
  const lanes = st.lanes, [backlog, todo] = lanes, active = lanes.find((l) => /progress|draft|research/.test(l)) || lanes[2],
    review = lanes.find((l) => /review|edit/.test(l)) || lanes[lanes.length - 2], done = lanes[lanes.length - 1];
  const roles = st.people.filter((p) => p.kind === "agent").map((p) => p.id);
  const tools: [string, string][] = [["Read", "specs/onboarding.md"], ["Edit", "app/export.py"], ["Bash", "run the test suite"], ["WebSearch", "competitor pricing pages"],
    ["Grep", "TODO"], ["Write", "drafts/launch-post.md"], ["WebFetch", "docs.example.com/api"], ["Glob", "**/*.md"]];
  const r = scene.rand("demo"), pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)], busy = new Map<string, Ticket>();
  const emit = (e: Partial<HookEvent> & { ev: string }) => { scene.applyEvent({ ts: Date.now() / 1000, agent: "", ...e }); refresh(); };
  const move = (t: Ticket, lane: string) => { t.lane = lane; apply({ ...st, tickets }); };
  emit({ ev: "UserPromptSubmit", label: "/kickoff ship the beta this week" });
  let n = 0;
  setInterval(() => {
    n++;
    const x = r();
    if ((x < 0.35 || busy.size === 0) && busy.size < 4) {
      const t = tickets.find((t) => (t.lane === todo || t.lane === backlog) && !busy.has(t.role) && roles.includes(t.role));
      if (!t) { tickets.filter((t) => t.lane === done).slice(0, 3).forEach((t) => (t.lane = todo)); return; }
      busy.set(t.role, t); move(t, active);
      emit({ ev: "PreToolUse", tool: "Agent", sub: t.role, label: `${t.key} ${t.title}` });
      setTimeout(() => emit({ ev: "SubagentStart", agent: t.role }), 600);
    } else if (x < 0.82) {
      const [tool, label] = pick(tools); emit({ ev: "PreToolUse", agent: pick([...busy.keys()]), tool, label });
    } else if (x < 0.95) {
      const [role, t] = pick([...busy.entries()]); busy.delete(role); move(t, review);
      emit({ ev: "SubagentStop", agent: role, label: "handoff written" });
      setTimeout(() => { move(t, done); emit({ ev: "PreToolUse", tool: "Read", label: `handoffs/${t.key}-${role}.md` }); }, 3500);
    } else emit({ ev: "Notification", label: "Approve publishing the launch post?" });
    if (n % 9 === 0) emit({ ev: "PreToolUse", agent: "Explore", tool: "Grep", label: "where is billing configured" });
  }, 1300);
}

// ---------- app ----------
function useTheme(st: Snapshot | null): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme | null>(() => load("office-theme") as Theme | null);
  const mode: Theme = theme || st?.office.theme || "auto";
  useEffect(() => {
    scene.setTheme(mode);
    const root = document.documentElement;
    if (mode === "auto") delete root.dataset.theme; else root.dataset.theme = mode === "night" ? "dark" : "light";
  }, [mode]);
  const next = () => { const m = ({ auto: "day", day: "night", night: "auto" } as const)[mode]; save("office-theme", m); setTheme(m); };
  return [mode, next];
}

function App() {
  const { st, live } = useOffice();
  const [theme, nextTheme] = useTheme(st);
  useEffect(() => { if (st) document.title = st.office.title; }, [st && st.office.title]);
  const hot = (ev: MouseEvent) => scene.setHot((ev.target as HTMLElement).closest<HTMLElement>("[data-role]")?.dataset.role || null);
  const banner = st && (st.config_error ? "company.toml has an error; showing the last good office:\n" + st.config_error : st.board_error);

  return html`<div onMouseOver=${hot}>
    <${Header} st=${st} live=${live} theme=${theme} onTheme=${nextTheme} />
    <main class="grid grid-cols-1 gap-3 px-4 pb-4 min-[980px]:grid-cols-[minmax(0,1fr)_340px]">
      <div class="min-w-0">${st && html`<${Stage} st=${st} banner=${banner} />`}</div>
      ${st && html`<aside class="flex min-w-0 flex-col gap-3">
        <${NeedsYou} approvals=${st.approvals} blocked=${st.tickets.filter((t) => t.lane === "needs_founder")} />
        <${Board} lanes=${st.lanes} tickets=${st.tickets} url=${st.office.board_url} />
        <${Team} people=${[...scene.people.values()]} />
        <${Feed} items=${scene.feed} />
      </aside>`}
    </main>
  </div>`;
}

(window as unknown as { office: typeof scene }).office = scene;  // for poking at the scene from the console
render(html`<${App} />`, document.getElementById("app")!);
