// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CodeExecutionPage } from './CodeExecutionPage';

vi.mock('../api/client', () => ({
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

const mockFetchExecutionConfig = vi.mocked(api.fetchExecutionConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExecutionSessions = vi.mocked(api.fetchExecutionSessions);
const mockFetchExecutionHistory = vi.mocked(api.fetchExecutionHistory);
const mockExecuteCode = vi.mocked(api.executeCode);
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
        <CodeExecutionPage />
      </QueryClientProvider>
    </MemoryRouter>,
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

describe('CodeExecutionPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
    });
    mockFetchExecutionSessions.mockResolvedValue(MOCK_SESSIONS);
    mockFetchExecutionHistory.mockResolvedValue({ ...MOCK_HISTORY, total: MOCK_HISTORY.executions.length });
  });

  // ── Rendering ──────────────────────────────────────────────

  it('renders the heading', async () => {
    renderComponent();
    expect(await screen.findByText('Code Execution')).toBeInTheDocument();
  });

  it('shows disabled state when config and security policy both disallow', async () => {
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: false,
    });
    renderComponent();
    expect(await screen.findByText('Code Execution Not Enabled')).toBeInTheDocument();
  });

  it('shows enabled state when only security policy allows', async () => {
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: false } });
    renderComponent();
    expect(await screen.findByText('Runtime')).toBeInTheDocument();
  });

  it('shows enabled state when only config.enabled is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: false,
    });
    renderComponent();
    expect(await screen.findByText('Runtime')).toBeInTheDocument();
  });

  // ── Tabs ───────────────────────────────────────────────────

  it('renders Execute, Sessions, and History tabs', async () => {
    renderComponent();
    await screen.findByText('Runtime');
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  // ── Execute Tab ────────────────────────────────────────────

  it('shows runtime selector with options', async () => {
    renderComponent();
    await screen.findByText('Runtime');
    expect(screen.getByDisplayValue('Node.js')).toBeInTheDocument();
  });

  it('shows code textarea with placeholder', async () => {
    renderComponent();
    await screen.findByText('Runtime');
    const textarea = screen.getByPlaceholderText('console.log("Hello, world!");');
    expect(textarea).toBeInTheDocument();
  });

  it('executes code when Execute button is clicked', async () => {
    const user = userEvent.setup();
    mockExecuteCode.mockResolvedValue({
      id: 'exec-new',
      sessionId: 'sess-new',
      exitCode: 0,
      stdout: '42',
      stderr: '',
      duration: 50,
      truncated: false,
    });
    renderComponent();
    await screen.findByText('Runtime');
    const textarea = screen.getByPlaceholderText('console.log("Hello, world!");');
    await user.type(textarea, 'console.log(42)');
    // Find the Execute button (not the tab) - tab is first, action button is second in DOM
    const executeButtons = screen.getAllByText('Execute');
    fireEvent.click(executeButtons[executeButtons.length - 1]);
    await waitFor(() => {
      expect(mockExecuteCode).toHaveBeenCalled();
      expect(mockExecuteCode.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          runtime: 'node',
          code: 'console.log(42)',
        }),
      );
    });
  });

  // ── Sessions Tab ───────────────────────────────────────────

  it('shows sessions when Sessions tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Runtime');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('active')).toBeInTheDocument();
    expect(screen.getByText('node')).toBeInTheDocument();
  });

  it('shows empty sessions state', async () => {
    const user = userEvent.setup();
    mockFetchExecutionSessions.mockResolvedValue({ sessions: [] });
    renderComponent();
    await screen.findByText('Runtime');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
  });

  it('can terminate a session', async () => {
    const user = userEvent.setup();
    mockTerminateExecutionSession.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Runtime');
    await user.click(screen.getByText('Sessions'));
    await screen.findByText('active');
    const terminateButtons = screen.getAllByTitle('Terminate session');
    fireEvent.click(terminateButtons[0]);
    await waitFor(() => {
      expect(mockTerminateExecutionSession).toHaveBeenCalled();
      expect(mockTerminateExecutionSession.mock.calls[0][0]).toBe('sess-abc123def456');
    });
  });

  // ── History Tab ────────────────────────────────────────────

  it('shows execution history when History tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Runtime');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('150ms')).toBeInTheDocument();
  });

  it('shows empty history state', async () => {
    const user = userEvent.setup();
    mockFetchExecutionHistory.mockResolvedValue({ executions: [], total: 0 });
    renderComponent();
    await screen.findByText('Runtime');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('No execution history')).toBeInTheDocument();
  });
});
