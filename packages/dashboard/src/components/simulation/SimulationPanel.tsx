import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Pause,
  SkipForward,
  Heart,
  MapPin,
  GitBranch,
  Users,
  Activity,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type {
  TickConfig,
  MoodState,
  MoodLabel,
  MoodEvent,
  EntityLocation,
  SpatialZone,
  EntityRelationship,
  EntityGroup,
} from '@secureyeoman/shared';
import {
  fetchSimTickConfig,
  startSimTick,
  pauseSimTick,
  resumeSimTick,
  advanceSimTick,
  deleteSimTick,
  fetchSimMoodState,
  fetchSimMoodHistory,
  submitSimMoodEvent,
  resetSimMood,
  fetchSimEntities,
  fetchSimZones,
  fetchSimRelationships,
  fetchSimGroups,
} from '../../api/client';

type SimTab = 'tick' | 'mood' | 'spatial' | 'relationships';

const TAB_ITEMS: { key: SimTab; label: string; icon: React.ReactNode }[] = [
  { key: 'tick', label: 'Tick Driver', icon: <Activity className="w-4 h-4" /> },
  { key: 'mood', label: 'Mood', icon: <Heart className="w-4 h-4" /> },
  { key: 'spatial', label: 'Spatial', icon: <MapPin className="w-4 h-4" /> },
  { key: 'relationships', label: 'Relationships', icon: <GitBranch className="w-4 h-4" /> },
];

const MOOD_COLORS: Record<MoodLabel, string> = {
  ecstatic: 'bg-yellow-400 text-yellow-900',
  excited: 'bg-orange-400 text-orange-900',
  happy: 'bg-green-400 text-green-900',
  content: 'bg-emerald-300 text-emerald-900',
  calm: 'bg-blue-300 text-blue-900',
  neutral: 'bg-gray-300 text-gray-900',
  melancholy: 'bg-indigo-300 text-indigo-900',
  sad: 'bg-blue-500 text-white',
  angry: 'bg-red-500 text-white',
  anxious: 'bg-purple-400 text-purple-900',
};

