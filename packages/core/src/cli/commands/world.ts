/**
 * World Command — ASCII animated agent world for SecureYeoman.
 *
 * Renders a full-screen ASCII "office" where each personality appears as an
 * animated character at their own workstation. In world-map mode (--size
 * normal|large) personalities move between named zones (Workspace, Meeting
 * Room, Break Room, Server Room) via BFS pathfinding; the world mood drives
 * animation speed and palette.
 *
 * Usage:
 *   secureyeoman world [--url URL] [--fps N] [--size compact|normal|large] [--speed slow|normal|fast]
 *
 * Key bindings:
 *   q / Ctrl+C   Quit
 *   r            Refresh personality list
 *   ↑ / ↓        Scroll activity log
 */

import * as readline from 'node:readline';
import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag, extractFlag, extractCommonFlags, apiCall } from '../utils.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

const A = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  // Foreground
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  cyan: `${CSI}36m`,
  brightBlack: `${CSI}90m`,
  brightCyan: `${CSI}96m`,
  brightGreen: `${CSI}92m`,
  brightYellow: `${CSI}93m`,
  brightMagenta: `${CSI}95m`,
  // Cursor
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  save: `${ESC}7`,
  restore: `${ESC}8`,
  // Screen
  clear: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  home: `${CSI}H`,
  altScreenOn: `${CSI}?1049h`,
  altScreenOff: `${CSI}?1049l`,
};

function moveTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[^m]*m/g, '');
}

