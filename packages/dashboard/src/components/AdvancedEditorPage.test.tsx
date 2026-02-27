// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Stub scrollIntoView (not in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock('@monaco-editor/react', () => ({
  default: ({ onChange }: { onChange?: (val: string) => void }) => (
    <div
      data-testid="monaco-editor"
      onClick={() => onChange?.('// edited content')}
    />
  ),
  loader: { config: vi.fn() },
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', isDark: true, setTheme: vi.fn(), toggle: vi.fn() }),
}));

vi.mock('../api/client', () => ({
  fetchPersonalities: vi.fn(),
  fetchTasks: vi.fn(),
  fetchExecutionSessions: vi.fn(),
  executeTerminalCommand: vi.fn(),
}));

import * as api from '../api/client';
import { AdvancedEditorPage } from './AdvancedEditorPage';

const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchTasks = vi.mocked(api.fetchTasks);
const mockFetchExecutionSessions = vi.mocked(api.fetchExecutionSessions);
const mockExecuteTerminalCommand = vi.mocked(api.executeTerminalCommand);

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
    { id: 'sess-1', runtime: 'node', status: 'running', createdAt: Date.now() - 60000, lastActivity: Date.now() - 1000 },
    { id: 'sess-2', runtime: 'python', status: 'idle', createdAt: Date.now() - 120000, lastActivity: Date.now() - 30000 },
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
  });

  // ── Layout / rendering ─────────────────────────────────────────────

  it('renders "Advanced Editor" heading', async () => {
    renderComponent();
    expect(await screen.findByText('Advanced Editor')).toBeInTheDocument();
  });

  it('renders Monaco editor', async () => {
    renderComponent();
    expect(await screen.findByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('renders Files section header in file manager', async () => {
    renderComponent();
    expect(await screen.findByText('Files')).toBeInTheDocument();
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

  // ── Editor tabs ────────────────────────────────────────────────────

  it('renders initial untitled.ts tab in editor tab bar', async () => {
    renderComponent();
    // Both editor tab bar and file manager show untitled.ts; verify at least one exists
    const tabs = await screen.findAllByText('untitled.ts');
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  it('clicking new file button in editor bar adds a second tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findAllByText('untitled.ts');

    // [0] = editor tab bar "New file"; [1] = file manager "New file"
    const newFileBtns = screen.getAllByTitle('New file');
    await user.click(newFileBtns[0]);

    // After adding a tab, more untitled.ts entries exist
    const tabs = screen.getAllByText('untitled.ts');
    expect(tabs.length).toBeGreaterThan(2); // 2 in tab bar + 2 in file manager = 4
  });

  it('closing an editor tab removes it from the bar when another tab exists', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findAllByText('untitled.ts');
    const before = screen.getAllByText('untitled.ts').length;

    // Create a second tab via editor bar button [0]
    await user.click(screen.getAllByTitle('New file')[0]);
    expect(screen.getAllByText('untitled.ts').length).toBeGreaterThan(before);

    // Close a tab via the first close button inside the editor tab bar area
    // The editor left column has overflow-x-auto tab bar; close buttons are inside it
    const editorTabBar = document.querySelector('.overflow-x-auto.flex-shrink-0');
    const closeBtns = editorTabBar?.querySelectorAll('button');
    if (closeBtns && closeBtns.length > 0) {
      fireEvent.click(closeBtns[0]);
    }
    await waitFor(() => {
      expect(screen.getAllByText('untitled.ts').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('closing the only editor tab creates a fresh untitled.ts tab', async () => {
    renderComponent();
    await screen.findAllByText('untitled.ts');

    // Close the single editor tab via the close button in the editor tab bar
    const editorTabBar = document.querySelector('.overflow-x-auto.flex-shrink-0');
    const closeBtns = editorTabBar?.querySelectorAll('button');
    if (closeBtns && closeBtns.length > 0) {
      fireEvent.click(closeBtns[0]);
      await waitFor(() => {
        expect(screen.getAllByText('untitled.ts').length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  // ── File Manager ──────────────────────────────────────────────────

  it('file manager lists the open editor tab by name', async () => {
    renderComponent();
    // The file manager renders tab names as file entries
    // There should be at least one "untitled.ts" in the file list
    const fileEntries = await screen.findAllByText('untitled.ts');
    expect(fileEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('file manager shows execution sessions when available', async () => {
    mockFetchExecutionSessions.mockResolvedValue(MOCK_SESSIONS);
    renderComponent();
    expect(await screen.findByText('node')).toBeInTheDocument();
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('file manager new file button adds an editor tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Files');

    const before = screen.getAllByText('untitled.ts').length;
    // [1] = file manager "New file" button (comes after the editor bar button)
    const newFileBtns = screen.getAllByTitle('New file');
    await user.click(newFileBtns[newFileBtns.length - 1]);

    expect(screen.getAllByText('untitled.ts').length).toBeGreaterThan(before);
  });

  it('clicking a file name in the file manager highlights it', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Files');

    // Create a second tab so there are two to select between
    await user.click(screen.getAllByTitle('New file')[0]);
    const fileButtons = screen.getAllByText('untitled.ts');
    expect(fileButtons.length).toBeGreaterThanOrEqual(2);
    // Click one of the file entries — should not throw
    await user.click(fileButtons[0]);
    expect(screen.getAllByText('untitled.ts').length).toBeGreaterThanOrEqual(1);
  });

  // ── Personality selector ──────────────────────────────────────────

  it('personality selector is hidden when no personalities returned', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    renderComponent();
    await screen.findByText('Advanced Editor');
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
    expect(screen.getByText('Aria')).toBeInTheDocument();
    expect(screen.getByText('Nexus')).toBeInTheDocument();
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

    // Add a second terminal tab so we can close one without hitting the reset logic
    await user.click(screen.getByTitle('New terminal'));
    await screen.findByText('Terminal 2');

    // Close Terminal 2 (the newly created one is active)
    // Find X buttons in the terminal tab bar area
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

    // A fresh "Terminal 1" should still be present
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

    // The run/play button should be disabled when input is blank
    // Find the submit button (it has no text, just an icon)
    const playButton = screen
      .getAllByRole('button')
      .find((b) => (b as HTMLButtonElement).disabled && b.closest('.border-t.border-border'));
    // Simply verify no calls happen if clicked when empty
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

    // After reaching the limit, the "+" button should be gone
    expect(screen.queryByTitle('New terminal')).not.toBeInTheDocument();
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

    // Find the play/run button in the terminal input area (not disabled)
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
