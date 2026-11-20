// company.toml -> a validated, fully defaulted Config. Every problem is collected and reported at once.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { CMD, LIB } from "./paths.js";

export class ConfigError extends Error {}

export type Kind = "roles" | "skills" | "workflows";
export type Look = { shirt: string; skin: string; hair: string; hair_style: string; accessory: string };
export type Gate = { name: string; examples: string };
export type MarketplaceSource = { source: "github"; repo: string } | { source: "git"; url: string } | { source: "directory"; path: string };

export interface Role {
  id: string;
  title: string;
  description: string;
  mission: string;
  department?: string;
  model: string;
  tools: string[];
  skills: string[];
  plugin_skills: string[];
  owns: string[];
  responsibilities: string[];
  never: string[];
  done: string[];
  room: string;
  look: Look;
}

export interface Room { id: string; title: string; roles: string[]; floor?: string }

export interface Config {
  dir: string;
  company: { name: string; mission: string; slug: string; founder_title: string; bet: string; icp: string; principles: string[] };
  orchestrator: { title: string };
  taskboard: { enabled: boolean; project: string; prefix: string; lanes: string[]; command: string; mcp: boolean };
  policy: { autonomy: string[]; rules: string[] };
  gates: Gate[];
  goals: { objective: string; key_results?: string[] }[];
  roles: Role[];
  workflows: { use: string[] };
  plugins: { marketplaces: Record<string, MarketplaceSource>; enable: string[] };
  office: {
    title: string; subtitle: string; port: number; theme: "auto" | "day" | "night"; refresh_seconds: number;
    events: string; taskboard_url: string; founder_look: Look; orchestrator_look: Look; rooms: Room[];
  };
}

const MODELS = ["opus", "sonnet", "haiku", "fable", "inherit"];
const KIND_FILE: Record<Kind, (name: string) => string> = {
  roles: (n) => `${n}.toml`, skills: (n) => join(n, "SKILL.md"), workflows: (n) => `${n}.md`,
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const KEBAB = /^[a-z][a-z0-9-]*$/;
const LOOK_CHOICES = {
  hair_style: ["short", "long", "bun", "spiky", "bald"],
  accessory: ["none", "glasses", "headset", "cap", "beanie"],
};
const PALETTE = {
  shirt: ["#e07a5f", "#3d85c6", "#81b29a", "#f2cc8f", "#9b5de5", "#00a6a6", "#ef476f", "#6a994e", "#bc6c25", "#577590"],
  skin: ["#f6d5b8", "#eac09a", "#d7a27a", "#b07850", "#8d5a3c", "#5e3b28"],
  hair: ["#2b2118", "#5a3825", "#a0522d", "#d9b26f", "#1f2a44", "#7a7a7a", "#c0392b"],
};
const LIST_KEYS = ["skills", "plugin_skills", "owns", "responsibilities", "never", "done", "tools"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

export const loadToml = (path: string): Raw => parse(readFileSync(path, "utf8")) as Raw;
export const titleCase = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** custom/<kind>/ in the company first, then the built-in library. */
export function find(kind: Kind, name: string, companyDir?: string): string | null {
  const bases = [...(companyDir ? [join(companyDir, "custom", kind)] : []), join(LIB, kind)];
  for (const base of bases) {
    const path = join(base, KIND_FILE[kind](name));
    if (existsSync(path)) return path;
  }
  return null;
}

export function available(kind: Kind, companyDir?: string): Map<string, "library" | "custom"> {
  const names = new Map<string, "library" | "custom">();
  const bases: [string, "library" | "custom"][] = [[join(LIB, kind), "library"]];
  if (companyDir) bases.push([join(companyDir, "custom", kind), "custom"]);
  for (const [base, origin] of bases) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base).sort()) {
      const isDir = statSync(join(base, entry)).isDirectory();
      const name = kind === "skills" ? (isDir ? entry : "") : entry.replace(/\.(toml|md)$/, "");
      if (name && find(kind, name, companyDir)) names.set(name, origin);
    }
  }
  return new Map([...names].sort(([a], [b]) => a.localeCompare(b)));
}

export function frontmatterField(text: string, field: string): string {
  const m = text.split("\n---")[0].match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
}

/** A stable look per id, so a role keeps its face across rebuilds. */
export function defaultLook(seed: string): Look {
  const h = createHash("sha256").update(seed).digest();
  const [shirt, skin, hair] = Object.values(PALETTE).map((v, i) => v[h[i] % v.length]);
  const [hair_style, accessory] = Object.values(LOOK_CHOICES).map((v, i) => v[h[5 + i] % v.length]);
  return { shirt, skin, hair, hair_style, accessory };
}