/** Center `content` visually within `width` columns (ANSI-aware). Exported for tests. */
export function centerIn(content: string, width: number): string {
  const visual = stripAnsi(content).length;
  const extra = Math.max(0, width - visual);
  const left = Math.floor(extra / 2);
  const right = extra - left;
  return ' '.repeat(left) + content + ' '.repeat(right);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// ── World map types ────────────────────────────────────────────────────────────

export type ZoneId = 'workspace' | 'meeting' | 'server-room' | 'break-room';
export type WorldSize = 'compact' | 'normal' | 'large';
export type WorldMood = 'calm' | 'productive' | 'busy' | 'alert' | 'celebration';

export interface WorldPos { row: number; col: number; }

export interface FloorPlan {
  rows: string[];
  walkable: Set<string>;          // "row,col" keys (0-indexed, 0=border)
  desks: WorldPos[];
  zoneOf: Map<string, ZoneId>;   // "row,col" → zone
  zoneWaypoints: Record<ZoneId, WorldPos>;
  serverRackPos?: WorldPos;
  coffeePos?: WorldPos;
  whiteboardRow?: number;
}

export interface AgentPos {
  personalityId: string;
  pos: WorldPos;
  home: WorldPos;
  destZone: ZoneId;
  path: WorldPos[];
}

// ── Agent state machine ────────────────────────────────────────────────────────

type AgentState = 'idle' | 'thinking' | 'typing' | 'talking' | 'offline';

interface AnimFrame {
  face: string; // 3-char content rendered between ║…║
  extra: string; // bottom-of-body decoration (empty string = blank row)
}

// Four frames per state — advance at fps/4 for gentle animation
const FRAMES: Record<AgentState, AnimFrame[]> = {
  idle: [
    { face: 'o.o', extra: '' },
    { face: 'o.o', extra: '' },
    { face: '-.-', extra: '' }, // blink frame
    { face: 'o.o', extra: '' },
  ],
  thinking: [
    { face: '>.<', extra: '·..' },
    { face: '>.<', extra: '.·.' },
    { face: '>.<', extra: '..·' },
    { face: '>.<', extra: '···' },
  ],
  typing: [
    { face: '^_^', extra: '≡≡≡≡' },
    { face: '^_^', extra: '════' },
    { face: '^v^', extra: '≡≡≡≡' },
    { face: '^_^', extra: '════' },
  ],
  talking: [
    { face: '°‿°', extra: '' },
    { face: '°‿°', extra: '' },
    { face: 'OwO', extra: '' },
    { face: '°‿°', extra: '' },
  ],
  offline: [
    { face: 'x_x', extra: 'zz' },
    { face: 'x_x', extra: 'Zz' },
    { face: 'x_x', extra: 'ZZ' },
    { face: 'x_x', extra: 'zZ' },
  ],
};

const STATE_LABEL: Record<AgentState, string> = {
  idle: 'idle',
  thinking: 'thinking',
  typing: 'writing',
  talking: 'talking',
  offline: 'offline',
};

const STATE_COLOR: Record<AgentState, string> = {
  idle: A.brightBlack,
  thinking: A.brightYellow,
  typing: A.brightCyan,
  talking: A.brightGreen,
  offline: A.brightBlack,
};

const STATE_BORDER: Record<AgentState, string> = {
  idle: A.brightBlack,
  thinking: A.yellow,
  typing: A.cyan,
  talking: A.green,
  offline: A.dim,
};

// ── Data types ─────────────────────────────────────────────────────────────────

interface Personality {
  id: string;
  name: string;
  isActive: boolean;
  body?: { enabled?: boolean };
}

interface RunningTask {
  id: string;
  personalityId?: string;
  status: string;
  title?: string;
  name?: string;
  startedAt?: number;
  createdAt?: number;
  type?: string;
  correlationId?: string;
}

interface AuditEntry {
  id: string;
  type?: string;
  action?: string;
  actorId?: string;
  timestamp?: number;
  createdAt?: number;
}

// ── Layout ─────────────────────────────────────────────────────────────────────

const CARD_INNER_W = 14; // visual width between │ borders
const CARD_H = 10; // total rows including top/bottom border
const CARD_GAP = 2; // columns between cards
const CARD_LEFT_MARGIN = 1;

const HEADER_H = 2;
const LOG_H = 6; // includes the "── Activity" divider line
const FOOTER_H = 2; // hints row + blank

const MAP_START_ROW = HEADER_H + 1; // row 3 (1-indexed terminal)

// ── Floor plan builder ─────────────────────────────────────────────────────────

/** Build a floor plan for the given world size. Exported for tests. */
export function buildFloorPlan(size: WorldSize): FloorPlan {
  switch (size) {
    case 'compact': return buildCompactPlan();
    case 'large': return buildLargePlan();
    default: return buildNormalPlan();
  }
}

function buildCompactPlan(): FloorPlan {
  // 60 chars wide, 10 rows
  const iw = 58; // inner width (between borders)
  const deskContent = '   \u2310    \u2310    \u2310    \u2310    \u2310    \u2310'; // ⌐ chars
  const deskRow = '\u2502' + deskContent + ' '.repeat(iw - deskContent.length) + '\u2502';

  const rows: string[] = [
    '\u250c' + '\u2500'.repeat(iw) + '\u2510',           // ┌──┐
    '\u2502  WORKSPACE' + ' '.repeat(iw - 11) + '\u2502',
    '\u2502' + ' '.repeat(iw) + '\u2502',
    deskRow,
    deskRow,
    '\u2502' + ' '.repeat(iw) + '\u2502',
    '\u2502' + ' '.repeat(iw) + '\u2502',
    '\u2502' + ' '.repeat(iw) + '\u2502',
    '\u2502' + ' '.repeat(iw) + '\u2502',
    '\u2514' + '\u2500'.repeat(iw) + '\u2518',           // └──┘
  ];

  const walkable = new Set<string>();
  const zoneOf = new Map<string, ZoneId>();
  for (let r = 1; r <= 8; r++) {
    for (let c = 1; c <= iw - 1; c++) {
      const key = `${r},${c}`;
      walkable.add(key);
      zoneOf.set(key, 'workspace');
    }
  }

  // Desks: 2 rows, 6 per row. Desk chars at cols 4,9,14,19,24,29 in the string.
  const desks: WorldPos[] = [];
  for (const r of [3, 4]) {
    for (const c of [4, 9, 14, 19, 24, 29]) {
      desks.push({ row: r, col: c });
    }
  }

  const wp: WorldPos = { row: 3, col: 18 };
  return {
    rows,
    walkable,
    desks,
    zoneOf,
    zoneWaypoints: {
      workspace: wp,
      meeting: wp,
      'server-room': wp,
      'break-room': wp,
    },
  };
}

function buildNormalPlan(): FloorPlan {
  // 80 chars wide, 12 rows
  // Vertical divider at col 39; horizontal divider at row 5
  const liw = 38; // left inner width (cols 1–38)
  const riw = 39; // right inner width (cols 40–78)

  const deskLeft = '   \u2310   \u2310   \u2310'; // 12 chars (desks at cols 4, 8, 12)
  const wbRight = '  ' + '\u2500'.repeat(riw - 4) + '  '; // whiteboard line, 39 chars
  const srvRack = '   \u2593\u2593  \u2593\u2593'; // 9 chars (▓▓ chars)
  const coffeeRight = ' '.repeat(20) + '\u2615' + ' '.repeat(18); // ☕ at col 60
  const plantRight = ' '.repeat(20) + '\u2663' + ' '.repeat(18); // ♣

  const li = (s: string) => s + ' '.repeat(liw - s.length); // pad to left inner width
  const ri = (s: string) => s + ' '.repeat(riw - s.length); // pad to right inner width

  const rows: string[] = [
    '\u250c' + '\u2500'.repeat(liw) + '\u252c' + '\u2500'.repeat(riw) + '\u2510', // ┌──┬──┐
    '\u2502' + li('  WORKSPACE') + '\u2502' + ri('  MEETING ROOM') + '\u2502',
    '\u2502' + li(deskLeft) + '\u2502' + wbRight + '\u2502',
    '\u2502' + li(deskLeft) + '\u2502' + ri('') + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u251c' + '\u2500'.repeat(liw) + '\u253c' + '\u2500'.repeat(riw) + '\u2524', // ├──┼──┤
    '\u2502' + li('  SERVER ROOM') + '\u2502' + ri('  BREAK ROOM') + '\u2502',
    '\u2502' + li(srvRack) + '\u2502' + coffeeRight + '\u2502',
    '\u2502' + li('') + '\u2502' + plantRight + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u2514' + '\u2500'.repeat(liw) + '\u2534' + '\u2500'.repeat(riw) + '\u2518', // └──┴──┘
  ];

  // Walkable: all inner cells (1–10, 1–78), including divider col 39 as doorway
  const walkable = new Set<string>();
  const zoneOf = new Map<string, ZoneId>();
  for (let r = 1; r <= 10; r++) {
    for (let c = 1; c <= 78; c++) {
      walkable.add(`${r},${c}`);
      // Assign zones; corridor rows/cols left unassigned
      if (r >= 1 && r <= 4 && c >= 1 && c <= 38) zoneOf.set(`${r},${c}`, 'workspace');
      else if (r >= 1 && r <= 4 && c >= 40 && c <= 78) zoneOf.set(`${r},${c}`, 'meeting');
      else if (r >= 7 && r <= 10 && c >= 1 && c <= 38) zoneOf.set(`${r},${c}`, 'server-room');
      else if (r >= 7 && r <= 10 && c >= 40 && c <= 78) zoneOf.set(`${r},${c}`, 'break-room');
    }
  }

  // Desks: rows 2–3, cols 4, 8, 12 (workspace)
  const desks: WorldPos[] = [];
  for (const r of [2, 3]) {
    for (const c of [4, 8, 12]) {
      desks.push({ row: r, col: c });
    }
  }

  return {
    rows,
    walkable,
    desks,
    zoneOf,
    zoneWaypoints: {
      workspace: { row: 3, col: 9 },
      meeting: { row: 3, col: 60 },
      'server-room': { row: 8, col: 9 },
      'break-room': { row: 8, col: 60 },
    },
    serverRackPos: { row: 7, col: 4 },
    coffeePos: { row: 7, col: 60 },
    whiteboardRow: 2,
  };
}

function buildLargePlan(): FloorPlan {
  // 120 chars wide, 16 rows
  // Vertical divider at col 59; horizontal divider at row 8
  const liw = 58; // left inner width
  const riw = 59; // right inner width

  const deskLeft = '   \u2310        \u2310        \u2310        \u2310'; // 4 desks (cols 4,13,22,31)
  const wbRight = '  ' + '\u2500'.repeat(riw - 4) + '  '; // whiteboard line
  const srvRack = '   \u2593\u2593  \u2593\u2593  \u2593\u2593'; // 3 server racks

  const li = (s: string) => s + ' '.repeat(Math.max(0, liw - s.length));
  const ri = (s: string) => s + ' '.repeat(Math.max(0, riw - s.length));

  const coffeeRight = ' '.repeat(28) + '\u2615' + ' '.repeat(30); // ☕ at col ~88
  const plantRight = ' '.repeat(28) + '\u2663' + ' '.repeat(30);  // ♣

  const rows: string[] = [
    '\u250c' + '\u2500'.repeat(liw) + '\u252c' + '\u2500'.repeat(riw) + '\u2510',
    '\u2502' + li('  WORKSPACE') + '\u2502' + ri('  MEETING ROOM') + '\u2502',
    '\u2502' + li(deskLeft) + '\u2502' + wbRight + '\u2502',
    '\u2502' + li(deskLeft) + '\u2502' + ri('') + '\u2502',
    '\u2502' + li(deskLeft) + '\u2502' + ri('') + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u251c' + '\u2500'.repeat(liw) + '\u253c' + '\u2500'.repeat(riw) + '\u2524',
    '\u2502' + li('  SERVER ROOM') + '\u2502' + ri('  BREAK ROOM') + '\u2502',
    '\u2502' + li(srvRack) + '\u2502' + coffeeRight + '\u2502',
    '\u2502' + li('') + '\u2502' + plantRight + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u2502' + li('') + '\u2502' + ri('') + '\u2502',
    '\u2514' + '\u2500'.repeat(liw) + '\u2534' + '\u2500'.repeat(riw) + '\u2518',
  ];

  const walkable = new Set<string>();
  const zoneOf = new Map<string, ZoneId>();
  for (let r = 1; r <= 14; r++) {
    for (let c = 1; c <= 118; c++) {
      walkable.add(`${r},${c}`);
      if (r >= 1 && r <= 7 && c >= 1 && c <= 58) zoneOf.set(`${r},${c}`, 'workspace');
      else if (r >= 1 && r <= 7 && c >= 60 && c <= 118) zoneOf.set(`${r},${c}`, 'meeting');
      else if (r >= 9 && r <= 14 && c >= 1 && c <= 58) zoneOf.set(`${r},${c}`, 'server-room');
      else if (r >= 9 && r <= 14 && c >= 60 && c <= 118) zoneOf.set(`${r},${c}`, 'break-room');
    }
  }

  // Desks: rows 2–4, cols 4, 13, 22, 31 (workspace)
  const desks: WorldPos[] = [];
  for (const r of [2, 3, 4]) {
    for (const c of [4, 13, 22, 31]) {
      desks.push({ row: r, col: c });
    }
  }

  return {
    rows,
    walkable,
    desks,
    zoneOf,
    zoneWaypoints: {
      workspace: { row: 3, col: 18 },
      meeting: { row: 3, col: 90 },
      'server-room': { row: 11, col: 18 },
      'break-room': { row: 11, col: 90 },
    },
    serverRackPos: { row: 10, col: 4 },
    coffeePos: { row: 10, col: 88 },
    whiteboardRow: 2,
  };
}

// ── BFS Pathfinder ─────────────────────────────────────────────────────────────

/**
 * Find shortest path from `from` to `to` over the walkable set.
 * Returns steps excluding start; empty if already at destination or unreachable.
 * Exported for tests.
 */
export function findPath(
  walkable: Set<string>,
  from: WorldPos,
  to: WorldPos
): WorldPos[] {
  if (from.row === to.row && from.col === to.col) return [];

  const key = (p: WorldPos) => `${p.row},${p.col}`;

  if (!walkable.has(key(to))) return [];

  const visited = new Set<string>([key(from)]);
  const queue: WorldPos[][] = [[from]];
  const cap = walkable.size * 4;
  let iterations = 0;

  const DIRS: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    iterations++;
    if (iterations > cap) break;

    const path = queue.shift()!;
    const cur = path[path.length - 1]!;

    for (const [dr, dc] of DIRS) {
      const next: WorldPos = { row: cur.row + dr, col: cur.col + dc };
      const nk = key(next);
      if (!walkable.has(nk) || visited.has(nk)) continue;
      const newPath = [...path, next];
      if (next.row === to.row && next.col === to.col) return newPath.slice(1);
      visited.add(nk);
      queue.push(newPath);
    }
  }

  return []; // unreachable
}

