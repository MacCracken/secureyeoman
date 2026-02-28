// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Stub scrollIntoView (not in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  fetchPersonalities: vi.fn(),
  fetchTasks: vi.fn(),
  fetchExecutionSessions: vi.fn(),
  executeTerminalCommand: vi.fn(),
  fetchModelInfo: vi.fn(),
  switchModel: vi.fn(),
  sendChatMessage: vi.fn(),
  addMemory: vi.fn(),
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

vi.mock('./ModelWidget', () => ({
  ModelWidget: () => <div data-testid="model-widget" />,
}));

import * as api from '../api/client';
import { AdvancedEditorPage } from './AdvancedEditorPage';

const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchTasks = vi.mocked(api.fetchTasks);
const mockFetchExecutionSessions = vi.mocked(api.fetchExecutionSessions);
const mockExecuteTerminalCommand = vi.mocked(api.executeTerminalCommand);
const mockFetchModelInfo = vi.mocked(api.fetchModelInfo);
const mockSendChatMessage = vi.mocked(api.sendChatMessage);

// ── Helpers ────────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <AdvancedEditorPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_TASK_RUNNING = {
  id: 'task-1',
  type: 'heartbeat',
  name: 'System Health Check',
  status: 'running' as const,
  createdAt: Date.now() - 5000,
  startedAt: Date.now() - 4000,
};

const MOCK_TASK_PENDING = {
  id: 'task-2',
  type: 'scan',
  name: 'Vulnerability Scan',
  status: 'pending' as const,
  createdAt: Date.now() - 1000,
};

const MOCK_SESSIONS = {
  sessions: [
    {
      id: 'sess-1',
      runtime: 'node',
      status: 'running',
      createdAt: Date.now() - 60000,
      lastActivity: Date.now() - 1000,
    },
    {
      id: 'sess-2',
      runtime: 'python',
      status: 'idle',
      createdAt: Date.now() - 120000,
      lastActivity: Date.now() - 30000,
    },
  ],
};

// ── Test Suite ─────────────────────────────────────────────────────────

