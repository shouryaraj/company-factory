// Claude Code hook: append one small, redacted line per event to .office/events.jsonl for the office view.
//
// Copied into each company as .claude/hooks/office-event.mjs and run with plain `node`, so it must not import
// anything outside Node itself. Registered async in .claude/settings.json, so it never slows Claude down.
// It records who did what (event, agent, tool, a short label), never file contents, tool output or full prompts.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep, basename } from "node:path";

const MAX_BYTES = 1_000_000;
const ROOT = process.env.CLAUDE_PROJECT_DIR || ".";
const LOG = resolve(ROOT, process.env.OFFICE_EVENTS || ".office/events.jsonl");

type Input = Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

const short = (text: unknown, n = 80) => {
  const s = String(text ?? "").split(/\s+/).filter(Boolean).join(" ");
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
};

function rel(path: string) {
  const r = relative(resolve(ROOT), resolve(ROOT, path));
  return r && !r.startsWith("..") && !isAbsolute(r) ? r.split(sep).join("/") : basename(path);
}

/** A few words about a tool call: the file, the search, the first line of a command. */
function label(tool: string, inp: Input) {
  if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) return rel(inp.file_path || inp.notebook_path || "");
  if (tool === "Bash") return short(inp.description || String(inp.command ?? "").split("\n")[0], 60);
  if (tool === "Grep" || tool === "Glob") return short(inp.pattern, 50);
  if (tool === "WebSearch") return short(inp.query, 60);
  if (tool === "WebFetch") return short(inp.url, 60);
  if (tool === "Agent" || tool === "Task") return short(inp.description, 60);
  if (tool.startsWith("mcp__")) return tool.split("__").at(-1)!.replace(/_/g, " ");
  return "";
}

function main() {
  let e: Input;
  try { e = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const ev = e.hook_event_name ?? "";
  const out: Input = { ts: Math.round(Date.now()) / 1000, ev, agent: e.agent_type || "", aid: e.agent_id || "", session: String(e.session_id ?? "").slice(0, 8) };
  if (["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(ev)) {
    const tool = e.tool_name ?? "", inp = e.tool_input ?? {};
    Object.assign(out, { tool, label: label(tool, inp), id: e.tool_use_id ?? "" });
    if (tool === "Agent" || tool === "Task") out.sub = inp.subagent_type || "general-purpose";
  } else if (ev === "UserPromptSubmit") out.label = short(e.prompt, 90);
  else if (ev === "SubagentStop" || ev === "Stop") out.label = short(e.last_assistant_message, 120);
  else if (ev === "Notification") Object.assign(out, { label: short(e.message, 90), kind: e.notification_type ?? "" });
  else if (ev === "SessionStart") out.label = e.source ?? "";
  else if (ev === "SessionEnd") out.label = e.reason ?? "";

  mkdirSync(dirname(LOG), { recursive: true });
  if (existsSync(LOG) && statSync(LOG).size > MAX_BYTES) {
    const tail = readFileSync(LOG).subarray(-MAX_BYTES / 2);
    writeFileSync(LOG, tail.subarray(tail.indexOf(0x0a) + 1));
  }
  appendFileSync(LOG, JSON.stringify(out) + "\n");
}

try { main(); } catch { /* the office is decoration; never break a Claude session over it */ }