// ── World mood ─────────────────────────────────────────────────────────────────

/**
 * Derive the world mood from current system state.
 * Priority: celebration > alert > busy > productive > calm.
 * Exported for tests.
 */
export function computeMood(
  tasks: RunningTask[],
  events: AuditEntry[],
  celebrationUntil: number,
  now: number
): WorldMood {
  if (now < celebrationUntil) return 'celebration';

  const securityEvent = events.some((e) => {
    const ts = e.timestamp ?? e.createdAt ?? 0;
    const age = now - ts;
    const action = (e.type ?? e.action ?? '').toLowerCase();
    return age < 5 * 60_000 && action.includes('security');
  });
  if (securityEvent) return 'alert';

  const running = tasks.filter((t) => t.status === 'running');
  if (running.length > 4) return 'busy';
  if (running.length > 0) return 'productive';
  return 'calm';
}

// ── Meeting pair detection ─────────────────────────────────────────────────────

function computeMeetingPairs(tasks: RunningTask[]): Set<string> {
  const pairs = new Set<string>();
  const running = tasks.filter((t) => t.status === 'running');

  // Group by correlationId — if ≥2 different personalities share one, all are meeting
  const byCorr = new Map<string, string[]>();
  for (const t of running) {
    if (t.correlationId && t.personalityId) {
      const group = byCorr.get(t.correlationId) ?? [];
      group.push(t.personalityId);
      byCorr.set(t.correlationId, group);
    }
  }
  for (const [, pids] of byCorr) {
    const unique = [...new Set(pids)];
    if (unique.length >= 2) {
      for (const pid of unique) pairs.add(pid);
    }
  }

  // A2A tasks: task type includes 'a2a'
  for (const t of running) {
    if (t.type?.includes('a2a') && t.personalityId) {
      pairs.add(t.personalityId);
    }
  }

  return pairs;
}

