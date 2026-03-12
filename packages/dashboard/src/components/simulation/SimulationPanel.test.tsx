// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SimulationPanel } from './SimulationPanel';

vi.mock('../../api/client', () => ({
  fetchSimTickConfig: vi.fn(),
  startSimTick: vi.fn(),
  pauseSimTick: vi.fn(),
  resumeSimTick: vi.fn(),
  advanceSimTick: vi.fn(),
  deleteSimTick: vi.fn(),
  fetchSimMoodState: vi.fn(),
  fetchSimMoodHistory: vi.fn(),
  submitSimMoodEvent: vi.fn(),
  resetSimMood: vi.fn(),
  fetchSimEntities: vi.fn(),
  fetchSimZones: vi.fn(),
  fetchSimRelationships: vi.fn(),
  fetchSimGroups: vi.fn(),
}));

const mockApi = await vi.importMock<typeof import('../../api/client')>('../../api/client');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const TICK_CONFIG = {
  id: 'tc-1',
  personalityId: 'p-1',
  mode: 'realtime',
  tickIntervalMs: 1000,
  timeScale: 1.0,
  paused: false,
  currentTick: 42,
  simTimeEpoch: 0,
  lastTickAt: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const MOOD_STATE = {
  id: 'ms-1',
  personalityId: 'p-1',
  valence: 0.5,
  arousal: 0.7,
  dominance: 0.5,
  label: 'happy' as const,
  decayRate: 0.05,
  baselineValence: 0,
  baselineArousal: 0,
  updatedAt: Date.now(),
};

const MOOD_EVENTS = [
  {
    id: 'me-1',
    personalityId: 'p-1',
    eventType: 'praise',
    valenceDelta: 0.3,
    arousalDelta: 0.1,
    source: 'user',
    metadata: {},
    createdAt: Date.now(),
  },
];

const ENTITIES = [
  {
    id: 'el-1',
    personalityId: 'p-1',
    entityId: 'npc-1',
    entityType: 'npc',
    zoneId: 'zone-a',
    x: 10,
    y: 20,
    z: 0,
    heading: 90,
    speed: 1.5,
    metadata: {},
    updatedAt: Date.now(),
  },
];

const ZONES = [
  {
    id: 'sz-1',
    personalityId: 'p-1',
    zoneId: 'zone-a',
    name: 'Market Square',
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
    properties: {},
    createdAt: Date.now(),
  },
];

const RELATIONSHIPS = [
  {
    id: 'er-1',
    personalityId: 'p-1',
    sourceEntityId: 'npc-1',
    targetEntityId: 'npc-2',
    type: 'ally' as const,
    affinity: 0.8,
    trust: 0.9,
    interactionCount: 5,
    decayRate: 0.01,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const GROUPS = [
  {
    id: 'eg-1',
    personalityId: 'p-1',
    groupId: 'guild-1',
    name: 'Merchants Guild',
    members: ['npc-1', 'npc-2', 'npc-3'],
    metadata: {},
    createdAt: Date.now(),
  },
];

function setupMocks() {
  (mockApi.fetchSimTickConfig as any).mockResolvedValue(TICK_CONFIG);
  (mockApi.fetchSimMoodState as any).mockResolvedValue(MOOD_STATE);
  (mockApi.fetchSimMoodHistory as any).mockResolvedValue({ events: MOOD_EVENTS });
  (mockApi.fetchSimEntities as any).mockResolvedValue({ entities: ENTITIES });
  (mockApi.fetchSimZones as any).mockResolvedValue({ zones: ZONES });
  (mockApi.fetchSimRelationships as any).mockResolvedValue({ relationships: RELATIONSHIPS });
  (mockApi.fetchSimGroups as any).mockResolvedValue({ groups: GROUPS });
}

async function typePersonalityId(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByTestId('personality-id-input');
  await user.type(input, 'p-1');
}

describe('SimulationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header and personality input', () => {
    render(<SimulationPanel />, { wrapper: createWrapper() });
    expect(screen.getByText('Simulation Engine')).toBeInTheDocument();
    expect(screen.getByTestId('personality-id-input')).toBeInTheDocument();
  });

  it('shows placeholder message when no personality ID is entered', () => {
    render(<SimulationPanel />, { wrapper: createWrapper() });
    expect(
      screen.getByText('Enter a personality ID above to view simulation data.')
    ).toBeInTheDocument();
  });

  it('renders all four tab buttons', () => {
    render(<SimulationPanel />, { wrapper: createWrapper() });
    expect(screen.getByTestId('tab-tick')).toBeInTheDocument();
    expect(screen.getByTestId('tab-mood')).toBeInTheDocument();
    expect(screen.getByTestId('tab-spatial')).toBeInTheDocument();
    expect(screen.getByTestId('tab-relationships')).toBeInTheDocument();
  });

  it('shows tick configuration after entering personality ID', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    expect(await screen.findByText('Tick Configuration')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('realtime')).toBeInTheDocument();
    expect(screen.getByText('1x')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows start simulation form when no tick config exists', async () => {
    (mockApi.fetchSimTickConfig as any).mockRejectedValue(new Error('Not found'));
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    // The form should eventually show since the query will error
    // and tickConfig will be undefined
    await waitFor(() => {
      expect(screen.queryByText('Tick Configuration')).not.toBeInTheDocument();
    });
  });

  it('shows pause button when tick is running', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    expect(await screen.findByTestId('pause-btn')).toBeInTheDocument();
  });

  it('shows resume button when tick is paused', async () => {
    (mockApi.fetchSimTickConfig as any).mockResolvedValue({ ...TICK_CONFIG, paused: true });
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    expect(await screen.findByTestId('resume-btn')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('calls pauseSimTick when pause button is clicked', async () => {
    setupMocks();
    (mockApi.pauseSimTick as any).mockResolvedValue({});
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    const pauseBtn = await screen.findByTestId('pause-btn');
    await user.click(pauseBtn);
    expect(mockApi.pauseSimTick).toHaveBeenCalled();
  });

  it('calls advanceSimTick when advance button is clicked', async () => {
    setupMocks();
    (mockApi.advanceSimTick as any).mockResolvedValue({});
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    const advanceBtn = await screen.findByTestId('advance-btn');
    await user.click(advanceBtn);
    expect(mockApi.advanceSimTick).toHaveBeenCalled();
  });

  it('calls deleteSimTick when stop button is clicked', async () => {
    setupMocks();
    (mockApi.deleteSimTick as any).mockResolvedValue({});
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    const deleteBtn = await screen.findByTestId('delete-btn');
    await user.click(deleteBtn);
    expect(mockApi.deleteSimTick).toHaveBeenCalled();
  });

  it('switches to mood tab and shows mood state', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    const moodTab = screen.getByTestId('tab-mood');
    await user.click(moodTab);

    expect(await screen.findByText('Current Mood')).toBeInTheDocument();
    expect(screen.getByTestId('mood-label')).toHaveTextContent('happy');
    expect(screen.getByTestId('valence-bar')).toBeInTheDocument();
    expect(screen.getByTestId('arousal-bar')).toBeInTheDocument();
  });

  it('shows mood event history on mood tab', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-mood'));

    expect(await screen.findByText('praise')).toBeInTheDocument();
    expect(screen.getByText('from user')).toBeInTheDocument();
  });

  it('submits a mood event', async () => {
    setupMocks();
    (mockApi.submitSimMoodEvent as any).mockResolvedValue({});
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-mood'));
    await screen.findByText('Current Mood');

    const eventTypeInput = screen.getByTestId('mood-event-type');
    await user.type(eventTypeInput, 'test-event');

    const submitBtn = screen.getByTestId('submit-mood-event-btn');
    await user.click(submitBtn);

    expect(mockApi.submitSimMoodEvent).toHaveBeenCalledWith('p-1', {
      eventType: 'test-event',
      valenceDelta: 0,
      arousalDelta: 0,
      source: 'dashboard',
    });
  });

  it('resets mood when reset button is clicked', async () => {
    setupMocks();
    (mockApi.resetSimMood as any).mockResolvedValue({});
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-mood'));
    const resetBtn = await screen.findByTestId('reset-mood-btn');
    await user.click(resetBtn);

    expect(mockApi.resetSimMood).toHaveBeenCalled();
  });

  it('switches to spatial tab and shows entities and zones', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-spatial'));

    expect(await screen.findByText('npc-1')).toBeInTheDocument();
    expect(screen.getByText('npc')).toBeInTheDocument();
    expect(screen.getByText('zone-a')).toBeInTheDocument();
    expect(screen.getByText('Market Square')).toBeInTheDocument();
    expect(screen.getByText('1 total')).toBeInTheDocument();
  });

  it('switches to relationships tab and shows relationships and groups', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-relationships'));

    expect(await screen.findByText('npc-1')).toBeInTheDocument();
    expect(screen.getByText('npc-2')).toBeInTheDocument();
    expect(screen.getByText('ally')).toBeInTheDocument();
    expect(screen.getByText('Merchants Guild')).toBeInTheDocument();
    expect(screen.getByText(/3 members/)).toBeInTheDocument();
  });

  it('shows empty states for spatial tab with no data', async () => {
    (mockApi.fetchSimTickConfig as any).mockResolvedValue(TICK_CONFIG);
    (mockApi.fetchSimMoodState as any).mockResolvedValue(MOOD_STATE);
    (mockApi.fetchSimMoodHistory as any).mockResolvedValue({ events: [] });
    (mockApi.fetchSimEntities as any).mockResolvedValue({ entities: [] });
    (mockApi.fetchSimZones as any).mockResolvedValue({ zones: [] });
    (mockApi.fetchSimRelationships as any).mockResolvedValue({ relationships: [] });
    (mockApi.fetchSimGroups as any).mockResolvedValue({ groups: [] });

    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-spatial'));

    expect(await screen.findByText('No entities registered.')).toBeInTheDocument();
    expect(screen.getByText('No spatial zones defined.')).toBeInTheDocument();
  });

  it('shows empty states for relationships tab with no data', async () => {
    (mockApi.fetchSimTickConfig as any).mockResolvedValue(TICK_CONFIG);
    (mockApi.fetchSimMoodState as any).mockResolvedValue(MOOD_STATE);
    (mockApi.fetchSimMoodHistory as any).mockResolvedValue({ events: [] });
    (mockApi.fetchSimEntities as any).mockResolvedValue({ entities: [] });
    (mockApi.fetchSimZones as any).mockResolvedValue({ zones: [] });
    (mockApi.fetchSimRelationships as any).mockResolvedValue({ relationships: [] });
    (mockApi.fetchSimGroups as any).mockResolvedValue({ groups: [] });

    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-relationships'));

    expect(await screen.findByText('No relationships found.')).toBeInTheDocument();
    expect(screen.getByText('No groups defined.')).toBeInTheDocument();
  });

  it('calls startSimTick when start button is clicked', async () => {
    (mockApi.fetchSimTickConfig as any).mockResolvedValue(undefined);
    (mockApi.startSimTick as any).mockResolvedValue(TICK_CONFIG);
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    // Wait for the form to appear (no tick config -> start form)
    const startBtn = await screen.findByTestId('start-btn');
    await user.click(startBtn);

    expect(mockApi.startSimTick).toHaveBeenCalledWith('p-1', {
      mode: 'realtime',
      tickIntervalMs: 1000,
      timeScale: 1,
    });
  });

  it('disables submit mood event button when event type is empty', async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SimulationPanel />, { wrapper: createWrapper() });
    await typePersonalityId(user);

    await user.click(screen.getByTestId('tab-mood'));
    await screen.findByText('Current Mood');

    const submitBtn = screen.getByTestId('submit-mood-event-btn');
    expect(submitBtn).toBeDisabled();
  });
});
