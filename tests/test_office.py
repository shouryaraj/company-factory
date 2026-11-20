import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from company_factory import cli as factory  # noqa: E402
from company_factory import office  # noqa: E402

HOOK = ROOT / "src" / "company_factory" / "library" / "office" / "office_event.py"


def make_company(tmp, extra=""):
    d = Path(tmp)
    with redirect_stdout(io.StringIO()):
        factory.init(d, "starter")
    if extra:
        with open(d / "company.toml", "a", encoding="utf-8") as f:
            f.write("\n" + extra)
    return d


class OfficeConfig(unittest.TestCase):
    def test_rooms_default_to_departments(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = factory.load_company(make_company(tmp))
            rooms = {r["id"]: r["roles"] for r in cfg["office"]["rooms"]}
            for role in cfg["roles"]:
                self.assertIn(role["id"], rooms[role["room"]])
            self.assertEqual(cfg["office"]["port"], 4477)

    def test_looks_are_stable_and_overridable(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp)
            a = {r["id"]: r["look"] for r in factory.load_company(d)["roles"]}
            b = {r["id"]: r["look"] for r in factory.load_company(d)["roles"]}
            self.assertEqual(a, b)
            text = (d / "company.toml").read_text(encoding="utf-8").replace(
                'use = "engineer"', 'use = "engineer"\nlook = { shirt = "#112233", accessory = "headset" }', 1)
            (d / "company.toml").write_text(text, encoding="utf-8")
            eng = next(r for r in factory.load_company(d)["roles"] if r["id"] == "engineer")
            self.assertEqual((eng["look"]["shirt"], eng["look"]["accessory"]), ("#112233", "headset"))
            self.assertEqual(eng["look"]["hair"], a["engineer"]["hair"])

    def test_bad_office_config_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp, '[office]\ntheme = "dusk"\n[[office.rooms]]\nid = "lab"\nroles = ["nobody"]\nfloor = "red"\n')
            with self.assertRaises(factory.ConfigError) as e:
                factory.load_company(d)
            msg = str(e.exception)
            for needle in ("theme `dusk`", "unknown role `nobody`", "floor `red`"):
                self.assertIn(needle, msg)

    def test_unplaced_roles_go_to_open_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp, '[[office.rooms]]\nid = "lab"\nroles = ["engineer"]\n')
            cfg = factory.load_company(d)
            ids = [r["id"] for r in cfg["office"]["rooms"]]
            self.assertEqual(ids, ["lab", "floor"])