// ── Zone routing ───────────────────────────────────────────────────────────────

function targetZoneForAgent(
  state: AgentState,
  personalityId: string,
  meetingPairs: Set<string>,
  idleSince: Map<string, number>,
  now: number,
  tasks: RunningTask[]
): ZoneId {
  if (state === 'offline') return 'workspace';
  if (meetingPairs.has(personalityId)) return 'meeting';

  // System health tasks → server room
  const sysTask = tasks.find(
    (t) =>
      t.status === 'running' &&
      t.personalityId === personalityId &&
      (t.type === 'system_health' || t.type?.includes('health'))
  );
  if (sysTask) return 'server-room';

  if (state === 'typing' || state === 'thinking' || state === 'talking') return 'workspace';

  // Idle for > 60 s → break room
  const since = idleSince.get(personalityId);
  if (since !== undefined && now - since > 60_000) return 'break-room';

  return 'workspace';
}

// ── WorldRenderer ──────────────────────────────────────────────────────────────

interface AgentCard {
  personality: Personality;
  state: AgentState;
  taskLabel: string;
  frame: number;
}

class WorldRenderer {
  private readonly out: NodeJS.WriteStream;
  rows: number;
  cols: number;

  private agents: AgentCard[] = [];
  private log: string[] = [];
  private logScroll = 0;
  private serverStatus = 'connecting…';
  // Per-personality frame counters, staggered so agents don't blink in sync
  private readonly frames = new Map<string, number>();

  constructor(out: NodeJS.WriteStream) {
    this.out = out;
    this.rows = out.rows ?? 24;
    this.cols = out.columns ?? 80;
  }

  onResize(): void {
    this.rows = this.out.rows ?? 24;
    this.cols = this.out.columns ?? 80;
  }

  private write(s: string): void {
    this.out.write(s);
  }

  cardsPerRow(): number {
    const cardTotalW = CARD_INNER_W + 2 + CARD_GAP; // inner + borders + gap
    return Math.max(1, Math.floor((this.cols - CARD_LEFT_MARGIN) / cardTotalW));
  }

  maxCardRows(): number {
    const worldH = this.rows - HEADER_H - LOG_H - FOOTER_H;
    return Math.max(1, Math.floor(worldH / CARD_H));
  }

  // ── Frame management ───────────────────────────────────────────────────────

  ensureFrame(personalityId: string): void {
    if (!this.frames.has(personalityId)) {
      // Stagger initial frames so agents animate out of phase
      this.frames.set(personalityId, Math.floor(Math.random() * 4));
    }
  }

  getFrame(personalityId: string): number {
    return this.frames.get(personalityId) ?? 0;
  }

  advanceTick(): void {
    for (const [id, f] of this.frames) {
      this.frames.set(id, (f + 1) % 4);
    }
  }

  // ── Mutation helpers ───────────────────────────────────────────────────────

  setAgents(cards: AgentCard[]): void {
    this.agents = cards;
  }

  setServerStatus(s: string): void {
    this.serverStatus = s;
  }

  addLog(line: string): void {
    this.log.push(line);
    if (this.log.length > 300) this.log.shift();
  }

  scrollLog(delta: number): void {
    const visible = LOG_H - 1;
    const max = Math.max(0, this.log.length - visible);
    this.logScroll = Math.max(0, Math.min(max, this.logScroll + delta));
  }

  // ── Render (card-grid mode) ────────────────────────────────────────────────

  render(): void {
    this.write(A.hide + A.save);
    this.renderHeader();
    this.renderWorld();
    this.renderLog();
    this.renderFooter();
    this.write(A.restore + A.show);
  }

  // ── World map render ───────────────────────────────────────────────────────

  /**
   * Full-frame render for world-map mode. Replaces renderWorld() with the floor
   * plan + agent overlays. Header, log, and footer are still rendered.
   */
  renderMap(
    plan: FloorPlan,
    agentPositions: Map<string, AgentPos>,
    cards: AgentCard[],
    mood: WorldMood,
    meetingPairs: Set<string>,
    activeTaskName: string,
    celebTick: number
  ): void {
    this.write(A.hide + A.save);
    this.renderHeader();
    this.renderWorldMap(plan, agentPositions, cards, mood, meetingPairs, activeTaskName, celebTick);
    this.renderLog();
    this.renderFooter();
    this.write(A.restore + A.show);
  }