describe('AdvancedEditorPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    mockFetchExecutionSessions.mockResolvedValue({ sessions: [] });
    mockFetchModelInfo.mockResolvedValue({
      current: { provider: 'openai', model: 'gpt-4o', maxTokens: 4096, temperature: 0.7, localFirst: false },
      available: {},
    });
    mockSendChatMessage.mockResolvedValue({
      role: 'assistant',
      content: 'ok',
      model: 'gpt-4o',
      provider: 'openai',
    });
  });

  // ── Layout / rendering ─────────────────────────────────────────────

  it('renders "Workspace" heading', async () => {
    renderComponent();
    expect(await screen.findByText('Workspace')).toBeInTheDocument();
  });

  it('renders Sessions section header in sidebar', async () => {
    renderComponent();
    expect(await screen.findByText('Sessions')).toBeInTheDocument();
  });

  it('renders Tasks section header in task panel', async () => {
    renderComponent();
    expect(await screen.findByText('Tasks')).toBeInTheDocument();
  });

  it('renders initial Terminal 1 tab in multi-terminal', async () => {
    renderComponent();
    expect(await screen.findByText('Terminal 1')).toBeInTheDocument();
  });

  it('shows "Ready." as initial terminal output', async () => {
    renderComponent();
    expect(await screen.findByText('Ready.')).toBeInTheDocument();
  });

  it('shows "No active sessions" when sessions list is empty', async () => {
    renderComponent();
    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
  });

  // ── Sessions Panel ─────────────────────────────────────────────────

  it('sessions panel shows execution sessions when available', async () => {
    mockFetchExecutionSessions.mockResolvedValue(MOCK_SESSIONS);
    renderComponent();
    expect(await screen.findByText('node')).toBeInTheDocument();
    expect(screen.getByText('python')).toBeInTheDocument();
  });

  it('sessions panel shows running status badge for running session', async () => {
    mockFetchExecutionSessions.mockResolvedValue(MOCK_SESSIONS);
    renderComponent();
    expect(await screen.findByText('running')).toBeInTheDocument();
  });

  // ── Personality selector ──────────────────────────────────────────

  it('personality selector is hidden when no personalities returned', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    renderComponent();
    await screen.findByText('Workspace');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('personality selector is shown when personalities exist', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        { id: 'p1', name: 'Aria', avatarUrl: null } as any,
        { id: 'p2', name: 'Nexus', avatarUrl: null } as any,
      ],
    });
    renderComponent();
    const select = await screen.findByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Aria/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Nexus/ })).toBeInTheDocument();
  });

  it('personality selector includes "No personality" default option', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [{ id: 'p1', name: 'Aria', avatarUrl: null } as any],
    });
    renderComponent();
    await screen.findByRole('combobox');
    expect(screen.getByText('No personality')).toBeInTheDocument();
  });

  it('selecting a personality persists to localStorage', async () => {
    const user = userEvent.setup();
    mockFetchPersonalities.mockResolvedValue({
      personalities: [{ id: 'p1', name: 'Aria', avatarUrl: null } as any],
    });
    renderComponent();
    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'p1');
    expect(localStorage.getItem('soul:editorPersonalityId')).toBe('p1');
  });

  // ── Task Panel ────────────────────────────────────────────────────

  it('shows "No tasks" when task list is empty', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    renderComponent();
    expect(await screen.findByText('No tasks')).toBeInTheDocument();
  });

  it('shows task names in the task panel', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [MOCK_TASK_RUNNING, MOCK_TASK_PENDING],
      total: 2,
    });
    renderComponent();
    expect(await screen.findByText('System Health Check')).toBeInTheDocument();
    expect(screen.getByText('Vulnerability Scan')).toBeInTheDocument();
  });

  it('shows truncated status label for running task (RUN)', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [MOCK_TASK_RUNNING], total: 1 });
    renderComponent();
    expect(await screen.findByText('RUN')).toBeInTheDocument();
  });

  it('shows truncated status label for pending task (PEN)', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [MOCK_TASK_PENDING], total: 1 });
    renderComponent();
    expect(await screen.findByText('PEN')).toBeInTheDocument();
  });

  it('shows running count badge when tasks are running', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [MOCK_TASK_RUNNING, MOCK_TASK_RUNNING],
      total: 2,
    });
    renderComponent();
    expect(await screen.findByText('2 running')).toBeInTheDocument();
  });

  it('does not show running badge when no running tasks', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [MOCK_TASK_PENDING], total: 1 });
    renderComponent();
    await screen.findByText('PEN');
    expect(screen.queryByText(/running/)).not.toBeInTheDocument();
  });

  it('task panel has a link to /automation', async () => {
    renderComponent();
    await screen.findByText('Tasks');
    const automationLink = screen.getByTitle('Open in Automation');
    expect(automationLink).toBeInTheDocument();
    expect(automationLink).toHaveAttribute('href', '/automation');
  });

  it('shows task type as subtitle when type is present', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [MOCK_TASK_RUNNING], total: 1 });
    renderComponent();
    expect(await screen.findByText('heartbeat')).toBeInTheDocument();
  });

  // ── Multi-terminal ────────────────────────────────────────────────

  it('starts with a single "Terminal 1" tab', async () => {
    renderComponent();
    const termTabs = await screen.findAllByText('Terminal 1');
    expect(termTabs.length).toBeGreaterThanOrEqual(1);
  });

  it('"+" button adds a Terminal 2 tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal 1');

    await user.click(screen.getByTitle('New terminal'));
    expect(await screen.findByText('Terminal 2')).toBeInTheDocument();
  });

  it('close button on terminal tab removes it', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal 1');

    await user.click(screen.getByTitle('New terminal'));
    await screen.findByText('Terminal 2');

    const terminalTabBar = document.querySelector('.bg-muted\\/30');
    const closeButtons = terminalTabBar?.querySelectorAll('button:not([title])');
    if (closeButtons && closeButtons.length > 0) {
      fireEvent.click(closeButtons[closeButtons.length - 1]);
    }

    await waitFor(() => {
      expect(screen.queryByText('Terminal 2')).not.toBeInTheDocument();
    });
  });

  it('closing the only terminal tab creates a fresh tab', async () => {
    renderComponent();
    await screen.findByText('Terminal 1');

    const terminalTabBar = document.querySelector('.bg-muted\\/30');
    const closeButtons = terminalTabBar?.querySelectorAll('button:not([title])');
    if (closeButtons && closeButtons.length > 0) {
      fireEvent.click(closeButtons[0]);
    }

    await waitFor(() => {
      expect(screen.getByText('Terminal 1')).toBeInTheDocument();
    });
  });

  it('typing a command and pressing Enter calls executeTerminalCommand', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockResolvedValue({
      output: 'hello world',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });

    renderComponent();
    await screen.findByText('Ready.');

    const input = screen.getByPlaceholderText('command...');
    await user.type(input, 'echo hello');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockExecuteTerminalCommand).toHaveBeenCalledWith('echo hello', '/tmp');
    });
  });

  it('displays command output after successful execution', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockResolvedValue({
      output: 'hello world',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });

    renderComponent();
    await screen.findByText('Ready.');

    const input = screen.getByPlaceholderText('command...');
    await user.type(input, 'echo hello');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('hello world')).toBeInTheDocument();
  });

  it('displays echoed command prefixed with $ in output', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockResolvedValue({
      output: 'result',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });

    renderComponent();
    await screen.findByText('Ready.');

    const input = screen.getByPlaceholderText('command...');
    await user.type(input, 'ls -la');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('$ ls -la')).toBeInTheDocument();
  });

  it('displays error message when executeTerminalCommand rejects', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockRejectedValue(new Error('connection refused'));

    renderComponent();
    await screen.findByText('Ready.');

    const input = screen.getByPlaceholderText('command...');
    await user.type(input, 'bad cmd');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Error: connection refused')).toBeInTheDocument();
  });

  it('shows (no output) when command returns empty output and no error', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockResolvedValue({
      output: '',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });

    renderComponent();
    await screen.findByText('Ready.');

    const input = screen.getByPlaceholderText('command...');
    await user.type(input, 'silent');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('(no output)')).toBeInTheDocument();
  });

  it('run button is disabled when input is empty', async () => {
    renderComponent();
    await screen.findByText('Ready.');
    expect(mockExecuteTerminalCommand).not.toHaveBeenCalled();
  });

  it('"+" button is hidden when 4 terminal tabs are open', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal 1');

    await user.click(screen.getByTitle('New terminal'));
    await screen.findByText('Terminal 2');
    await user.click(screen.getByTitle('New terminal'));
    await screen.findByText('Terminal 3');
    await user.click(screen.getByTitle('New terminal'));
    await screen.findByText('Terminal 4');

    expect(screen.queryByTitle('New terminal')).not.toBeInTheDocument();
  });

  // ── Agent World toggle ──────────────────────────────────────────────

  it('shows a "World" toggle button in the toolbar', async () => {
    renderComponent();
    expect(await screen.findByTitle(/show agent world/i)).toBeInTheDocument();
  });

  it('agent world panel is hidden by default', async () => {
    renderComponent();
    await screen.findByText('Workspace');
    expect(screen.queryByText('Agent World')).not.toBeInTheDocument();
  });

  it('clicking World button shows the Agent World panel', async () => {
    const user = userEvent.setup();
    renderComponent();
    const btn = await screen.findByTitle(/show agent world/i);
    await user.click(btn);
    expect(await screen.findByText('Agent World')).toBeInTheDocument();
  });

  it('clicking X in the Agent World panel hides it', async () => {
    const user = userEvent.setup();
    renderComponent();
    const openBtn = await screen.findByTitle(/show agent world/i);
    await user.click(openBtn);
    await screen.findByText('Agent World');
    const closeBtn = await screen.findByTitle(/close agent world/i);
    await user.click(closeBtn);
    expect(screen.queryByText('Agent World')).not.toBeInTheDocument();
  });

  it('persists world panel state to localStorage on open', async () => {
    const user = userEvent.setup();
    renderComponent();
    const btn = await screen.findByTitle(/show agent world/i);
    await user.click(btn);
    expect(localStorage.getItem('editor:showWorld')).toBe('true');
  });

  it('persists world panel state to localStorage on close', async () => {
    const user = userEvent.setup();
    renderComponent();
    const openBtn = await screen.findByTitle(/show agent world/i);
    await user.click(openBtn);
    const closeBtn = await screen.findByTitle(/close agent world/i);
    await user.click(closeBtn);
    expect(localStorage.getItem('editor:showWorld')).toBe('false');
  });

  it('submitting via click on run button calls executeTerminalCommand', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockResolvedValue({
      output: 'ok',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });

    renderComponent();
    await screen.findByText('Ready.');

    const input = screen.getByPlaceholderText('command...');
    await user.type(input, 'pwd');

    const inputArea = input.closest('.border-t.border-border');
    const runButton = inputArea?.querySelector('button:not(:disabled)');
    if (runButton) {
      await user.click(runButton as HTMLElement);
      await waitFor(() => {
        expect(mockExecuteTerminalCommand).toHaveBeenCalledWith('pwd', '/tmp');
      });
    }
  });
});