function checkLook(seed: string, owner: string, look: Raw | undefined, errors: string[]): Look {
  const out = { ...defaultLook(seed), ...(look ?? {}) } as Raw;
  for (const key of Object.keys(PALETTE)) if (!HEX.test(out[key])) errors.push(`${owner}: look.${key} \`${out[key]}\` must be a #rrggbb color`);
  for (const [key, choices] of Object.entries(LOOK_CHOICES))
    if (!choices.includes(out[key])) errors.push(`${owner}: look.${key} \`${out[key]}\` must be one of ${choices.join(", ")}`);
  const unknown = Object.keys(out).filter((k) => !(k in PALETTE) && !(k in LOOK_CHOICES));
  if (unknown.length) errors.push(`${owner}: unknown look keys ${unknown.sort().join(", ")}`);
  return out as Look;
}

/** "github:owner/repo" | "git:<url>" | "https://...git" | "path:<dir>" -> a Claude Code marketplace source. */
export function marketplaceSource(spec: string): MarketplaceSource | null {
  const i = spec.indexOf(":"), kind = spec.slice(0, i), rest = spec.slice(i + 1);
  if (kind === "github" && /^[\w.-]+\/[\w.-]+$/.test(rest)) return { source: "github", repo: rest };
  if (kind === "git" && rest) return { source: "git", url: rest };
  if (kind === "https" && spec.endsWith(".git")) return { source: "git", url: spec };
  if (kind === "path" && rest) return { source: "directory", path: rest };
  return null;
}

export function loadCompany(companyDir: string): Config {
  const path = join(companyDir, "company.toml");
  if (!existsSync(path)) throw new ConfigError(`${path} not found; run \`${CMD} init ${companyDir}\` first`);
  let raw: Raw;
  try { raw = loadToml(path); } catch (e) { throw new ConfigError(`company.toml is not valid TOML: ${(e as Error).message}`); }
  const defaults = loadToml(join(LIB, "defaults.toml"));
  const errors: string[] = [];

  const co = { founder_title: "Founder", bet: "", icp: "", principles: [], ...(raw.company ?? {}) };
  for (const key of ["name", "mission"]) if (!co[key]) errors.push(`[company] needs \`${key}\``);
  co.slug ??= String(co.name ?? "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const tb = {
    enabled: false, project: `${co.name ?? "Company"} HQ`, prefix: "TASK", lanes: defaults.lanes,
    command: "taskboard", mcp: true, ...(raw.taskboard ?? {}),
  };
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(tb.prefix)) errors.push(`[taskboard] prefix \`${tb.prefix}\` must be 2-8 uppercase letters/digits`);

  // Each policy list either replaces the default (`rules = [...]`) or extends it (`extra_rules = [...]`).
  const pol = raw.policy ?? {};
  const policy = {
    autonomy: [...(pol.autonomy ?? defaults.autonomy), ...(pol.extra_autonomy ?? [])],
    rules: [...(pol.rules ?? defaults.rules), ...(pol.extra_rules ?? [])],
  };
  const gates: Gate[] = [...(raw.gates ?? defaults.gates), ...(pol.extra_gates ?? [])];

  const roleDefaults = raw.defaults ?? {};
  const roles: Role[] = [];
  const seen = new Set<string>();
  (raw.roles ?? []).forEach((r: Raw, i: number) => {
    let base: Raw = {};
    if (r.use) {
      const src = find("roles", r.use, companyDir);
      if (!src) return errors.push(`role #${i + 1}: no role template \`${r.use}\` (see \`${CMD} list roles\`)`);
      base = loadToml(src);
    }
    const own = Object.fromEntries(Object.entries(r).filter(([k]) => k !== "use" && !k.endsWith("_add")));
    const role: Raw = {
      model: roleDefaults.model ?? "inherit", tools: roleDefaults.tools ?? [],
      skills: [], plugin_skills: [], owns: [], responsibilities: [], never: [], done: [],
      ...base, ...own,
    };
    for (const key of LIST_KEYS) role[key] = [...role[key], ...(r[`${key}_add`] ?? []).filter((x: string) => !role[key].includes(x))];
    role.id = r.id ?? r.use;
    const rid = role.id;
    if (!rid || !KEBAB.test(rid)) return errors.push(`role #${i + 1}: \`id\` must be kebab-case (got ${JSON.stringify(rid)})`);
    if (seen.has(rid)) errors.push(`role \`${rid}\` defined twice`);
    seen.add(rid);
    for (const key of ["title", "description", "mission"]) if (!role[key]) errors.push(`role \`${rid}\` needs \`${key}\``);
    if (!MODELS.includes(role.model)) errors.push(`role \`${rid}\`: model \`${role.model}\` not in ${MODELS.join(", ")}`);
    for (const skill of role.skills) if (!find("skills", skill, companyDir)) errors.push(`role \`${rid}\`: unknown skill \`${skill}\` (see \`${CMD} list skills\`)`);
    roles.push(role as Role);
  });
  if (!roles.length) errors.push("define at least one [[roles]] entry");

  const plugins = loadPlugins(raw.plugins ?? {}, defaults.plugins, roles, errors);

  const use: string[] = [...(raw.workflows?.use ?? defaults.workflows)];
  for (const name of use) if (!find("workflows", name, companyDir)) errors.push(`[workflows] unknown workflow \`${name}\` (see \`${CMD} list workflows\`)`);
  const workflows = { use: tb.enabled ? use : use.filter((w) => w !== "setup-board") };

  const office = loadOffice(raw.office ?? {}, co, roles, errors);
  if (errors.length) throw new ConfigError(errors.map((e) => `  - ${e}`).join("\n"));
  return {
    dir: companyDir, company: co, orchestrator: { title: "Chief of Staff", ...(raw.orchestrator ?? {}) },
    taskboard: tb, policy, gates, goals: raw.goals ?? [], roles, workflows, plugins, office,
  };
}