  renderWorldMap(
    plan: FloorPlan,
    agentPositions: Map<string, AgentPos>,
    cards: AgentCard[],
    mood: WorldMood,
    meetingPairs: Set<string>,
    activeTaskName: string,
    celebTick: number
  ): void {
    // 1. Render floor plan rows
    for (let r = 0; r < plan.rows.length; r++) {
      this.write(moveTo(MAP_START_ROW + r, 1) + A.clearLine);
      let row = plan.rows[r]!;
      // Alert: color server rack red
      if (mood === 'alert' && plan.serverRackPos && r === plan.serverRackPos.row) {
        row = row.replace('\u2593\u2593', A.red + '\u2593\u2593' + A.reset);
      }
      this.write(row);
    }

    // 2. Whiteboard text in meeting room
    if (plan.whiteboardRow !== undefined && activeTaskName) {
      const col = plan.zoneWaypoints['meeting'].col - 8;
      const text = truncate(activeTaskName, 20);
      this.write(
        moveTo(MAP_START_ROW + plan.whiteboardRow, Math.max(2, col)) +
          A.yellow + text + A.reset
      );
    }

    // 3. Celebration stars (seeded by celebTick)
    if (mood === 'celebration') {
      const starPositions: WorldPos[] = [
        { row: 1, col: 10 },
        { row: 1, col: 50 },
        { row: 3, col: 25 },
        { row: 3, col: 65 },
      ];
      for (const s of starPositions) {
        const col = s.col + (celebTick % 3);
        const row = s.row + (celebTick % 2);
        if (row > 0 && row < plan.rows.length - 1) {
          this.write(moveTo(MAP_START_ROW + row, col) + A.brightYellow + '\u2605' + A.reset);
        }
      }
    }

    // 4. Desk glow: agent at home desk and typing
    for (const [pid, ap] of agentPositions) {
      const card = cards.find((c) => c.personality.id === pid);
      if (
        card?.state === 'typing' &&
        ap.pos.row === ap.home.row &&
        ap.pos.col === ap.home.col
      ) {
        this.write(moveTo(MAP_START_ROW + ap.pos.row, ap.pos.col) + A.brightCyan + '*' + A.reset);
      }
    }

    // 5. Agent sprites: [face] with state color
    for (const [pid, ap] of agentPositions) {
      const card = cards.find((c) => c.personality.id === pid);
      if (!card) continue;
      const f = FRAMES[card.state][card.frame % 4]!;
      const sc = STATE_COLOR[card.state];
      const inMeeting = meetingPairs.has(pid);
      const bracket = inMeeting ? A.yellow : sc;
      this.write(
        moveTo(MAP_START_ROW + ap.pos.row, ap.pos.col) +
          bracket + '[' + sc + f.face + bracket + ']' + A.reset
      );
    }

    // 6. Speech bubbles for meeting pairs
    const meetingAgents = [...agentPositions.entries()].filter(([pid]) =>
      meetingPairs.has(pid)
    );
    if (meetingAgents.length >= 2 && activeTaskName) {
      const [, ap] = meetingAgents[0]!;
      const bubbleRow = MAP_START_ROW + ap.pos.row - 3;
      const bubbleCol = Math.max(2, ap.pos.col);
      const text = truncate(activeTaskName, 12);
      const lineLen = text.length + 2;
      if (bubbleRow >= 1) {
        this.write(
          moveTo(bubbleRow, bubbleCol) + A.yellow +
            '\u256d' + '\u2500'.repeat(lineLen) + '\u256e' + A.reset
        );
        this.write(
          moveTo(bubbleRow + 1, bubbleCol) + A.yellow +
            '\u2502 ' + text + ' \u2502' + A.reset
        );
        this.write(
          moveTo(bubbleRow + 2, bubbleCol) + A.yellow +
            '\u2570' + '\u2500'.repeat(lineLen) + '\u256f' + A.reset
        );
      }
    }
  }

  private renderHeader(): void {
    const w = this.cols;

    const title = `${A.bold}${A.cyan} AGENT WORLD${A.reset}`;
    const sub = `${A.dim}  ·  SecureYeoman${A.reset}`;
    const right = `${A.dim}r refresh  q quit${A.reset} `;

    const titlePlain = ' AGENT WORLD  ·  SecureYeoman';
    const rightPlain = 'r refresh  q quit ';
    const fill = Math.max(0, w - titlePlain.length - rightPlain.length);

    this.write(moveTo(1, 1) + A.clearLine);
    this.write(title + sub + ' '.repeat(fill) + right);

    // Status bar
    const dot =
      this.serverStatus === 'ok'
        ? `${A.green}●${A.reset}`
        : this.serverStatus === 'connecting…'
          ? `${A.yellow}◌${A.reset}`
          : `${A.red}●${A.reset}`;

    const n = this.agents.length;
    const agentStr = `${A.dim}${n} agent${n !== 1 ? 's' : ''}${A.reset}`;
    const divider = `${A.dim}${'─'.repeat(Math.max(0, w - 18))}${A.reset}`;

    this.write(moveTo(2, 1) + A.clearLine);
    this.write(`  ${dot}  ${agentStr}  ${divider}`);
  }

  private renderWorld(): void {
    const startRow = HEADER_H + 1;
    const cpr = this.cardsPerRow();
    const maxRows = this.maxCardRows();
    const worldH = maxRows * CARD_H;

    // Clear world area
    for (let r = 0; r < worldH; r++) {
      this.write(moveTo(startRow + r, 1) + A.clearLine);
    }

    if (this.agents.length === 0) {
      this.write(moveTo(startRow + 2, 3));
      this.write(`${A.dim}No agents found — is the server running? (press r to retry)${A.reset}`);
      return;
    }

    for (let i = 0; i < this.agents.length; i++) {
      const cardRow = Math.floor(i / cpr);
      if (cardRow >= maxRows) break;
      const cardCol = i % cpr;
      const topRow = startRow + cardRow * CARD_H;
      const leftCol = CARD_LEFT_MARGIN + cardCol * (CARD_INNER_W + 2 + CARD_GAP);
      this.renderCard(this.agents[i]!, topRow, leftCol);
    }
  }

