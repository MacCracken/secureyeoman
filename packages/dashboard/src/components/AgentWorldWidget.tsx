/**
 * AgentWorldWidget — React port of the ASCII animated agent world.
 *
 * Renders each active personality as an ASCII character at their workstation
 * with a 4-frame state machine driven by live server data:
 *
 *   idle     (o.o) — resting, slow blink
 *   thinking (>.<) — task just started (< 8 s)
 *   typing   (^_^) — task actively running, keyboard flicker
 *   offline  (x_x) — personality inactive, floating Zs
 *
 * Two view modes (toggle persisted to localStorage):
 *   Grid — card-per-agent layout (original)
 *   Map  — zone-based layout (Workspace / Meeting / Break Room)
 *
 * Inspired by pixel-agents (github.com/pablodelucca/pixel-agents), adapted
 * as a pure React/Tailwind component without canvas or a real TTY.
 *
 * Used in: MissionControlTab (MetricsPage), AdvancedEditorPage (collapsible panel)
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPersonalities, fetchTasks } from '../api/client';
import type { Personality, Task } from '../types';

// ── State machine ──────────────────────────────────────────────────────────────

type AgentState = 'idle' | 'thinking' | 'typing' | 'offline';

interface AnimFrame {
  face: string; // 3-char content rendered between ║…║
  extra: string; // bottom decoration line — empty string = blank row
}

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
  typing: 'working',
  offline: 'offline',
};

const STATE_FACE_CLS: Record<AgentState, string> = {
  idle: 'text-muted-foreground',
  thinking: 'text-yellow-400',
  typing: 'text-cyan-400',
  offline: 'text-muted-foreground/40',
};

const STATE_LABEL_CLS: Record<AgentState, string> = {
  idle: 'text-muted-foreground/70',
  thinking: 'text-yellow-400/90',
  typing: 'text-cyan-400/90',
  offline: 'text-muted-foreground/40',
};

const STATE_BORDER_CLS: Record<AgentState, string> = {
  idle: 'border-border',
  thinking: 'border-yellow-400/50',
  typing: 'border-cyan-400/50',
  offline: 'border-border/40',
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/** Exported for unit tests. */
export function deriveAgentState(
  p: Personality,
  tasks: Task[],
  now: number
): { state: AgentState; taskLabel: string } {
  if (!p.isActive) return { state: 'offline', taskLabel: 'inactive' };

  const running = tasks.find(
    (t) => t.securityContext?.personalityId === p.id && t.status === 'running'
  );

  if (running) {
    const age = now - (running.startedAt ?? running.createdAt);
    return {
      state: age < 8_000 ? 'thinking' : 'typing',
      taskLabel: running.name,
    };
  }

  return { state: 'idle', taskLabel: '' };
}

/**
 * Compute which zone an agent should occupy in map view.
 * Exported for unit tests.
 */
export function computeZoneForAgent(
  p: Personality,
  tasks: Task[],
  meetingPersonalityIds: Set<string>,
  idleSinceMs: number | undefined,
  now: number
): 'workspace' | 'meeting' | 'break-room' {
  if (!p.isActive) return 'workspace';
  if (meetingPersonalityIds.has(p.id)) return 'meeting';

  const running = tasks.find(
    (t) => t.securityContext?.personalityId === p.id && t.status === 'running'
  );
  if (running) return 'workspace';

  // Idle for > 60 s → break room
  if (idleSinceMs !== undefined && now - idleSinceMs > 60_000) return 'break-room';

  return 'workspace';
}

/** Compute meeting pairs from running tasks (correlationId or A2A type). */
function computeReactMeetingPairs(tasks: Task[]): Set<string> {
  const pairs = new Set<string>();
  const running = tasks.filter((t) => t.status === 'running');

  // Group by correlationId
  const byCorr = new Map<string, string[]>();
  for (const t of running) {
    const pid = t.securityContext?.personalityId;
    const cid = (t as any).correlationId as string | undefined;
    if (cid && pid) {
      const group = byCorr.get(cid) ?? [];
      group.push(pid);
      byCorr.set(cid, group);
    }
  }
  for (const [, pids] of byCorr) {
    const unique = [...new Set(pids)];
    if (unique.length >= 2) {
      for (const pid of unique) pairs.add(pid);
    }
  }

  // A2A tasks
  for (const t of running) {
    const pid = t.securityContext?.personalityId;
    if ((t as any).type?.includes?.('a2a') && pid) {
      pairs.add(pid);
    }
  }

  return pairs;
}

// ── AgentCard ──────────────────────────────────────────────────────────────────

interface AgentCardProps {
  personality: Personality;
  state: AgentState;
  taskLabel: string;
  frame: number;
  onClick?: () => void;
}