class Build(unittest.TestCase):
    def test_build_writes_hooks_and_keeps_user_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp)
            with redirect_stdout(io.StringIO()):
                factory.build(d)
            settings = json.loads((d / ".claude/settings.json").read_text(encoding="utf-8"))
            hooks = {ev: hs[0]["hooks"][0] for ev, hs in settings["hooks"].items()}
            self.assertTrue(hooks["PreToolUse"]["async"])
            self.assertNotIn("async", hooks["Stop"])  # must survive `claude -p` exiting
            self.assertTrue((d / ".claude/hooks/office_event.py").exists())
            self.assertEqual((d / ".office/.gitignore").read_text(encoding="utf-8").splitlines()[-1], "*")

        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp)
            (d / ".claude").mkdir()
            (d / ".claude/settings.json").write_text('{"mine": true}', encoding="utf-8")
            out = io.StringIO()
            with redirect_stdout(out):
                factory.build(d)
            self.assertEqual((d / ".claude/settings.json").read_text(encoding="utf-8"), '{"mine": true}')
            self.assertIn("office-hooks", out.getvalue())


    def test_taskboard_mcp_registered_only_when_enabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp)
            with redirect_stdout(io.StringIO()):
                factory.build(d)
            self.assertFalse((d / ".mcp.json").exists())
            (d / "company.toml").write_text((d / "company.toml").read_text(encoding="utf-8").replace("enabled = false", "enabled = true"), encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                factory.build(d)
            mcp = json.loads((d / ".mcp.json").read_text(encoding="utf-8"))["mcpServers"]["taskboard"]
            self.assertEqual((mcp["command"], mcp["args"]), ("taskboard", ["mcp"]))


class Plugins(unittest.TestCase):
    def test_default_marketplace_plugins_land_in_settings_and_agents(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp)
            with redirect_stdout(io.StringIO()):
                factory.build(d)
            settings = json.loads((d / ".claude/settings.json").read_text(encoding="utf-8"))
            self.assertEqual(settings["extraKnownMarketplaces"]["anthropic-agent-skills"]["source"],
                             {"source": "github", "repo": "anthropics/skills"})
            self.assertTrue(settings["enabledPlugins"]["document-skills@anthropic-agent-skills"])
            agent = (d / ".claude/agents/engineer.md").read_text(encoding="utf-8")
            self.assertIn("skills: code-change, debugging", agent)
            self.assertIn("example-skills:webapp-testing", agent)

    def test_plugins_can_be_turned_off_and_are_validated(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp, '[plugins]\nenable = []\n')
            text = (d / "company.toml").read_text(encoding="utf-8").replace('use = "engineer"', 'use = "engineer"\nplugin_skills = []', 1)
            text = text.replace('use = "product-manager"', 'use = "product-manager"\nplugin_skills = []', 1)
            text = text.replace('use = "qa-engineer"', 'use = "qa-engineer"\nplugin_skills = []', 1)
            text = text.replace('use = "growth-marketer"', 'use = "growth-marketer"\nplugin_skills = []', 1)
            (d / "company.toml").write_text(text, encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                factory.build(d)
            self.assertNotIn("enabledPlugins", json.loads((d / ".claude/settings.json").read_text(encoding="utf-8")))
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp, '[plugins]\nenable = []\n')
            with self.assertRaises(factory.ConfigError) as e:
                factory.load_company(d)
            self.assertIn("plugin skill `example-skills:webapp-testing`", str(e.exception))


class Examples(unittest.TestCase):
    def test_every_example_builds(self):
        for name in factory.examples():
            with self.subTest(name), tempfile.TemporaryDirectory() as tmp:
                d = Path(tmp)
                with redirect_stdout(io.StringIO()):
                    factory.init(d, name)
                    factory.build(d)
                self.assertTrue((d / "CLAUDE.md").exists())

    def test_demo_seed_fills_board_and_inbox(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            with redirect_stdout(io.StringIO()):
                factory.init(d, "saas")
                factory.build(d)
            cfg = factory.load_company(d)
            office.seed_demo(cfg, d)
            s = office.snapshot(cfg, d)
            self.assertGreaterEqual(len(s["tickets"]), 8)
            self.assertEqual(len(s["approvals"]), 2)
            self.assertTrue(s["handoffs"])


class Hook(unittest.TestCase):
    def run_hook(self, d, payload):
        subprocess.run([sys.executable, str(HOOK)], input=payload, text=True, check=True,
                       env={**os.environ, "CLAUDE_PROJECT_DIR": str(d)})

    def test_records_small_redacted_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            self.run_hook(d, json.dumps({"hook_event_name": "PreToolUse", "agent_type": "engineer", "tool_name": "Write",
                                         "tool_input": {"file_path": str(d / "app/x.py"), "content": "SECRET"}}))
            self.run_hook(d, json.dumps({"hook_event_name": "PreToolUse", "tool_name": "Agent",
                                         "tool_input": {"subagent_type": "qa-engineer", "description": "test it", "prompt": "SECRET"}}))
            self.run_hook(d, "garbage")
            lines = (d / ".office/events.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            self.assertNotIn("SECRET", "".join(lines))
            first, second = map(json.loads, lines)
            self.assertEqual((first["agent"], first["label"]), ("engineer", "app/x.py"))
            self.assertEqual((second["sub"], second["label"]), ("qa-engineer", "test it"))


class Snapshot(unittest.TestCase):
    def test_reads_board_approvals_and_handoffs(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = make_company(tmp)
            with redirect_stdout(io.StringIO()):
                factory.build(d)
            cfg = factory.load_company(d)
            p = cfg["taskboard"]["prefix"]
            with open(d / "company/board.md", "a", encoding="utf-8") as f:
                f.write(f"| {p}-1 | in_progress | engineer | Build it | tests pass |\n")
            text = (d / "company/approvals.md").read_text(encoding="utf-8").replace(
                "## Decided", "- [ ] A-001 (engineer, 2026-11-21): Push to GitHub | why | risk | rec\n\n## Decided")
            (d / "company/approvals.md").write_text(text, encoding="utf-8")
            (d / "handoffs" / f"{p}-1-engineer.md").write_text("done", encoding="utf-8")
            s = office.snapshot(cfg, d)
            self.assertEqual(s["tickets"], [{"key": f"{p}-1", "lane": "in_progress", "role": "engineer", "title": "Build it"}])
            self.assertEqual(s["approvals"], [{"id": "A-001", "role": "engineer", "title": "Push to GitHub"}])
            self.assertEqual(s["handoffs"][0]["role"], "engineer")
            self.assertEqual([p["id"] for p in s["people"][:2]], ["founder", "chief"])

    def test_event_log_survives_truncation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "e.jsonl"
            path.write_text('{"a": 1}\n{"a": 2}\n{"a"', encoding="utf-8")
            log = office.EventLog(path)
            events, off = log.since(0)
            self.assertEqual(events, [{"a": 1}, {"a": 2}])
            path.write_text('{"a": 3}\n', encoding="utf-8")
            self.assertEqual(log.since(off)[0], [{"a": 3}])


if __name__ == "__main__":
    unittest.main()
