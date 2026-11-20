#!/usr/bin/env python3
"""Claude Code hook: append one small, redacted line per event to .office/events.jsonl for the office view.

Registered async in .claude/settings.json, so it never slows Claude down. It records who did what
(event, agent, tool, a short label), never file contents, tool output or full prompts.
"""
import json
import os
import sys
import time
from pathlib import Path

MAX_BYTES = 1_000_000
ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".")
LOG = ROOT / os.environ.get("OFFICE_EVENTS", ".office/events.jsonl")


def short(text, n=80):
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def rel(path):
    try:
        return Path(path).resolve().relative_to(ROOT.resolve()).as_posix()
    except (ValueError, OSError):
        return Path(str(path)).name


def label(tool, inp):
    """A few words about a tool call: the file, the search, the first word of a command."""
    if tool in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        return rel(inp.get("file_path") or inp.get("notebook_path") or "")
    if tool == "Bash":
        return short(inp.get("description") or inp.get("command", "").split("\n")[0], 60)
    if tool in ("Grep", "Glob"):
        return short(inp.get("pattern"), 50)
    if tool == "WebSearch":
        return short(inp.get("query"), 60)
    if tool == "WebFetch":
        return short(inp.get("url"), 60)
    if tool in ("Agent", "Task"):
        return short(inp.get("description"), 60)
    if tool.startswith("mcp__"):
        return tool.split("__")[-1].replace("_", " ")
    return ""


def main():
    try:
        e = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace"))
    except ValueError:
        return
    ev = e.get("hook_event_name", "")
    out = {"ts": round(time.time(), 3), "ev": ev, "agent": e.get("agent_type") or "", "aid": e.get("agent_id") or "",
           "session": (e.get("session_id") or "")[:8]}
    if ev in ("PreToolUse", "PostToolUse", "PostToolUseFailure"):
        tool, inp = e.get("tool_name", ""), e.get("tool_input") or {}
        out |= {"tool": tool, "label": label(tool, inp), "id": e.get("tool_use_id", "")}
        if tool in ("Agent", "Task"):
            out["sub"] = inp.get("subagent_type") or "general-purpose"
    elif ev == "UserPromptSubmit":
        out["label"] = short(e.get("prompt"), 90)
    elif ev in ("SubagentStop", "Stop"):
        out["label"] = short(e.get("last_assistant_message"), 120)
    elif ev == "Notification":
        out |= {"label": short(e.get("message"), 90), "kind": e.get("notification_type", "")}
    elif ev == "SessionStart":
        out["label"] = e.get("source", "")
    elif ev == "SessionEnd":
        out["label"] = e.get("reason", "")
    LOG.parent.mkdir(parents=True, exist_ok=True)
    if LOG.exists() and LOG.stat().st_size > MAX_BYTES:
        tail = LOG.read_bytes()[-MAX_BYTES // 2:]
        LOG.write_bytes(tail[tail.find(b"\n") + 1:])
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(out) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # the office is decoration; never break a Claude session over it