function AgentCard({ personality, state, taskLabel, frame, onClick }: AgentCardProps) {
  const f = FRAMES[state][frame % 4]!;
  const name = trunc(personality.name, 10);

  return (
    <div
      className={`font-mono text-[11px] leading-snug p-2 rounded border select-none w-[88px] flex-shrink-0 ${STATE_BORDER_CLS[state]} bg-card/50 ${state === 'offline' ? 'opacity-50' : ''} ${onClick ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
      title={`${personality.name} — ${STATE_LABEL[state]}${taskLabel ? `: ${taskLabel}` : ''}`}
      onClick={onClick}
    >
      {/* Name */}
      <div className="font-bold text-center text-foreground truncate mb-0.5">{name}</div>
      {/* Head */}
      <div className="text-muted-foreground/50 text-center">╔═══╗</div>
      <div className="text-center">
        <span className="text-muted-foreground/50">║</span>
        <span className={STATE_FACE_CLS[state]}>{f.face}</span>
        <span className="text-muted-foreground/50">║</span>
      </div>
      <div className="text-muted-foreground/50 text-center">╚═══╝</div>
      {/* Body */}
      <div className="text-muted-foreground/50 text-center">/||{'\\' /* backslash */}</div>
      {/* Extra (keyboard / dots / Zs) */}
      <div className="text-muted-foreground/40 text-center h-[1.3em]">
        {f.extra ? `[${f.extra}]` : ''}
      </div>
      {/* State label */}
      <div className={`text-center font-semibold ${STATE_LABEL_CLS[state]}`}>
        {STATE_LABEL[state]}
      </div>
      {/* Task label */}
      <div className="text-muted-foreground/50 text-center truncate h-[1.3em] text-[10px]">
        {taskLabel}
      </div>
    </div>
  );
}

// ── Agent pill (map view) ──────────────────────────────────────────────────────

interface AgentPillProps {
  personality: Personality;
  state: AgentState;
  frame: number;
  inMeeting: boolean;
  onClick?: () => void;
}

function AgentPill({ personality, state, frame, inMeeting, onClick }: AgentPillProps) {
  const f = FRAMES[state][frame % 4]!;
  const name = trunc(personality.name, 8);
  const cls = inMeeting ? 'text-yellow-400' : STATE_FACE_CLS[state];

  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono ${STATE_BORDER_CLS[state]} bg-card/50 ${state === 'offline' ? 'opacity-50' : ''} ${onClick ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
      title={`${personality.name} — ${STATE_LABEL[state]}`}
      onClick={onClick}
    >
      <span className={cls}>{f.face}</span>
      <span className="text-foreground truncate">{name}</span>
    </div>
  );
}

// ── Zone box (map view) ───────────────────────────────────────────────────────

interface ZoneBoxProps {
  label: string;
  zoneId: string;
  agents: Personality[];
  tasks: Task[];
  meetingPairs: Set<string>;
  framesMap: Map<string, number>;
  whiteboardText?: string;
  onAgentClick?: (personalityId: string) => void;
  now: number;
}

function ZoneBox({
  label,
  zoneId,
  agents,
  tasks,
  meetingPairs,
  framesMap,
  whiteboardText,
  onAgentClick,
  now,
}: ZoneBoxProps) {
  const hasMeeting = zoneId === 'meeting' && agents.length > 0;

  return (
    <div className="border border-border rounded p-2 min-h-[60px] flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {agents.length > 0 && (
          <span className="text-[10px] text-muted-foreground/60">{agents.length}</span>
        )}
      </div>

      {/* Whiteboard in meeting room */}
      {hasMeeting && whiteboardText && (
        <div className="font-mono text-[10px] text-yellow-400/90 mb-1 px-1 border-b border-yellow-400/20 pb-1">
          <span className="text-muted-foreground/40">╭─╮</span>
          {' '}{trunc(whiteboardText, 14)}{' '}
          <span className="text-muted-foreground/40">╰─╯</span>
        </div>
      )}

      {/* Agent pills */}
      {agents.length === 0 ? (
        <span className="text-[10px] text-muted-foreground/30 italic">empty</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {agents.map((p) => {
            const { state } = deriveAgentState(p, tasks, now);
            const inMeeting = meetingPairs.has(p.id);
            return (
              <AgentPill
                key={p.id}
                personality={p}
                state={state}
                frame={framesMap.get(p.id) ?? 0}
                inMeeting={inMeeting}
                onClick={onAgentClick ? () => onAgentClick(p.id) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── AgentWorldMapView ──────────────────────────────────────────────────────────

interface MapViewProps {
  personalities: Personality[];
  tasks: Task[];
  framesMap: Map<string, number>;
  onAgentClick?: (personalityId: string) => void;
}

function AgentWorldMapView({ personalities, tasks, framesMap, onAgentClick }: MapViewProps) {
  const now = Date.now();
  const meetingPairs = computeReactMeetingPairs(tasks);

  // Distribute agents to zones
  const zones: Record<'workspace' | 'meeting' | 'break-room', Personality[]> = {
    workspace: [],
    meeting: [],
    'break-room': [],
  };

  for (const p of personalities) {
    const zone = computeZoneForAgent(p, tasks, meetingPairs, undefined, now);
    zones[zone].push(p);
  }

  const activeJointTask = tasks.find(
    (t) => t.status === 'running' && meetingPairs.has(t.securityContext?.personalityId ?? '')
  );

  return (
    <div className="grid grid-cols-2 gap-2 font-mono text-[11px]" role="list" aria-label="Agent world map">
      <ZoneBox
        label="Workspace"
        zoneId="workspace"
        agents={zones.workspace}
        tasks={tasks}
        meetingPairs={meetingPairs}
        framesMap={framesMap}
        onAgentClick={onAgentClick}
        now={now}
      />
      <ZoneBox
        label="Meeting Room"
        zoneId="meeting"
        agents={zones.meeting}
        tasks={tasks}
        meetingPairs={meetingPairs}
        framesMap={framesMap}
        whiteboardText={activeJointTask?.name}
        onAgentClick={onAgentClick}
        now={now}
      />
      <ZoneBox
        label="Break Room"
        zoneId="break-room"
        agents={zones['break-room']}
        tasks={tasks}
        meetingPairs={meetingPairs}
        framesMap={framesMap}
        onAgentClick={onAgentClick}
        now={now}
      />
      <ZoneBox
        label="Server Room"
        zoneId="server-room"
        agents={[]} /* system health agents show in workspace in React view */
        tasks={tasks}
        meetingPairs={meetingPairs}
        framesMap={framesMap}
        onAgentClick={onAgentClick}
        now={now}
      />
    </div>
  );
}

// ── AgentWorldWidget ───────────────────────────────────────────────────────────

export interface AgentWorldWidgetProps {
  className?: string;
  /** Cap on how many agents are shown. Default: 16 */
  maxAgents?: number;
  /** Called when the user clicks an agent pill or card. */
  onAgentClick?: (personalityId: string) => void;
  /** Controlled view mode. Defaults to 'grid' when not provided. */
  viewMode?: 'grid' | 'map';
}

export function AgentWorldWidget({ className = '', maxAgents = 16, onAgentClick, viewMode = 'grid' }: AgentWorldWidgetProps) {
  // Per-personality frame counters — staggered so agents animate out of phase
  const framesRef = useRef(new Map<string, number>());
  const [tick, setTick] = useState(0);

  // Data
  const { data: personalitiesData } = useQuery({
    queryKey: ['world-personalities'],
    queryFn: fetchPersonalities,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const { data: tasksData } = useQuery({
    queryKey: ['world-tasks-running'],
    queryFn: () => fetchTasks({ status: 'running', limit: 20 }),
    refetchInterval: 3_000,
  });

  // Animation loop — 4 fps
  useEffect(() => {
    const timer = setInterval(() => {
      for (const [id, frame] of framesRef.current) {
        framesRef.current.set(id, (frame + 1) % 4);
      }
      setTick((t) => t + 1);
    }, 250);
    return () => clearInterval(timer);
  }, []);

  void tick; // used only to trigger re-render

  const personalities = (personalitiesData?.personalities ?? []).slice(0, maxAgents);
  const tasks: Task[] = tasksData?.tasks ?? [];
  const now = Date.now();

  // Ensure each personality has a staggered initial frame
  for (const p of personalities) {
    if (!framesRef.current.has(p.id)) {
      framesRef.current.set(p.id, Math.floor(Math.random() * 4));
    }
  }

  if (personalities.length === 0) {
    return (
      <p className={`text-sm text-muted-foreground font-mono ${className}`}>
        No agents found.
      </p>
    );
  }

  return (
    <div className={className}>
      {viewMode === 'map' ? (
        <AgentWorldMapView
          personalities={personalities}
          tasks={tasks}
          framesMap={framesRef.current}
          onAgentClick={onAgentClick}
        />
      ) : (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Agent world">
          {personalities.map((p) => {
            const { state, taskLabel } = deriveAgentState(p, tasks, now);
            return (
              <div key={p.id} role="listitem">
                <AgentCard
                  personality={p}
                  state={state}
                  taskLabel={taskLabel}
                  frame={framesRef.current.get(p.id) ?? 0}
                  onClick={onAgentClick ? () => onAgentClick(p.id) : undefined}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
