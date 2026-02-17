// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock Monaco editor
vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor">Monaco Editor</div>,
  loader: { config: vi.fn() },
}));

// Mock hooks
vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    messages: [],
    input: '',
    setInput: vi.fn(),
    handleSend: vi.fn(),
    isPending: false,
    clearMessages: vi.fn(),
  }),
}));

vi.mock('../hooks/useVoice', () => ({
  useVoice: () => ({
    voiceEnabled: false,
    isListening: false,
    supported: false,
    transcript: '',
    toggleVoice: vi.fn(),
    speak: vi.fn(),
    clearTranscript: vi.fn(),
  }),
}));

vi.mock('../hooks/usePushToTalk', () => ({
  usePushToTalk: () => ({
    isActive: false,
    audioLevel: 0,
    duration: 0,
    transcript: '',
    error: null,
  }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}));

vi.mock('./VoiceOverlay', () => ({
  VoiceOverlay: () => null,
}));

vi.mock('../api/client', () => ({
  fetchPersonalities: vi.fn().mockResolvedValue({ personalities: [] }),
  executeTerminalCommand: vi.fn(),
  executeCode: vi.fn(),
  fetchExecutionSessions: vi.fn(),
  terminateExecutionSession: vi.fn(),
  fetchExecutionHistory: vi.fn(),
  approveExecution: vi.fn(),
  rejectExecution: vi.fn(),
  fetchExecutionConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';
import { EditorPage } from './EditorPage';

const mockFetchExecutionConfig = vi.mocked(api.fetchExecutionConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExecutionSessions = vi.mocked(api.fetchExecutionSessions);
const mockFetchExecutionHistory = vi.mocked(api.fetchExecutionHistory);
const mockTerminateExecutionSession = vi.mocked(api.terminateExecutionSession);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <EditorPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_SESSIONS = {
  sessions: [
    {
      id: 'sess-abc123def456',
      runtime: 'node',
      status: 'active',
      createdAt: Date.now() - 60000,
      lastActivity: Date.now() - 5000,
    },
    {
      id: 'sess-xyz789ghi012',
      runtime: 'python',
      status: 'idle',
      createdAt: Date.now() - 120000,
      lastActivity: Date.now() - 60000,
    },
  ],
};

const MOCK_HISTORY = {
  executions: [
    {
      id: 'exec-1',
      sessionId: 'sess-abc123def456',
      exitCode: 0,
      stdout: 'Hello, world!',
      stderr: '',
      duration: 150,
      createdAt: Date.now() - 30000,
    },
    {
      id: 'exec-2',
      sessionId: 'sess-abc123def456',
      exitCode: 1,
      stdout: '',
      stderr: 'Error: something failed',
      duration: 80,
      createdAt: Date.now() - 20000,
    },
  ],
};

describe('EditorPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (api.fetchPersonalities as ReturnType<typeof vi.fn>).mockResolvedValue({ personalities: [] });
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowMultimodal: false,
    });
    mockFetchExecutionSessions.mockResolvedValue(MOCK_SESSIONS);
    mockFetchExecutionHistory.mockResolvedValue({
      ...MOCK_HISTORY,
      total: MOCK_HISTORY.executions.length,
    });
  });

  // ── Rendering ──────────────────────────────────────────────

  it('renders the Editor heading', async () => {
    renderComponent();
    expect(await screen.findByText('Editor')).toBeInTheDocument();
  });

  it('renders bottom panel tab bar with all tabs', async () => {
    renderComponent();
    expect(await screen.findByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  // ── Tab switching ──────────────────────────────────────────

  it('switches to Sessions tab and shows sessions', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('active')).toBeInTheDocument();
    expect(screen.getByText('node')).toBeInTheDocument();
  });

  it('switches to History tab and shows execution history', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('150ms')).toBeInTheDocument();
  });

  // ── Execution gate ─────────────────────────────────────────

  it('shows disabled state in Sessions when execution is off', async () => {
    const user = userEvent.setup();
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: false,
      allowProactive: false,
      allowExperiments: false,
      allowMultimodal: false,
    });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('Code Execution Not Enabled')).toBeInTheDocument();
  });

  // ── Sessions tab actions ───────────────────────────────────

  it('shows empty sessions state', async () => {
    const user = userEvent.setup();
    mockFetchExecutionSessions.mockResolvedValue({ sessions: [] });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
  });

  it('can terminate a session', async () => {
    const user = userEvent.setup();
    mockTerminateExecutionSession.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    await screen.findByText('active');
    const terminateButtons = screen.getAllByTitle('Terminate session');
    fireEvent.click(terminateButtons[0]);
    await waitFor(() => {
      expect(mockTerminateExecutionSession).toHaveBeenCalled();
      expect(mockTerminateExecutionSession.mock.calls[0][0]).toBe('sess-abc123def456');
    });
  });

  // ── History tab ────────────────────────────────────────────

  it('shows empty history state', async () => {
    const user = userEvent.setup();
    mockFetchExecutionHistory.mockResolvedValue({ executions: [], total: 0 });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('No execution history')).toBeInTheDocument();
  });
});