  private renderCard(agent: AgentCard, row: number, col: number): void {
    const w = CARD_INNER_W;
    const f = FRAMES[agent.state][agent.frame % 4]!;
    const sc = STATE_COLOR[agent.state];
    const bc = STATE_BORDER[agent.state];
    const off = agent.state === 'offline';

    const name = truncate(agent.personality.name, w - 1);
    const label = STATE_LABEL[agent.state];
    const task = agent.taskLabel ? truncate(agent.taskLabel, w) : '';

    const lb = `${bc}│${A.reset}`; // left border
    const rb = `${bc}│${A.reset}`; // right border

    // Inner content — each string must have visual width exactly `w`
    const nameStr = centerIn(`${off ? A.dim : A.bold}${name}${A.reset}`, w);
    const headTop = centerIn('╔═══╗', w);
    const faceStr = centerIn(`║${sc}${f.face}${A.reset}║`, w);
    const headBot = centerIn('╚═══╝', w);
    const bodyStr = centerIn('/||\\', w);
    const extraStr = f.extra.trim()
      ? centerIn(`${off ? A.dim : ''}[${f.extra}]${A.reset}`, w)
      : ' '.repeat(w);
    const labelStr = centerIn(`${sc}${label}${A.reset}`, w);
    const taskStr = task
      ? centerIn(`${A.dim}${task}${A.reset}`, w)
      : ' '.repeat(w);

    const lines: string[] = [
      `${bc}┌${'─'.repeat(w)}┐${A.reset}`,
      `${lb}${nameStr}${rb}`,
      `${lb}${off ? A.dim : ''}${headTop}${off ? A.reset : ''}${rb}`,
      `${lb}${off ? A.dim : ''}${faceStr}${off ? A.reset : ''}${rb}`,
      `${lb}${off ? A.dim : ''}${headBot}${off ? A.reset : ''}${rb}`,
      `${lb}${off ? A.dim : ''}${bodyStr}${off ? A.reset : ''}${rb}`,
      `${lb}${extraStr}${rb}`,
      `${lb}${labelStr}${rb}`,
      `${lb}${taskStr}${rb}`,
      `${bc}└${'─'.repeat(w)}┘${A.reset}`,
    ];

    for (let r = 0; r < lines.length; r++) {
      this.write(moveTo(row + r, col) + (lines[r] ?? ''));
    }
  }

  private renderLog(): void {
    const w = this.cols;
    const startRow = this.rows - LOG_H - FOOTER_H + 1;

    // Divider
    this.write(moveTo(startRow, 1) + A.clearLine);
    this.write(`${A.dim}── Activity ${'─'.repeat(Math.max(0, w - 13))}${A.reset}`);

    const visible = LOG_H - 1;
    const total = this.log.length;
    const start = Math.max(0, total - visible - this.logScroll);
    const slice = this.log.slice(start, start + visible);

    for (let i = 0; i < visible; i++) {
      this.write(moveTo(startRow + 1 + i, 1) + A.clearLine);
      if (i < slice.length) {
        this.write('  ' + slice[i]!);
      }
    }
  }

  private renderFooter(): void {
    const hintRow = this.rows;
    this.write(moveTo(hintRow, 1) + A.clearLine);
    const hints = [
      `${A.dim}↑↓${A.reset} scroll log`,
      `${A.dim}r${A.reset} refresh`,
      `${A.dim}q${A.reset} quit`,
    ].join('   ');
    this.write('  ' + hints);
  }
}

// ── State derivation ───────────────────────────────────────────────────────────

/** Exported for unit tests. */
export function deriveState(
  p: Personality,
  tasks: RunningTask[],
  talkingUntil: Map<string, number>,
  now: number
): { state: AgentState; taskLabel: string } {
  if (!p.isActive) {
    return { state: 'offline', taskLabel: 'inactive' };
  }

  const running = tasks.find((t) => t.personalityId === p.id && t.status === 'running');
  if (running) {
    const taskName = running.title ?? running.name ?? 'task';
    const age = now - (running.startedAt ?? running.createdAt ?? now);
    // New tasks appear as "thinking" for the first 2 seconds, then "typing" (writing)
    const state: AgentState = age < 2_000 ? 'thinking' : 'typing';
    return { state, taskLabel: taskName };
  }

  const talkExpiry = talkingUntil.get(p.id);
  if (talkExpiry && talkExpiry > now) {
    return { state: 'talking', taskLabel: 'responded' };
  }

  return { state: 'idle', taskLabel: '' };
}

