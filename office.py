"""The office: a live pixel view of a company built by factory.py.

  python3 factory.py office <company dir> [--port N] [--open]

Read-only by design: the server only serves the page, a state snapshot and a stream of hook events.
Nothing on the page can run commands or change files. It binds to 127.0.0.1 and rejects foreign
Host headers, so other sites cannot read it through DNS rebinding.

Sources (all optional, all re-read on every snapshot):
  company.toml            rooms, people, looks
  .office/events.jsonl    Claude Code hook events (written by .claude/hooks/office_event.py)
  Taskboard REST API      tickets per lane and owner, when [taskboard] enabled
  company/board.md        tickets, when Taskboard is off
  company/approvals.md    pending approvals (the founder's inbox)
  handoffs/*.md           finished tickets (the handoff shelf)
"""
import json
import re
import time
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PAGE = Path(__file__).resolve().parent / "library" / "office" / "index.html"
FOUNDER, ORCHESTRATOR = "founder", "chief"
MAX_EVENTS = 200


def read(path):
    try:
        return path.read_text()
    except OSError:
        return ""


def pending_approvals(company_dir):
    text = read(company_dir / "company" / "approvals.md")
    pending = text.split("## Pending", 1)[-1].split("## Decided", 1)[0] if "## Pending" in text else ""
    items = []
    for m in re.finditer(r"^- \[ \] (A-\d+) \(([^,)]+)[^)]*\):\s*(.+)$", pending, re.M):
        items.append({"id": m.group(1), "role": m.group(2).strip(), "title": m.group(3).split("|")[0].strip()[:160]})
    return items


def handoffs(company_dir, limit=12):
    files = [p for p in (company_dir / "handoffs").glob("*.md") if p.name != "TEMPLATE.md"]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for p in files[:limit]:
        m = re.match(r"([A-Z][A-Z0-9]*-\d+)-(.+)", p.stem)
        out.append({"file": p.name, "ticket": m.group(1) if m else "", "role": m.group(2) if m else "",
                    "at": int(p.stat().st_mtime)})
    return out


def board_file_tickets(company_dir):
    tickets = []
    for line in read(company_dir / "company" / "board.md").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and re.fullmatch(r"[A-Z][A-Z0-9]*-\d+", cells[0]):
            tickets.append({"key": cells[0], "lane": cells[1], "role": cells[2], "title": cells[3]})
    return tickets


def owner(description):
    m = re.search(r"\bOwner:\s*([a-z][a-z0-9-]*)", description or "")
    return m.group(1) if m else ""


def taskboard_tickets(cfg, company_dir):
    """Tickets of this company's Taskboard project. Returns (tickets, error)."""
    office, tb = cfg["office"], cfg["taskboard"]
    base = office["taskboard_url"].rstrip("/")
    # Agent ids written by /setup-board, so tickets map to roles even if agents were renamed.
    agent_role = dict(re.findall(r"^\|\s*([a-z][a-z0-9-]*)\s*\|\s*`([^`]+)`", read(company_dir / "company" / "board-ids.md"), re.M))
    agent_role = {v: k for k, v in agent_role.items()}
    try:
        def get(path):
            with urllib.request.urlopen(base + path, timeout=2) as r:
                return json.load(r)
        project = next((p for p in get("/api/projects") if p.get("prefix") == tb["prefix"] or p.get("name") == tb["project"]), None)
        if not project:
            return [], f"no Taskboard project `{tb['project']}` yet (run /setup-board)"
        raw = get(f"/api/tickets?projectId={project['id']}")
    except (OSError, ValueError) as e:
        return [], f"Taskboard unreachable at {base} ({e.__class__.__name__})"
    tickets = []
    for t in raw:
        agent = t.get("agent") or {}
        tickets.append({
            "key": f"{t.get('projectPrefix') or tb['prefix']}-{t['number']}", "lane": t.get("status", ""),
            "role": agent_role.get(t.get("agentId") or "") or agent.get("name") or owner(t.get("description", "")), "title": t.get("title", "")[:140],
            "priority": t.get("priority", ""), "blocked": bool(t.get("blockedBy")),
        })
    return tickets, None


