// Shapes shared by the office UI and scene; they mirror what src/office.ts sends.
export type Theme = "auto" | "day" | "night";
export interface Look { shirt: string; skin: string; hair: string; hair_style: string; accessory: string }
export interface Pt { x: number; y: number }

export interface PersonInfo {
  id: string;
  title: string;
  kind: "human" | "orchestrator" | "agent" | "guest";
  room?: string;
  model?: string;
  look: Look;
  mission?: string;
}

export interface Ticket { key: string; lane: string; role: string; title: string; priority?: string; blocked?: boolean }
export interface Approval { id: string; role: string; title: string }
export interface Handoff { file: string; ticket: string; role: string; at: number }
export interface RoomConfig { id: string; title: string; roles: string[]; floor?: string }

/** One line from .office/events.jsonl, written by the Claude Code hook. */
export interface HookEvent {
  ts: number;
  ev: string;
  agent: string;
  aid?: string;
  tool?: string;
  label?: string;
  sub?: string;
  kind?: string;
}

export interface Snapshot {
  office: { title: string; subtitle: string; theme: Theme; rooms: RoomConfig[]; board_url: string | null };
  company: { name: string; mission: string; prefix: string };
  lanes: string[];
  people: PersonInfo[];
  tickets: Ticket[];
  board_error: string | null;
  config_error?: string | null;
  approvals: Approval[];
  handoffs: Handoff[];
  goals: string[];
  events?: HookEvent[];
  offset?: number;
}

export interface FeedItem { ts: number; text: string; id: string }