export function SimulationPanel() {
  const queryClient = useQueryClient();
  const [personalityId, setPersonalityId] = useState('');
  const [activeTab, setActiveTab] = useState<SimTab>('tick');

  // New tick config form state
  const [newMode, setNewMode] = useState<string>('realtime');
  const [newInterval, setNewInterval] = useState(1000);
  const [newTimeScale, setNewTimeScale] = useState(1.0);

  // Mood event form state
  const [moodEventType, setMoodEventType] = useState('');
  const [moodValenceDelta, setMoodValenceDelta] = useState(0);
  const [moodArousalDelta, setMoodArousalDelta] = useState(0);

  const pid = personalityId.trim();
  const enabled = pid.length > 0;

  // ── Tick queries ──────────────────────────────────────────────────

  const tickQuery = useQuery({
    queryKey: ['sim-tick', pid],
    queryFn: () => fetchSimTickConfig(pid),
    enabled,
    refetchInterval: 3000,
  });

  const startMut = useMutation({
    mutationFn: () =>
      startSimTick(pid, {
        mode: newMode,
        tickIntervalMs: newInterval,
        timeScale: newTimeScale,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sim-tick', pid] }),
  });

  const pauseMut = useMutation({
    mutationFn: () => pauseSimTick(pid),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sim-tick', pid] }),
  });

  const resumeMut = useMutation({
    mutationFn: () => resumeSimTick(pid),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sim-tick', pid] }),
  });

  const advanceMut = useMutation({
    mutationFn: () => advanceSimTick(pid),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sim-tick', pid] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSimTick(pid),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sim-tick', pid] }),
  });

  // ── Mood queries ──────────────────────────────────────────────────

  const moodQuery = useQuery({
    queryKey: ['sim-mood', pid],
    queryFn: () => fetchSimMoodState(pid),
    enabled,
    refetchInterval: 3000,
  });

  const moodHistoryQuery = useQuery({
    queryKey: ['sim-mood-history', pid],
    queryFn: () => fetchSimMoodHistory(pid, 20),
    enabled,
  });

  const submitMoodMut = useMutation({
    mutationFn: (event: {
      eventType: string;
      valenceDelta: number;
      arousalDelta: number;
      source?: string;
    }) => submitSimMoodEvent(pid, event),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sim-mood', pid] });
      void queryClient.invalidateQueries({ queryKey: ['sim-mood-history', pid] });
    },
  });

  const resetMoodMut = useMutation({
    mutationFn: () => resetSimMood(pid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sim-mood', pid] });
      void queryClient.invalidateQueries({ queryKey: ['sim-mood-history', pid] });
    },
  });

  // ── Spatial queries ───────────────────────────────────────────────

  const entitiesQuery = useQuery({
    queryKey: ['sim-entities', pid],
    queryFn: () => fetchSimEntities(pid),
    enabled,
  });

  const zonesQuery = useQuery({
    queryKey: ['sim-zones', pid],
    queryFn: () => fetchSimZones(pid),
    enabled,
  });

  // ── Relationship queries ──────────────────────────────────────────

  const relationshipsQuery = useQuery({
    queryKey: ['sim-relationships', pid],
    queryFn: () => fetchSimRelationships(pid),
    enabled,
  });

  const groupsQuery = useQuery({
    queryKey: ['sim-groups', pid],
    queryFn: () => fetchSimGroups(pid),
    enabled,
  });

  // ── Derived data ──────────────────────────────────────────────────

  const tickConfig: TickConfig | undefined = tickQuery.data;
  const moodState: MoodState | undefined = moodQuery.data;
  const moodEvents: MoodEvent[] = useMemo(
    () => moodHistoryQuery.data?.events ?? moodHistoryQuery.data ?? [],
    [moodHistoryQuery.data]
  );
  const entities: EntityLocation[] = useMemo(
    () => entitiesQuery.data?.entities ?? entitiesQuery.data ?? [],
    [entitiesQuery.data]
  );
  const zones: SpatialZone[] = useMemo(
    () => zonesQuery.data?.zones ?? zonesQuery.data ?? [],
    [zonesQuery.data]
  );
  const relationships: EntityRelationship[] = useMemo(
    () => relationshipsQuery.data?.relationships ?? relationshipsQuery.data ?? [],
    [relationshipsQuery.data]
  );
  const groups: EntityGroup[] = useMemo(
    () => groupsQuery.data?.groups ?? groupsQuery.data ?? [],
    [groupsQuery.data]
  );

  // ── Valence bar helpers ───────────────────────────────────────────

  /** Map valence from [-1,1] to [0,100] for display */
  const valencePercent = moodState ? ((moodState.valence + 1) / 2) * 100 : 50;
  /** Map arousal from [0,1] to [0,100] */
  const arousalPercent = moodState ? moodState.arousal * 100 : 0;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Simulation Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor and control live simulation subsystems — tick driver, mood, spatial, and
          relationships.
        </p>
      </div>

      {/* Personality ID input */}
      <div className="border rounded-lg p-4">
        <label className="text-sm font-medium block mb-1.5">Personality ID</label>
        <input
          type="text"
          value={personalityId}
          onChange={(e) => {
            setPersonalityId(e.target.value);
          }}
          placeholder="Enter personality ID to monitor..."
          className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          data-testid="personality-id-input"
        />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b pb-px">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            data-testid={`tab-${tab.key}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!enabled && (
        <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
          Enter a personality ID above to view simulation data.
        </div>
      )}

      {enabled && activeTab === 'tick' && (
        <TickTab
          tickConfig={tickConfig}
          isLoading={tickQuery.isLoading}
          onRefetch={() => void tickQuery.refetch()}
          newMode={newMode}
          setNewMode={setNewMode}
          newInterval={newInterval}
          setNewInterval={setNewInterval}
          newTimeScale={newTimeScale}
          setNewTimeScale={setNewTimeScale}
          onStart={() => {
            startMut.mutate();
          }}
          onPause={() => {
            pauseMut.mutate();
          }}
          onResume={() => {
            resumeMut.mutate();
          }}
          onAdvance={() => {
            advanceMut.mutate();
          }}
          onDelete={() => {
            deleteMut.mutate();
          }}
          isStarting={startMut.isPending}
        />
      )}

      {enabled && activeTab === 'mood' && (
        <MoodTab
          moodState={moodState}
          moodEvents={moodEvents}
          isLoading={moodQuery.isLoading}
          onRefetch={() => {
            void moodQuery.refetch();
            void moodHistoryQuery.refetch();
          }}
          valencePercent={valencePercent}
          arousalPercent={arousalPercent}
          moodEventType={moodEventType}
          setMoodEventType={setMoodEventType}
          moodValenceDelta={moodValenceDelta}
          setMoodValenceDelta={setMoodValenceDelta}
          moodArousalDelta={moodArousalDelta}
          setMoodArousalDelta={setMoodArousalDelta}
          onSubmitEvent={() => {
            submitMoodMut.mutate({
              eventType: moodEventType,
              valenceDelta: moodValenceDelta,
              arousalDelta: moodArousalDelta,
              source: 'dashboard',
            });
          }}
          onResetMood={() => {
            resetMoodMut.mutate();
          }}
          isSubmitting={submitMoodMut.isPending}
        />
      )}

      {enabled && activeTab === 'spatial' && (
        <SpatialTab
          entities={entities}
          zones={zones}
          isLoading={entitiesQuery.isLoading || zonesQuery.isLoading}
          onRefetch={() => {
            void entitiesQuery.refetch();
            void zonesQuery.refetch();
          }}
        />
      )}

      {enabled && activeTab === 'relationships' && (
        <RelationshipsTab
          relationships={relationships}
          groups={groups}
          isLoading={relationshipsQuery.isLoading || groupsQuery.isLoading}
          onRefetch={() => {
            void relationshipsQuery.refetch();
            void groupsQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

// ── Tick Tab ────────────────────────────────────────────────────────────

interface TickTabProps {
  tickConfig: TickConfig | undefined;
  isLoading: boolean;
  onRefetch: () => void;
  newMode: string;
  setNewMode: (v: string) => void;
  newInterval: number;
  setNewInterval: (v: number) => void;
  newTimeScale: number;
  setNewTimeScale: (v: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onAdvance: () => void;
  onDelete: () => void;
  isStarting: boolean;
}

function TickTab({
  tickConfig,
  isLoading,
  onRefetch,
  newMode,
  setNewMode,
  newInterval,
  setNewInterval,
  newTimeScale,
  setNewTimeScale,
  onStart,
  onPause,
  onResume,
  onAdvance,
  onDelete,
  isStarting,
}: TickTabProps) {
  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      {tickConfig ? (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Tick Configuration
            </h2>
            <button
              onClick={onRefetch}
              className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground"
              aria-label="Refresh tick data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Status grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Current Tick" value={String(tickConfig.currentTick)} />
            <StatCard label="Mode" value={tickConfig.mode} />
            <StatCard label="Time Scale" value={`${tickConfig.timeScale}x`} />
            <StatCard
              label="Status"
              value={tickConfig.paused ? 'Paused' : 'Running'}
              valueClass={tickConfig.paused ? 'text-yellow-500' : 'text-green-500'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Tick Interval" value={`${tickConfig.tickIntervalMs}ms`} />
            <StatCard
              label="Last Tick"
              value={
                tickConfig.lastTickAt
                  ? new Date(tickConfig.lastTickAt).toLocaleTimeString()
                  : 'Never'
              }
            />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {tickConfig.paused ? (
              <button
                onClick={onResume}
                className="px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 text-sm"
                data-testid="resume-btn"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            ) : (
              <button
                onClick={onPause}
                className="px-3 py-1.5 rounded bg-yellow-500 text-white hover:opacity-90 flex items-center gap-1.5 text-sm"
                data-testid="pause-btn"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}
            <button
              onClick={onAdvance}
              className="px-3 py-1.5 rounded bg-muted text-foreground hover:opacity-90 flex items-center gap-1.5 text-sm"
              data-testid="advance-btn"
            >
              <SkipForward className="w-4 h-4" />
              Advance
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 rounded bg-destructive text-destructive-foreground hover:opacity-90 flex items-center gap-1.5 text-sm"
              data-testid="delete-btn"
            >
              <Trash2 className="w-4 h-4" />
              Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Start Simulation
          </h2>
          <p className="text-sm text-muted-foreground">
            No active tick configuration found. Configure and start a new simulation below.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">Mode</label>
              <select
                value={newMode}
                onChange={(e) => {
                  setNewMode(e.target.value);
                }}
                className="w-full px-2 py-1.5 border rounded-md bg-background text-sm"
                data-testid="mode-select"
              >
                <option value="realtime">Realtime</option>
                <option value="accelerated">Accelerated</option>
                <option value="turn_based">Turn-Based</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Interval (ms)</label>
              <input
                type="number"
                value={newInterval}
                onChange={(e) => {
                  setNewInterval(Number(e.target.value));
                }}
                min={10}
                className="w-full px-2 py-1.5 border rounded-md bg-background text-sm"
                data-testid="interval-input"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Time Scale</label>
              <input
                type="number"
                value={newTimeScale}
                onChange={(e) => {
                  setNewTimeScale(Number(e.target.value));
                }}
                min={0.01}
                max={1000}
                step={0.1}
                className="w-full px-2 py-1.5 border rounded-md bg-background text-sm"
                data-testid="timescale-input"
              />
            </div>
          </div>
          <button
            onClick={onStart}
            disabled={isStarting}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 text-sm disabled:opacity-50"
            data-testid="start-btn"
          >
            {isStarting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Simulation
          </button>
        </div>
      )}
    </div>
  );
}

// ── Mood Tab ────────────────────────────────────────────────────────────

interface MoodTabProps {
  moodState: MoodState | undefined;
  moodEvents: MoodEvent[];
  isLoading: boolean;
  onRefetch: () => void;
  valencePercent: number;
  arousalPercent: number;
  moodEventType: string;
  setMoodEventType: (v: string) => void;
  moodValenceDelta: number;
  setMoodValenceDelta: (v: number) => void;
  moodArousalDelta: number;
  setMoodArousalDelta: (v: number) => void;
  onSubmitEvent: () => void;
  onResetMood: () => void;
  isSubmitting: boolean;
}

function MoodTab({
  moodState,
  moodEvents,
  isLoading,
  onRefetch,
  valencePercent,
  arousalPercent,
  moodEventType,
  setMoodEventType,
  moodValenceDelta,
  setMoodValenceDelta,
  moodArousalDelta,
  setMoodArousalDelta,
  onSubmitEvent,
  onResetMood,
  isSubmitting,
}: MoodTabProps) {
  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      {/* Current mood state */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Heart className="w-5 h-5" />
            Current Mood
          </h2>
          <button
            onClick={onRefetch}
            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground"
            aria-label="Refresh mood data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {moodState ? (
          <>
            {/* Mood label badge */}
            <div className="flex items-center gap-3">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${MOOD_COLORS[moodState.label] ?? 'bg-gray-300 text-gray-900'}`}
                data-testid="mood-label"
              >
                {moodState.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Decay rate: {moodState.decayRate}
              </span>
            </div>

            {/* Valence bar */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Valence</span>
                <span>{moodState.valence.toFixed(2)}</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 via-gray-400 to-green-400 rounded-full transition-all"
                  style={{ width: `${valencePercent}%` }}
                  data-testid="valence-bar"
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>-1</span>
                <span>0</span>
                <span>+1</span>
              </div>
            </div>

            {/* Arousal bar */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Arousal</span>
                <span>{moodState.arousal.toFixed(2)}</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full transition-all"
                  style={{ width: `${arousalPercent}%` }}
                  data-testid="arousal-bar"
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>0</span>
                <span>1</span>
              </div>
            </div>

            {/* Dominance */}
            <div className="text-sm text-muted-foreground">
              Dominance: {moodState.dominance.toFixed(2)}
            </div>

            {/* Reset button */}
            <button
              onClick={onResetMood}
              className="px-3 py-1.5 rounded bg-muted text-foreground hover:opacity-90 flex items-center gap-1.5 text-sm"
              data-testid="reset-mood-btn"
            >
              <RefreshCw className="w-4 h-4" />
              Reset to Baseline
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No mood state found for this personality.</p>
        )}
      </div>

      {/* Submit mood event */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Submit Mood Event
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1">Event Type</label>
            <input
              type="text"
              value={moodEventType}
              onChange={(e) => {
                setMoodEventType(e.target.value);
              }}
              placeholder="e.g. praise, criticism"
              className="w-full px-2 py-1.5 border rounded-md bg-background text-sm"
              data-testid="mood-event-type"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Valence Delta</label>
            <input
              type="number"
              value={moodValenceDelta}
              onChange={(e) => {
                setMoodValenceDelta(Number(e.target.value));
              }}
              min={-2}
              max={2}
              step={0.1}
              className="w-full px-2 py-1.5 border rounded-md bg-background text-sm"
              data-testid="mood-valence-delta"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Arousal Delta</label>
            <input
              type="number"
              value={moodArousalDelta}
              onChange={(e) => {
                setMoodArousalDelta(Number(e.target.value));
              }}
              min={-1}
              max={1}
              step={0.1}
              className="w-full px-2 py-1.5 border rounded-md bg-background text-sm"
              data-testid="mood-arousal-delta"
            />
          </div>
        </div>
        <button
          onClick={onSubmitEvent}
          disabled={isSubmitting || !moodEventType.trim()}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 text-sm disabled:opacity-50"
          data-testid="submit-mood-event-btn"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Submit Event
        </button>
      </div>

      {/* Mood event history */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Recent Mood Events</h2>
        {moodEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mood events recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {moodEvents.map((evt, i) => (
              <div
                key={evt.id ?? i}
                className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
              >
                <div>
                  <span className="font-medium">{evt.eventType}</span>
                  <span className="text-muted-foreground ml-2 text-xs">from {evt.source}</span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>
                    V: {evt.valenceDelta > 0 ? '+' : ''}
                    {evt.valenceDelta.toFixed(2)}
                  </span>
                  <span>
                    A: {evt.arousalDelta > 0 ? '+' : ''}
                    {evt.arousalDelta.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Spatial Tab ─────────────────────────────────────────────────────────

interface SpatialTabProps {
  entities: EntityLocation[];
  zones: SpatialZone[];
  isLoading: boolean;
  onRefetch: () => void;
}

function SpatialTab({ entities, zones, isLoading, onRefetch }: SpatialTabProps) {
  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      {/* Entity overview */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Entities
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{entities.length} total</span>
            <button
              onClick={onRefetch}
              className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground"
              aria-label="Refresh spatial data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        {entities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entities registered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="pb-2 pr-3">Entity ID</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Zone</th>
                  <th className="pb-2 pr-3">Position</th>
                  <th className="pb-2">Speed</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((ent) => (
                  <tr key={ent.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs">{ent.entityId}</td>
                    <td className="py-1.5 pr-3">{ent.entityType}</td>
                    <td className="py-1.5 pr-3">{ent.zoneId}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      ({ent.x.toFixed(1)}, {ent.y.toFixed(1)}, {ent.z.toFixed(1)})
                    </td>
                    <td className="py-1.5">{ent.speed.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Zones */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Zones
          <span className="text-xs font-normal text-muted-foreground">({zones.length})</span>
        </h2>
        {zones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spatial zones defined.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {zones.map((z) => (
              <div key={z.id} className="border rounded-md p-3 space-y-1">
                <div className="font-medium text-sm">{z.name}</div>
                <div className="text-xs text-muted-foreground font-mono">ID: {z.zoneId}</div>
                <div className="text-xs text-muted-foreground">
                  Bounds: ({z.minX}, {z.minY}) to ({z.maxX}, {z.maxY})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Relationships Tab ───────────────────────────────────────────────────

interface RelationshipsTabProps {
  relationships: EntityRelationship[];
  groups: EntityGroup[];
  isLoading: boolean;
  onRefetch: () => void;
}

function RelationshipsTab({ relationships, groups, isLoading, onRefetch }: RelationshipsTabProps) {
  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      {/* Relationships */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Relationships
            <span className="text-xs font-normal text-muted-foreground">
              ({relationships.length})
            </span>
          </h2>
          <button
            onClick={onRefetch}
            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground"
            aria-label="Refresh relationship data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {relationships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No relationships found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="pb-2 pr-3">Source</th>
                  <th className="pb-2 pr-3">Target</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Affinity</th>
                  <th className="pb-2 pr-3">Trust</th>
                  <th className="pb-2">Interactions</th>
                </tr>
              </thead>
              <tbody>
                {relationships.map((rel) => (
                  <tr key={rel.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs">{rel.sourceEntityId}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{rel.targetEntityId}</td>
                    <td className="py-1.5 pr-3">
                      <span className="px-1.5 py-0.5 rounded text-xs bg-muted">{rel.type}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <AffinityBar value={rel.affinity} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <TrustBar value={rel.trust} />
                    </td>
                    <td className="py-1.5 text-center">{rel.interactionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Groups */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Groups
          <span className="text-xs font-normal text-muted-foreground">({groups.length})</span>
        </h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups defined.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((g) => (
              <div key={g.id} className="border rounded-md p-3 space-y-1">
                <div className="font-medium text-sm">{g.name}</div>
                <div className="text-xs text-muted-foreground font-mono">ID: {g.groupId}</div>
                <div className="text-xs text-muted-foreground">
                  {g.members.length} member{g.members.length !== 1 ? 's' : ''}
                  {g.members.length > 0 && (
                    <span className="ml-1">
                      ({g.members.slice(0, 5).join(', ')}
                      {g.members.length > 5 ? `, +${g.members.length - 5} more` : ''})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared small components ─────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="border rounded-lg p-8 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${valueClass ?? ''}`}>{value}</div>
    </div>
  );
}

function AffinityBar({ value }: { value: number }) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-red-400 to-green-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8">{value.toFixed(1)}</span>
    </div>
  );
}

function TrustBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8">{value.toFixed(1)}</span>
    </div>
  );
}