def snapshot(cfg, company_dir):
    co, office = cfg["company"], cfg["office"]
    if cfg["taskboard"]["enabled"]:
        tickets, board_error = taskboard_tickets(cfg, company_dir)
    else:
        tickets, board_error = board_file_tickets(company_dir), None
    people = [{"id": FOUNDER, "title": co["founder_title"], "kind": "human", "room": "founder", "look": office["founder_look"]},
              {"id": ORCHESTRATOR, "title": cfg["orchestrator"]["title"], "kind": "orchestrator", "room": "hub",
               "look": office["orchestrator_look"]}]
    people += [{"id": r["id"], "title": r["title"], "kind": "agent", "room": r["room"], "model": r["model"],
                "look": r["look"], "mission": r["mission"]} for r in cfg["roles"]]
    return {
        "office": {k: office[k] for k in ("title", "subtitle", "theme", "rooms")},
        "company": {"name": co["name"], "mission": co["mission"], "prefix": cfg["taskboard"]["prefix"]},
        "lanes": cfg["taskboard"]["lanes"],
        "people": people,
        "tickets": tickets,
        "board_error": board_error,
        "approvals": pending_approvals(company_dir),
        "handoffs": handoffs(company_dir),
        "goals": [g["objective"] for g in cfg.get("goals", [])],
        "now": int(time.time()),
    }


class EventLog:
    """Tails .office/events.jsonl by byte offset; survives truncation by the hook's rotation."""

    def __init__(self, path):
        self.path = path

    def since(self, offset):
        try:
            size = self.path.stat().st_size
        except OSError:
            return [], 0
        if offset > size:
            offset = 0
        with open(self.path, "rb") as f:
            f.seek(offset)
            data = f.read()
        end = offset + data.rfind(b"\n") + 1
        events = []
        for line in data[: end - offset].splitlines():
            try:
                events.append(json.loads(line))
            except ValueError:
                pass
        return events, end

    def tail(self, n=MAX_EVENTS):
        events, end = self.since(0)
        return events[-n:], end


def serve(company_dir, load, port=None, open_browser=False):
    cfg = load(company_dir)
    port = port or cfg["office"]["port"]
    log = EventLog(company_dir / cfg["office"]["events"])
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def send(self, code, body, ctype):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def state(self):
            nonlocal cfg
            try:
                cfg = load(company_dir)  # pick up company.toml edits without a restart
                return snapshot(cfg, company_dir) | {"config_error": None}
            except Exception as e:  # keep the last good office on screen
                return snapshot(cfg, company_dir) | {"config_error": str(e)}

        def do_GET(self):
            if self.headers.get("Host") not in allowed_hosts:
                return self.send(403, b"forbidden host", "text/plain")
            path = self.path.split("?", 1)[0]
            if path == "/":
                return self.send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
            if path == "/api/state":
                events, offset = log.tail()
                body = self.state() | {"events": events, "offset": offset}
                return self.send(200, json.dumps(body).encode(), "application/json")
            if path == "/api/stream":
                return self.stream()
            self.send(404, b"not found", "text/plain")

        def stream(self):
            """Server-sent events: `event` per hook event, `state` every few seconds."""
            m = re.search(r"[?&]offset=(\d+)", self.path)
            offset = int(m.group(1)) if m else log.tail()[1]
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            last_state = 0.0
            try:
                while True:
                    events, offset = log.since(offset)
                    for e in events:
                        self.wfile.write(f"event: hook\ndata: {json.dumps(e)}\n\n".encode())
                    if time.time() - last_state > cfg["office"]["refresh_seconds"]:
                        self.wfile.write(f"event: state\ndata: {json.dumps(self.state())}\n\n".encode())
                        last_state = time.time()
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    time.sleep(0.4)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    url = f"http://127.0.0.1:{port}"
    print(f"{cfg['office']['title']} is open at {url}  (Ctrl+C to close)")
    print(f"  events: {log.path}")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\noffice closed")