/** [plugins]: marketplace skills shared by the company, referenced by roles as "plugin:skill". */
function loadPlugins(own: Raw, base: Raw, roles: Role[], errors: string[]): Config["plugins"] {
  const markets: Record<string, string> = { ...base.marketplaces, ...(own.marketplaces ?? {}) };
  const enable: string[] = [...(own.enable ?? base.enable), ...(own.extra_enable ?? [])];
  const marketplaces: Record<string, MarketplaceSource> = {};
  for (const [name, spec] of Object.entries(markets)) {
    const src = marketplaceSource(spec);
    if (src) marketplaces[name] = src;
    else errors.push(`[plugins] marketplace \`${name}\`: \`${spec}\` must be github:owner/repo, git:<url> or path:<dir>`);
  }
  const enabled = new Set<string>();
  for (const item of enable) {
    const [plugin, market] = item.split("@");
    if (!plugin || !market || !(market in markets))
      errors.push(`[plugins] enable \`${item}\` must be plugin@marketplace with a marketplace from [plugins] marketplaces`);
    enabled.add(plugin);
  }
  for (const r of roles)
    for (const ps of r.plugin_skills) {
      const [plugin, skill] = ps.split(":");
      if (!enabled.has(plugin) || !skill) errors.push(`role \`${r.id}\`: plugin skill \`${ps}\` needs \`plugin:skill\` with \`${plugin}\` in [plugins] enable`);
    }
  return { marketplaces, enable };
}

/** [office]: the live view. Rooms default to one per role department. */
function loadOffice(own: Raw, co: Raw, roles: Role[], errors: string[]): Config["office"] {
  const office: Raw = {
    title: `${co.name} HQ`, subtitle: co.mission, port: 4477, theme: "auto", refresh_seconds: 5,
    events: ".office/events.jsonl", taskboard_url: "http://127.0.0.1:3010", ...own,
  };
  if (!["auto", "day", "night"].includes(office.theme)) errors.push(`[office] theme \`${office.theme}\` must be auto, day or night`);
  office.founder_look = checkLook("founder", "[office] founder_look", own.founder_look, errors);
  office.orchestrator_look = checkLook("orchestrator", "[office] orchestrator_look", own.orchestrator_look, errors);

  const ids = roles.map((r) => r.id);
  let rooms: Room[] = own.rooms;
  if (!rooms) {
    const depts = new Map<string, string[]>();
    for (const r of roles) depts.set(r.department ?? "team", [...(depts.get(r.department ?? "team") ?? []), r.id]);
    rooms = [...depts].map(([id, roleIds]) => ({ id, title: titleCase(id), roles: roleIds }));
  }
  rooms = rooms.map((r) => ({ ...r, title: r.title ?? titleCase(r.id ?? ""), roles: r.roles ?? [] }));
  const placed = new Map<string, string>();
  for (const room of rooms) {
    if (!KEBAB.test(room.id ?? "") || ["founder", "hub"].includes(room.id))
      errors.push(`[[office.rooms]] id ${JSON.stringify(room.id)} must be kebab-case and not \`founder\` or \`hub\``);
    if (room.floor !== undefined && !HEX.test(room.floor)) errors.push(`room \`${room.id}\`: floor \`${room.floor}\` must be a #rrggbb color`);
    for (const role of room.roles) {
      if (!ids.includes(role)) errors.push(`room \`${room.id}\`: unknown role \`${role}\``);
      else if (placed.has(role)) errors.push(`role \`${role}\` is in rooms \`${placed.get(role)}\` and \`${room.id}\`; pick one`);
      placed.set(role, room.id);
    }
  }
  const unplaced = ids.filter((id) => !placed.has(id));
  if (unplaced.length) {
    rooms.push({ id: "floor", title: "Open floor", roles: unplaced });
    unplaced.forEach((id) => placed.set(id, "floor"));
  }
  for (const r of roles) {
    r.room = placed.get(r.id)!;
    r.look = checkLook(r.id, `role \`${r.id}\``, r.look as Raw | undefined, errors);
  }
  office.rooms = rooms;
  return office as Config["office"];
}