function fmtTime(ts: number | undefined): string {
  if (!ts) return '??:??';
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ── Main command ───────────────────────────────────────────────────────────────

export const worldCommand: Command = {
  name: 'world',
  aliases: ['w'],
  description: 'ASCII animated agent world — watch your personalities come alive',
  usage: 'secureyeoman world [--url URL] [--fps N] [--size compact|normal|large] [--speed slow|normal|fast]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

A full-screen ASCII animated office where each SecureYeoman personality
appears as a live character at their own workstation. In world-map mode
(--size normal or large) personalities move between zones via BFS pathfinding
and converge in the meeting room when running shared tasks.

Character states:
  idle      (o.o)  Resting quietly
  thinking  (>.<)  Processing — recent task start
  writing   (^_^)  Actively running a task [keyboard]
  talking   (°‿°)  Recently responded in chat
  offline   (x_x)  Personality inactive

World zones (--size normal/large):
  Workspace     Default — agents work at their desks
  Meeting Room  Agents with shared tasks converge here
  Server Room   Agents running system health tasks
  Break Room    Idle agents after 60 s of inactivity

World mood:
  calm          No active tasks
  productive    Some tasks running
  busy          5+ tasks running (faster animation)
  alert         Recent security event (red server rack)
  celebration   Task just completed

Key bindings:
  q / Ctrl+C   Quit
  r            Refresh personality list
  ↑ / ↓        Scroll activity log

Options:
      --url <url>               Server URL (default: http://127.0.0.1:3000)
      --fps <n>                 Animation frames per second 1–16 (default: 4)
      --size compact|normal|large  World size (default: normal)
      --speed slow|normal|fast     Animation speed preset (overrides mood speed)
  -h, --help                   Show this help

`);
      return 0;
    }
    argv = helpResult.rest;

    if (!process.stdout.isTTY) {
      ctx.stderr.write('Error: world requires an interactive terminal (TTY).\n');
      return 1;
    }

    const { baseUrl, rest: argv2 } = extractCommonFlags(argv);
    argv = argv2;

    const { value: fpsStr, rest: argv3 } = extractFlag(argv, 'fps');
    argv = argv3;

    const { value: sizeStr, rest: argv4 } = extractFlag(argv, 'size');
    argv = argv4;

    const { value: speedStr, rest: argv5 } = extractFlag(argv, 'speed');
    argv = argv5;
    void argv; // consumed

    const size: WorldSize = (['compact', 'normal', 'large'].includes(sizeStr ?? ''))
      ? (sizeStr as WorldSize)
      : 'normal';

    const speedOverride: number | null =
      speedStr === 'slow' ? 2
      : speedStr === 'fast' ? 8
      : speedStr === 'normal' ? 4
      : null;

    const fps = Math.min(16, Math.max(1, parseInt(fpsStr ?? '4', 10) || 4));
    const frameMs = Math.floor(1000 / fps);

    const out = process.stdout as NodeJS.WriteStream;
    const renderer = new WorldRenderer(out);

    // ── Alt screen + raw mode ───────────────────────────────────────────────
    out.write(A.altScreenOn + A.clear + A.home);
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    let running = true;

    // ── Agent state ─────────────────────────────────────────────────────────
    let personalities: Personality[] = [];
    let tasks: RunningTask[] = [];
    let recentAuditEntries: AuditEntry[] = [];
    const talkingUntil = new Map<string, number>(); // personalityId → expiry ms
    const seenAuditIds = new Set<string>();

    // ── World map state ──────────────────────────────────────────────────────
    const currentPlan: FloorPlan | null = size !== 'compact' ? buildFloorPlan(size) : null;
    const agentPositions = new Map<string, AgentPos>();
    const idleSince = new Map<string, number>();
    let meetingPairsActive = new Set<string>();
    let celebrationUntil = 0;
    let celebTick = 0;
    let currentMood: WorldMood = 'calm';

    const spawnAgents = (): void => {
      if (!currentPlan) return;
      let nextIdx = agentPositions.size;
      for (const p of personalities) {
        if (!agentPositions.has(p.id)) {
          const desk = currentPlan.desks[nextIdx % currentPlan.desks.length]!;
          nextIdx++;
          agentPositions.set(p.id, {
            personalityId: p.id,
            pos: { row: desk.row, col: desk.col },
            home: { row: desk.row, col: desk.col },
            destZone: 'workspace',
            path: [],
          });
        }
      }
      // Remove agents no longer in personality list
      for (const pid of [...agentPositions.keys()]) {
        if (!personalities.some((p) => p.id === pid)) {
          agentPositions.delete(pid);
          idleSince.delete(pid);
        }
      }
    };

    const buildCards = (): AgentCard[] => {
      const now = Date.now();
      return personalities.map((p) => {
        renderer.ensureFrame(p.id);
        const { state, taskLabel } = deriveState(p, tasks, talkingUntil, now);
        return {
          personality: p,
          state,
          taskLabel,
          frame: renderer.getFrame(p.id),
        };
      });
    };

    const stepAgents = (cards: AgentCard[], now: number): void => {
      if (!currentPlan) return;
      meetingPairsActive = computeMeetingPairs(tasks);

      for (const [pid, ap] of agentPositions) {
        const card = cards.find((c) => c.personality.id === pid);
        const state: AgentState = card?.state ?? 'idle';

        // Track idle duration
        if (state === 'idle') {
          if (!idleSince.has(pid)) idleSince.set(pid, now);
        } else {
          idleSince.delete(pid);
        }

        const desired = targetZoneForAgent(state, pid, meetingPairsActive, idleSince, now, tasks);

        if (desired !== ap.destZone) {
          ap.destZone = desired;
          const waypoint = currentPlan.zoneWaypoints[desired];
          ap.path = findPath(currentPlan.walkable, ap.pos, waypoint);
        }

        // Advance one step along path
        if (ap.path.length > 0) {
          ap.pos = ap.path.shift()!;
        }
      }
    };

    // ── Data fetchers ───────────────────────────────────────────────────────

    const fetchPersonalities = async (): Promise<void> => {
      try {
        const res = await apiCall(baseUrl, '/api/v1/soul/personalities');
        if (res.ok) {
          const data = res.data as { personalities?: Personality[] };
          personalities = data.personalities ?? [];
          renderer.setServerStatus('ok');
          spawnAgents();
        } else {
          renderer.setServerStatus('error');
        }
      } catch {
        renderer.setServerStatus('unreachable');
      }
    };

    const fetchTasks = async (): Promise<void> => {
      try {
        const res = await apiCall(baseUrl, '/api/v1/tasks?status=running&limit=20');
        if (res.ok) {
          const data = res.data as { tasks?: RunningTask[] };
          tasks = data.tasks ?? [];
        }
      } catch {
        /* keep last known tasks */
      }
    };

    const fetchAudit = async (): Promise<void> => {
      try {
        const res = await apiCall(baseUrl, '/api/v1/audit/entries?limit=10');
        if (!res.ok) return;
        const data = res.data as { entries?: AuditEntry[] };
        const entries = data.entries ?? [];
        recentAuditEntries = entries;
        const now = Date.now();

        // Process oldest-first so log lines appear in chronological order
        for (const e of [...entries].reverse()) {
          const ts = e.timestamp ?? e.createdAt;
          const age = ts ? now - ts : Infinity;

          // Mark actor as "talking" if their event is within 60 s
          if (age < 60_000 && e.actorId) {
            const current = talkingUntil.get(e.actorId) ?? 0;
            const expiry = now + (60_000 - age);
            if (expiry > current) talkingUntil.set(e.actorId, expiry);
          }

          // Trigger celebration on task completion
          const action = (e.type ?? e.action ?? '').toLowerCase();
          if (action.includes('task_completed') || action.includes('task_complete')) {
            celebrationUntil = now + 3_000;
          }

          if (seenAuditIds.has(e.id)) continue;
          seenAuditIds.add(e.id);

          const timeStr = fmtTime(ts);
          const actorName = personalities.find((p) => p.id === e.actorId)?.name;
          const actorStr = actorName
            ? `${A.dim} · ${actorName}${A.reset}`
            : e.actorId
              ? `${A.dim} · ${e.actorId.slice(0, 8)}${A.reset}`
              : '';

          renderer.addLog(
            `${A.dim}${timeStr}${A.reset}  ${A.yellow}${action}${A.reset}${actorStr}`
          );
        }
      } catch {
        /* ignore */
      }
    };

    // ── Initial load ────────────────────────────────────────────────────────
    await Promise.all([fetchPersonalities(), fetchTasks(), fetchAudit()]);
    const initialCards = buildCards();
    renderer.setAgents(initialCards);
    if (currentPlan) {
      renderer.renderMap(currentPlan, agentPositions, initialCards, currentMood, meetingPairsActive, '', celebTick);
    } else {
      renderer.render();
    }

    // ── Polling ─────────────────────────────────────────────────────────────
    const taskPoll = setInterval(() => {
      if (!running) return;
      fetchTasks()
        .then(() => {
          renderer.setAgents(buildCards());
        })
        .catch(() => null);
    }, 3_000);

    const auditPoll = setInterval(() => {
      if (!running) return;
      fetchAudit().catch(() => null);
    }, 5_000);

    const personalityPoll = setInterval(() => {
      if (!running) return;
      fetchPersonalities()
        .then(() => {
          renderer.setAgents(buildCards());
        })
        .catch(() => null);
    }, 10_000);

    // ── Animation loop ──────────────────────────────────────────────────────
    const animLoop = setInterval(() => {
      if (!running) return;
      renderer.advanceTick();
      const cards = buildCards();
      renderer.setAgents(cards);
      const now = Date.now();

      if (currentPlan) {
        celebTick++;
        stepAgents(cards, now);

        // Mood drives animation speed unless user set --speed
        currentMood = computeMood(tasks, recentAuditEntries, celebrationUntil, now);
        const moodFps =
          currentMood === 'celebration' ? 8
          : currentMood === 'busy' ? 6
          : currentMood === 'productive' ? 4
          : 2;
        void moodFps; // fps override is informational; interval already set
        void speedOverride; // consumed above

        const activeTask = tasks.find((t) => t.status === 'running');
        const activeTaskName = activeTask?.title ?? activeTask?.name ?? '';

        renderer.renderMap(
          currentPlan,
          agentPositions,
          cards,
          currentMood,
          meetingPairsActive,
          activeTaskName,
          celebTick
        );
      } else {
        renderer.render();
      }
    }, frameMs);

    // ── Resize handler ──────────────────────────────────────────────────────
    process.stdout.on('resize', () => {
      renderer.onResize();
      const cards = buildCards();
      renderer.setAgents(cards);
      if (currentPlan) {
        const activeTask = tasks.find((t) => t.status === 'running');
        renderer.renderMap(
          currentPlan,
          agentPositions,
          cards,
          currentMood,
          meetingPairsActive,
          activeTask?.title ?? activeTask?.name ?? '',
          celebTick
        );
      } else {
        renderer.render();
      }
    });

    // ── Keypress handler ────────────────────────────────────────────────────
    process.stdin.on('keypress', (_ch, key) => {
      if (!key) return;

      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        running = false;
        return;
      }

      if (key.name === 'r') {
        Promise.all([fetchPersonalities(), fetchTasks(), fetchAudit()])
          .then(() => {
            const cards = buildCards();
            renderer.setAgents(cards);
            if (currentPlan) {
              const activeTask = tasks.find((t) => t.status === 'running');
              renderer.renderMap(
                currentPlan,
                agentPositions,
                cards,
                currentMood,
                meetingPairsActive,
                activeTask?.title ?? activeTask?.name ?? '',
                celebTick
              );
            } else {
              renderer.render();
            }
          })
          .catch(() => null);
        return;
      }

      if (key.name === 'up' || key.name === 'pageup') {
        renderer.scrollLog(key.name === 'pageup' ? 10 : 3);
        const cards = buildCards();
        if (currentPlan) {
          renderer.renderMap(currentPlan, agentPositions, cards, currentMood, meetingPairsActive, '', celebTick);
        } else {
          renderer.render();
        }
        return;
      }

      if (key.name === 'down' || key.name === 'pagedown') {
        renderer.scrollLog(key.name === 'pagedown' ? -10 : -3);
        const cards = buildCards();
        if (currentPlan) {
          renderer.renderMap(currentPlan, agentPositions, cards, currentMood, meetingPairsActive, '', celebTick);
        } else {
          renderer.render();
        }
        return;
      }
    });

    // ── Wait until quit ─────────────────────────────────────────────────────
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!running) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    // ── Cleanup ─────────────────────────────────────────────────────────────
    clearInterval(animLoop);
    clearInterval(taskPoll);
    clearInterval(auditPoll);
    clearInterval(personalityPoll);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    out.write(A.altScreenOff);
    process.stdin.pause();

    return 0;
  },
};
