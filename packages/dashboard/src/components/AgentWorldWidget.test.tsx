// @vitest-environment jsdom
/**
 * AgentWorldWidget Tests
 *
 * Covers:
 * - deriveAgentState — full state-machine logic
 * - computeZoneForAgent — zone routing logic
 * - AgentWorldWidget — component rendering (grid mode, map mode, view toggle,
 *   onAgentClick, speech bubble)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  fetchPersonalities: vi.fn(),
  fetchTasks: vi.fn(),
  fetchActiveDelegations: vi.fn(),
  getAccessToken: vi.fn(() => null),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: false,
    reconnecting: false,
    lastMessage: null,
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

import * as api from '../api/client';
import { AgentWorldWidget, deriveAgentState, computeZoneForAgent } from './AgentWorldWidget';

const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchTasks = vi.mocked(api.fetchTasks);
const mockFetchActiveDelegations = vi.mocked(api.fetchActiveDelegations);

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderWidget(
  props: {
    maxAgents?: number;
    onAgentClick?: (id: string) => void;
    viewMode?: 'grid' | 'map' | 'large';
    zoom?: number;
  } = {}
) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AgentWorldWidget {...props} />
    </QueryClientProvider>
  );
}

function makePersonality(
  overrides: Partial<{
    id: string;
    name: string;
    isActive: boolean;
  }> = {}
) {
  return {
    id: 'p-001',
    name: 'Alice',
    isActive: true,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    ...overrides,
  } as any;
}

function makeTask(
  overrides: Partial<{
    id: string;
    name: string;
    status: string;
    createdAt: number;
    startedAt: number;
    personalityId: string | undefined;
    correlationId: string | undefined;
    type: string | undefined;
  }> = {}
) {
  const { personalityId = 'p-001', correlationId, type, ...rest } = overrides;
  return {
    id: 't-001',
    type: type ?? 'manual',
    name: 'analyze codebase',
    status: 'running',
    createdAt: Date.now() - 30_000,
    startedAt: Date.now() - 25_000,
    securityContext: personalityId ? { personalityId } : undefined,
    ...(correlationId ? { correlationId } : {}),
    ...rest,
  } as any;
}

// ── deriveAgentState ───────────────────────────────────────────────────────────

describe('deriveAgentState', () => {
  const NOW = Date.now();

  it('returns offline for inactive personality', () => {
    const p = makePersonality({ isActive: false });
    const { state, taskLabel } = deriveAgentState(p, [], NOW);
    expect(state).toBe('offline');
    expect(taskLabel).toBe('inactive');
  });

  it('returns idle when no running tasks', () => {
    const p = makePersonality();
    const { state, taskLabel } = deriveAgentState(p, [], NOW);
    expect(state).toBe('idle');
    expect(taskLabel).toBe('');
  });

  it('returns thinking when task started less than 2 s ago', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ startedAt: NOW - 500 });
    const { state, taskLabel } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('thinking');
    expect(taskLabel).toBe('analyze codebase');
  });

  it('returns typing when task started more than 2 s ago', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ startedAt: NOW - 5_000 });
    const { state } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('typing');
  });

  it('uses task name as taskLabel', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ name: 'write unit tests', startedAt: NOW - 20_000 });
    const { taskLabel } = deriveAgentState(p, [task], NOW);
    expect(taskLabel).toBe('write unit tests');
  });

  it('ignores tasks for other personalities', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ personalityId: 'p-999', startedAt: NOW - 20_000 });
    const { state } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('idle');
  });

  it('ignores non-running tasks (completed)', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ status: 'completed', startedAt: NOW - 20_000 });
    const { state } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('idle');
  });

  it('ignores non-running tasks (pending)', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ status: 'pending', startedAt: NOW - 20_000 });
    const { state } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('idle');
  });

  it('uses createdAt as age fallback when startedAt is absent', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = { ...makeTask(), startedAt: undefined, createdAt: NOW - 500 } as any;
    const { state } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('thinking'); // < 2 s
  });

  it('offline takes priority over a running task', () => {
    const p = makePersonality({ id: 'p-001', isActive: false });
    const task = makeTask({ startedAt: NOW - 20_000 });
    const { state } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('offline');
  });

  it('handles task without securityContext (no personalityId match)', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = { ...makeTask(), securityContext: undefined } as any;
    const { state } = deriveAgentState(p, [task], NOW);
    expect(state).toBe('idle');
  });

  it('returns meeting when personality has an active delegation it initiated', () => {
    const p = makePersonality({ id: 'p-001' });
    const delegation = {
      delegationId: 'd-001',
      profileId: 'prof-1',
      profileName: 'researcher',
      task: 'analyze codebase',
      status: 'running',
      depth: 1,
      tokensUsed: 0,
      tokenBudget: 50000,
      startedAt: NOW - 2000,
      elapsedMs: 2000,
      initiatedByPersonalityId: 'p-001',
    } as any;
    const { state, taskLabel } = deriveAgentState(p, [], NOW, [delegation]);
    expect(state).toBe('meeting');
    expect(taskLabel).toBe('');
  });

  it('meeting takes priority over a running task', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ startedAt: NOW - 5_000 });
    const delegation = {
      delegationId: 'd-001',
      profileId: 'prof-1',
      profileName: 'researcher',
      task: 'analyze codebase',
      status: 'running',
      depth: 1,
      tokensUsed: 0,
      tokenBudget: 50000,
      startedAt: NOW - 2000,
      elapsedMs: 2000,
      initiatedByPersonalityId: 'p-001',
    } as any;
    const { state } = deriveAgentState(p, [task], NOW, [delegation]);
    expect(state).toBe('meeting');
  });

  it('delegation for other personality does not affect meeting state', () => {
    const p = makePersonality({ id: 'p-001' });
    const delegation = {
      delegationId: 'd-001',
      profileId: 'prof-1',
      profileName: 'researcher',
      task: 'analyze codebase',
      status: 'running',
      depth: 1,
      tokensUsed: 0,
      tokenBudget: 50000,
      startedAt: NOW - 2000,
      elapsedMs: 2000,
      initiatedByPersonalityId: 'p-999',
    } as any;
    const { state } = deriveAgentState(p, [], NOW, [delegation]);
    expect(state).toBe('idle');
  });

  it('offline takes priority over meeting', () => {
    const p = makePersonality({ id: 'p-001', isActive: false });
    const delegation = {
      delegationId: 'd-001',
      profileId: 'prof-1',
      profileName: 'researcher',
      task: 'analyze codebase',
      status: 'running',
      depth: 1,
      tokensUsed: 0,
      tokenBudget: 50000,
      startedAt: NOW - 2000,
      elapsedMs: 2000,
      initiatedByPersonalityId: 'p-001',
    } as any;
    const { state } = deriveAgentState(p, [], NOW, [delegation]);
    expect(state).toBe('offline');
  });
});

// ── computeZoneForAgent ───────────────────────────────────────────────────────

describe('computeZoneForAgent', () => {
  const NOW = Date.now();

  it('returns workspace for active agent with no tasks and not idle-long', () => {
    const p = makePersonality({ id: 'p-001' });
    const zone = computeZoneForAgent(p, [], new Set(), undefined, NOW);
    expect(zone).toBe('workspace');
  });

  it('returns workspace for inactive personality', () => {
    const p = makePersonality({ id: 'p-001', isActive: false });
    const zone = computeZoneForAgent(p, [], new Set(), undefined, NOW);
    expect(zone).toBe('workspace');
  });

  it('returns meeting when personality is in meeting pairs', () => {
    const p = makePersonality({ id: 'p-001' });
    const zone = computeZoneForAgent(p, [], new Set(['p-001']), undefined, NOW);
    expect(zone).toBe('meeting');
  });

  it('returns workspace when personality has a running task', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ startedAt: NOW - 20_000 });
    const zone = computeZoneForAgent(p, [task], new Set(), undefined, NOW);
    expect(zone).toBe('workspace');
  });

  it('returns break-room when idle for > 60 s', () => {
    const p = makePersonality({ id: 'p-001' });
    const zone = computeZoneForAgent(p, [], new Set(), NOW - 70_000, NOW);
    expect(zone).toBe('break-room');
  });

  it('meeting takes priority over break-room', () => {
    const p = makePersonality({ id: 'p-001' });
    // Idle for >60s but also in meeting pairs
    const zone = computeZoneForAgent(p, [], new Set(['p-001']), NOW - 70_000, NOW);
    expect(zone).toBe('meeting');
  });
});

// ── AgentWorldWidget component ─────────────────────────────────────────────────

describe('AgentWorldWidget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
  });

  it('shows empty message when no personalities', async () => {
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/no agents found/i)).toBeInTheDocument();
    });
  });

  it('renders agent cards for each personality', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        makePersonality({ id: 'p-1', name: 'Alice', isActive: true }),
        makePersonality({ id: 'p-2', name: 'Bob', isActive: true }),
      ],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('respects maxAgents cap', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makePersonality({ id: `p-${i}`, name: `Agent ${i}`, isActive: true })
    );
    mockFetchPersonalities.mockResolvedValue({ personalities: many });
    renderWidget({ maxAgents: 3 });
    await waitFor(() => {
      expect(screen.getByText('Agent 0')).toBeInTheDocument();
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Agent 2')).toBeInTheDocument();
      expect(screen.queryByText('Agent 3')).not.toBeInTheDocument();
    });
  });

  it('renders an agent card for an active personality', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'FRIDAY', isActive: true })],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('FRIDAY')).toBeInTheDocument();
    });
    // Should show "idle" state label when no running tasks
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('shows writing label when personality has a running task (> 2 s)', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    mockFetchTasks.mockResolvedValue({
      tasks: [makeTask({ personalityId: 'p-1', startedAt: Date.now() - 5_000 })],
      total: 1,
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('writing')).toBeInTheDocument();
    });
  });

  it('shows thinking label for a very recently started task (< 2 s)', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    mockFetchTasks.mockResolvedValue({
      tasks: [makeTask({ personalityId: 'p-1', startedAt: Date.now() - 500 })],
      total: 1,
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('thinking')).toBeInTheDocument();
    });
  });

  it('shows offline label for inactive personality', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Ghost', isActive: false })],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Ghost')).toBeInTheDocument();
      expect(screen.getByText('offline')).toBeInTheDocument();
    });
  });

  it('renders an accessible list container', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByRole('list', { name: /agent world/i })).toBeInTheDocument();
    });
  });

  it('uses personality name in card title attribute', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'T.Ron', isActive: true })],
    });
    renderWidget();
    await waitFor(() => {
      const card = screen.getByTitle(/T\.Ron/i);
      expect(card).toBeInTheDocument();
    });
  });
});

// ── View mode prop ─────────────────────────────────────────────────────────────

describe('view mode prop', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
  });

  it('defaults to grid view (no zone boxes visible)', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  it('shows zone boxes when viewMode="map"', async () => {
    renderWidget({ viewMode: 'map' });
    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });
  });

  it('shows grid (no zone boxes) when viewMode="grid"', async () => {
    renderWidget({ viewMode: 'grid' });
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
  });

  it('does not render toggle buttons inside the widget', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.queryByTitle('Card grid view')).not.toBeInTheDocument();
    expect(screen.queryByTitle('World map view')).not.toBeInTheDocument();
  });

  it('shows zone boxes when viewMode="large"', async () => {
    renderWidget({ viewMode: 'large' });
    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });
  });
});

// ── Large view ────────────────────────────────────────────────────────────────

describe('large view', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
  });

  it('renders zone boxes in large mode', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    renderWidget({ viewMode: 'large' });
    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
      expect(screen.getByText('Meeting Room')).toBeInTheDocument();
      expect(screen.getByText('Break Room')).toBeInTheDocument();
    });
  });

  it('renders agents as cards (with state label) not pills', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    renderWidget({ viewMode: 'large' });
    // AgentCard shows a state label; AgentPill does not
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('idle')).toBeInTheDocument();
    });
  });

  it('calls onAgentClick with personalityId in large mode', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    const onAgentClick = vi.fn();
    renderWidget({ viewMode: 'large', onAgentClick });
    await waitFor(() => expect(screen.getByText('Workspace')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle(/Alice/i));
    expect(onAgentClick).toHaveBeenCalledWith('p-1');
  });

  it('accessible list container is present in large mode', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    renderWidget({ viewMode: 'large' });
    await waitFor(() => {
      expect(screen.getByRole('list', { name: /agent world large view/i })).toBeInTheDocument();
    });
  });
});

// ── Map view zones ────────────────────────────────────────────────────────────

describe('map view zones', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
  });

  it('workspace zone renders when agents are present', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    renderWidget({ viewMode: 'map' });
    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
      expect(screen.getByText('Meeting Room')).toBeInTheDocument();
    });
  });

  it('shows agent in meeting zone when they are a meeting pair', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        makePersonality({ id: 'p-1', name: 'Alice', isActive: true }),
        makePersonality({ id: 'p-2', name: 'Bob', isActive: true }),
      ],
    });
    // Two agents sharing a correlationId → both are meeting pairs
    mockFetchTasks.mockResolvedValue({
      tasks: [
        makeTask({
          id: 't-1',
          personalityId: 'p-1',
          correlationId: 'corr-1',
          startedAt: Date.now() - 20_000,
        }),
        makeTask({
          id: 't-2',
          personalityId: 'p-2',
          correlationId: 'corr-1',
          startedAt: Date.now() - 20_000,
        }),
      ],
      total: 2,
    });
    renderWidget({ viewMode: 'map' });
    await waitFor(() => {
      expect(screen.getByText('Meeting Room')).toBeInTheDocument();
    });
  });

  it('break-room zone renders', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    renderWidget({ viewMode: 'map' });
    await waitFor(() => {
      expect(screen.getByText('Break Room')).toBeInTheDocument();
    });
  });

  it('accessible list container is present in map mode', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    renderWidget({ viewMode: 'map' });
    await waitFor(() => {
      expect(screen.getByRole('list', { name: /agent world map/i })).toBeInTheDocument();
    });
  });
});

// ── Agent click-through ────────────────────────────────────────────────────────

describe('agent click-through', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
  });

  it('calls onAgentClick with personalityId in grid mode', async () => {
    const onAgentClick = vi.fn();
    renderWidget({ onAgentClick });
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle(/Alice/i));
    expect(onAgentClick).toHaveBeenCalledWith('p-1');
  });

  it('calls onAgentClick with personalityId in map mode', async () => {
    const onAgentClick = vi.fn();
    renderWidget({ onAgentClick, viewMode: 'map' });
    await waitFor(() => expect(screen.getByText('Workspace')).toBeInTheDocument());
    // Find the agent pill and click it
    const pill = screen.getByTitle(/Alice/i);
    fireEvent.click(pill);
    expect(onAgentClick).toHaveBeenCalledWith('p-1');
  });

  it('no error when onAgentClick prop is omitted', async () => {
    // No onAgentClick — clicking should not throw
    renderWidget();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(() => fireEvent.click(screen.getByTitle(/Alice/i))).not.toThrow();
  });
});

// ── Synthetic chat task (chat-in-progress activity) ────────────────────────────

describe('synthetic chat task activity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Friday', isActive: true })],
    });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
  });

  it('shows thinking state when a __chat_ synthetic task is present (< 2 s)', async () => {
    const now = Date.now();
    mockFetchTasks.mockResolvedValue({
      tasks: [
        makeTask({
          id: '__chat_p-1',
          personalityId: 'p-1',
          startedAt: now, // just started → < 2 s → thinking
        }),
      ],
      total: 1,
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Friday')).toBeInTheDocument();
      expect(screen.getByText('thinking')).toBeInTheDocument();
    });
  });

  it('shows writing state when synthetic task has been running > 2 s', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        makeTask({
          id: '__chat_p-1',
          personalityId: 'p-1',
          startedAt: Date.now() - 5_000, // 5 s ago → typing/writing
        }),
      ],
      total: 1,
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Friday')).toBeInTheDocument();
      expect(screen.getByText('writing')).toBeInTheDocument();
    });
  });
});

// ── Sub-agent delegation cards ─────────────────────────────────────────────────

describe('sub-agent delegation cards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
  });

  function makeDelegation(
    overrides: Partial<{
      delegationId: string;
      profileName: string;
      task: string;
      initiatedByPersonalityId: string;
    }> = {}
  ) {
    return {
      delegationId: 'd-001',
      profileId: 'prof-1',
      profileName: 'researcher',
      task: 'analyze codebase',
      status: 'running',
      depth: 1,
      tokensUsed: 5000,
      tokenBudget: 50000,
      startedAt: Date.now() - 3_000,
      elapsedMs: 3000,
      ...overrides,
    } as any;
  }

  it('renders sub-agent card in grid mode when delegation is active', async () => {
    mockFetchActiveDelegations.mockResolvedValue({
      delegations: [makeDelegation({ profileName: 'researcher' })],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('researcher')).toBeInTheDocument();
      expect(screen.getByText('delegating')).toBeInTheDocument();
    });
  });

  it('shows no agents message only when both personalities and delegations are empty', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText(/no agents found/i)).toBeInTheDocument();
    });
  });

  it('shows delegation even when personalities list is empty', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchActiveDelegations.mockResolvedValue({
      delegations: [makeDelegation({ profileName: 'analyst' })],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('analyst')).toBeInTheDocument();
    });
  });

  it('renders sub-agent pill in map workspace zone', async () => {
    mockFetchActiveDelegations.mockResolvedValue({
      delegations: [makeDelegation({ profileName: 'researcher' })],
    });
    renderWidget({ viewMode: 'map' });
    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
      expect(screen.getByTitle(/\[sub-agent\] researcher/i)).toBeInTheDocument();
    });
  });

  it('renders sub-agent card in large workspace zone', async () => {
    mockFetchActiveDelegations.mockResolvedValue({
      delegations: [makeDelegation({ profileName: 'planner' })],
    });
    renderWidget({ viewMode: 'large' });
    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
      expect(screen.getByTitle(/\[sub-agent\] planner/i)).toBeInTheDocument();
    });
  });

  it('shows meeting label on initiating personality when it has an active delegation', async () => {
    mockFetchActiveDelegations.mockResolvedValue({
      delegations: [makeDelegation({ initiatedByPersonalityId: 'p-1' })],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('meeting')).toBeInTheDocument();
    });
  });

  it('does not show meeting label when delegation is initiated by a different personality', async () => {
    mockFetchActiveDelegations.mockResolvedValue({
      delegations: [makeDelegation({ initiatedByPersonalityId: 'p-999' })],
    });
    renderWidget();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('idle')).toBeInTheDocument();
    });
    expect(screen.queryByText('meeting')).not.toBeInTheDocument();
  });
});

// ── Zoom prop ─────────────────────────────────────────────────────────────────

describe('zoom prop', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({
      personalities: [makePersonality({ id: 'p-1', name: 'Alice', isActive: true })],
    });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchActiveDelegations.mockResolvedValue({ delegations: [] });
  });

  it('map container has fontSize 11px when zoom=1', async () => {
    renderWidget({ viewMode: 'map', zoom: 1 });
    await waitFor(() => expect(screen.getByText('Workspace')).toBeInTheDocument());
    const list = screen.getByRole('list', { name: /agent world map/i });
    expect(list).toHaveStyle({ fontSize: '11px' });
  });

  it('map container has fontSize 22px when zoom=2', async () => {
    renderWidget({ viewMode: 'map', zoom: 2 });
    await waitFor(() => expect(screen.getByText('Workspace')).toBeInTheDocument());
    const list = screen.getByRole('list', { name: /agent world map/i });
    expect(list).toHaveStyle({ fontSize: '22px' });
  });

  it('map container has fontSize 6px when zoom=0.5 (Math.round(5.5)=6)', async () => {
    renderWidget({ viewMode: 'map', zoom: 0.5 });
    await waitFor(() => expect(screen.getByText('Workspace')).toBeInTheDocument());
    const list = screen.getByRole('list', { name: /agent world map/i });
    expect(list).toHaveStyle({ fontSize: '6px' });
  });

  it('grid view applies scale transform when zoom=2', async () => {
    renderWidget({ viewMode: 'grid', zoom: 2 });
    await waitFor(() =>
      expect(screen.getByRole('list', { name: /^agent world$/i })).toBeInTheDocument()
    );
    const list = screen.getByRole('list', { name: /^agent world$/i });
    expect(list).toHaveStyle({ transform: 'scale(2)' });
  });
});
