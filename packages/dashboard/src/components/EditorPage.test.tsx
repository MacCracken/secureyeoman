// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock Monaco editor
vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="monaco-editor" data-language={props.language}>
      Monaco Editor
    </div>
  ),
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
    conversationId: null,
    isLoadingConversation: false,
  }),
  useChatStream: () => ({
    messages: [],
    input: '',
    setInput: vi.fn(),
    handleSend: vi.fn(),
    sendMessage: vi.fn(),
    isPending: false,
    clearMessages: vi.fn(),
    conversationId: null,
    isLoadingConversation: false,
    streamingThinking: '',
    streamingContent: '',
    activeToolCalls: [],
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
  useTheme: () => ({ theme: 'dark', isDark: true, setTheme: vi.fn(), toggle: vi.fn() }),
}));

vi.mock('./VoiceOverlay', () => ({
  VoiceOverlay: () => null,
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
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
    addMemory: vi.fn().mockResolvedValue({}),
    fetchModelInfo: vi
      .fn()
      .mockResolvedValue({ current: { model: 'claude-3-5-sonnet', provider: 'anthropic' } }),
    switchModel: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('./ModelWidget', () => ({
  ModelWidget: () => <div data-testid="model-widget">Model Widget</div>,
}));

vi.mock('./AgentWorldWidget', () => ({
  AgentWorldWidget: () => <div data-testid="agent-world-widget">Agent World</div>,
}));

vi.mock('./AdvancedEditor/AdvancedEditorPage', () => ({
  AdvancedEditorPage: () => <div data-testid="advanced-editor-page">Advanced Editor</div>,
}));

vi.mock('./EntityWidget', () => ({
  EntityWidget: ({ state, label }: { state?: string; label?: string }) => (
    <div data-testid="entity-widget" data-state={state}>
      {label ?? 'STANDBY'}
    </div>
  ),
}));

vi.mock('../hooks/useCollabMonaco', () => ({
  useCollabMonaco: () => ({
    bindEditor: vi.fn(),
    unbindEditor: vi.fn(),
    presenceUsers: [],
    connected: false,
    disconnect: vi.fn(),
  }),
}));

vi.mock('../hooks/useInlineCompletion', () => ({
  useInlineCompletion: () => ({
    bindEditor: vi.fn(),
    unbindEditor: vi.fn(),
  }),
}));

vi.mock('./editor/AnnotationContextMenu', () => ({
  useAnnotationContextMenu: () => ({
    registerAction: vi.fn(),
    PopoverComponent: null,
  }),
}));

vi.mock('./editor/SearchPanel', () => ({
  SearchPanel: () => <div data-testid="search-panel">Search Panel</div>,
}));

vi.mock('./ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));

vi.mock('./ThinkingBlock', () => ({
  ThinkingBlock: ({ thinking }: { thinking: string }) => (
    <div data-testid="thinking-block">{thinking}</div>
  ),
}));

vi.mock('./editor/CommandPalette', () => ({
  CommandPalette: ({ open }: { open: boolean }) =>
    open ? <div data-testid="command-palette">Command Palette</div> : null,
}));

vi.mock('./editor/ProjectExplorer', () => ({
  ProjectExplorer: ({ cwd }: { cwd: string }) => (
    <div data-testid="project-explorer">Explorer: {cwd}</div>
  ),
}));

vi.mock('./editor/GitPanel', () => ({
  GitPanel: ({ cwd }: { cwd: string }) => <div data-testid="git-panel">Git: {cwd}</div>,
}));

vi.mock('./editor/EditorToolbar', () => ({
  EditorToolbar: ({
    tabs,
    activeTabId,
    showExplorer,
    showChat,
    showWorld,
    settingsOpen,
    onToggleExplorer,
    onToggleChat,
    onToggleWorld,
    onToggleSettings,
    onNewTab,
    onTabClick,
    onTabClose,
    onToggleGit,
    onToggleKeybindings,
    onCommandPalette,
    onRun,
    onSendToChat,
    onToggleSplitView,
    onToggleMemory,
    onTabRenameStart,
  }: Record<string, unknown>) => (
    <div data-testid="editor-toolbar">
      <span data-testid="toolbar-active-tab">{activeTabId as string}</span>
      <span data-testid="toolbar-tab-count">{(tabs as unknown[]).length}</span>
      <span data-testid="toolbar-explorer-state">{showExplorer ? 'open' : 'closed'}</span>
      <span data-testid="toolbar-chat-state">{showChat ? 'open' : 'closed'}</span>
      <span data-testid="toolbar-world-state">{showWorld ? 'open' : 'closed'}</span>
      <span data-testid="toolbar-settings-state">{settingsOpen ? 'open' : 'closed'}</span>
      <button data-testid="btn-toggle-explorer" onClick={onToggleExplorer as () => void} />
      <button data-testid="btn-toggle-chat" onClick={onToggleChat as () => void} />
      <button data-testid="btn-toggle-world" onClick={onToggleWorld as () => void} />
      <button data-testid="btn-toggle-settings" onClick={onToggleSettings as () => void} />
      <button data-testid="btn-new-tab" onClick={onNewTab as () => void} />
      <button data-testid="btn-toggle-git" onClick={onToggleGit as () => void} />
      <button data-testid="btn-toggle-keybindings" onClick={onToggleKeybindings as () => void} />
      <button data-testid="btn-command-palette" onClick={onCommandPalette as () => void} />
      <button data-testid="btn-run" onClick={onRun as () => void} />
      <button data-testid="btn-send-to-chat" onClick={onSendToChat as () => void} />
      <button data-testid="btn-toggle-split" onClick={onToggleSplitView as () => void} />
      <button data-testid="btn-toggle-memory" onClick={onToggleMemory as () => void} />
      {(tabs as { id: string; name: string }[]).map((t) => (
        <div key={t.id} data-testid={`tab-${t.id}`}>
          <span
            data-testid={`tab-name-${t.id}`}
            onClick={() => (onTabClick as (id: string) => void)(t.id)}
          >
            {t.name}
          </span>
          <button
            data-testid={`tab-close-${t.id}`}
            onClick={() => (onTabClose as (id: string) => void)(t.id)}
          />
          <button
            data-testid={`tab-rename-${t.id}`}
            onClick={() =>
              (onTabRenameStart as (id: string, name: string) => void)(t.id, t.name)
            }
          />
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./editor/KeybindingsEditor', () => ({
  KeybindingsEditor: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="keybindings-editor">
        <button data-testid="keybindings-close" onClick={onClose} />
      </div>
    ) : null,
}));

vi.mock('./editor/AiPlanPanel', () => ({
  AiPlanPanel: () => <div data-testid="ai-plan-panel">AI Plan</div>,
}));

vi.mock('../hooks/useCommandPalette', () => ({
  useCommandPalette: () => ({
    open: false,
    query: '',
    setQuery: vi.fn(),
    filtered: [],
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    execute: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
  CommandItem: undefined,
}));

vi.mock('../hooks/useAiCommitMessage', () => ({
  useAiCommitMessage: () => ({
    message: '',
    setMessage: vi.fn(),
    isGenerating: false,
    generate: vi.fn(),
  }),
}));

vi.mock('../hooks/useKeybindings', () => ({
  useKeybindings: () => ({
    bindings: [],
    update: vi.fn(),
    reset: vi.fn(),
  }),
  matchesShortcut: () => false,
}));

import * as api from '../api/client';
import { EditorPage } from './EditorPage';

const mockFetchExecutionConfig = vi.mocked(api.fetchExecutionConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExecutionSessions = vi.mocked(api.fetchExecutionSessions);
const mockFetchExecutionHistory = vi.mocked(api.fetchExecutionHistory);
const mockTerminateExecutionSession = vi.mocked(api.terminateExecutionSession);
const mockFetchModelInfo = vi.mocked(api.fetchModelInfo);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockApproveExecution = vi.mocked(api.approveExecution);
const mockRejectExecution = vi.mocked(api.rejectExecution);
const mockExecuteTerminalCommand = vi.mocked(api.executeTerminalCommand);

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

const BASE_POLICY = {
  allowSubAgents: false,
  allowA2A: false,
  allowSwarms: false,
  allowExtensions: false,
  allowExecution: true,
  allowProactive: false,
  allowExperiments: false,
  allowStorybook: false,
  allowMultimodal: false,
  allowDesktopControl: false,
  allowCamera: false,
  allowDynamicTools: false,
  sandboxDynamicTools: true,
  allowAnomalyDetection: false,
  sandboxGvisor: false,
  sandboxWasm: false,
  sandboxCredentialProxy: false,
  allowNetworkTools: false,
  allowNetBoxWrite: false,
  allowWorkflows: false,
  allowCommunityGitFetch: false,
  allowTwingate: false,
  allowOrgIntent: false,
  allowIntentEditor: false,
  allowCodeEditor: true,
  allowAdvancedEditor: false,
  allowTrainingExport: false,
  promptGuardMode: 'warn' as const,
  responseGuardMode: 'warn' as const,
  jailbreakThreshold: 0.5,
  jailbreakAction: 'warn' as const,
  strictSystemPromptConfidentiality: false,
  abuseDetectionEnabled: true,
  contentGuardrailsEnabled: false,
  contentGuardrailsPiiMode: 'disabled' as const,
  contentGuardrailsToxicityEnabled: false,
  contentGuardrailsToxicityMode: 'warn' as const,
  contentGuardrailsToxicityThreshold: 0.7,
  contentGuardrailsBlockList: [],
  contentGuardrailsBlockedTopics: [],
  contentGuardrailsGroundingEnabled: false,
  contentGuardrailsGroundingMode: 'flag' as const,
};

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
    localStorage.clear();
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchModelInfo.mockResolvedValue({
      current: { model: 'claude-3-5-sonnet', provider: 'anthropic' },
    } as never);
    mockFetchSecurityPolicy.mockResolvedValue(BASE_POLICY);
    mockFetchExecutionSessions.mockResolvedValue(MOCK_SESSIONS);
    mockFetchExecutionHistory.mockResolvedValue({
      ...MOCK_HISTORY,
      total: MOCK_HISTORY.executions.length,
    });
  });

  // ── Policy gate ────────────────────────────────────────────

  it('renders AdvancedEditorPage when allowAdvancedEditor is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...BASE_POLICY,
      allowAdvancedEditor: true,
    });
    renderComponent();
    expect(await screen.findByTestId('advanced-editor-page')).toBeInTheDocument();
  });

  it('renders standard editor when allowAdvancedEditor is false', async () => {
    renderComponent();
    expect(await screen.findByText('Editor')).toBeInTheDocument();
    expect(screen.queryByTestId('advanced-editor-page')).not.toBeInTheDocument();
  });

  // ── Rendering ──────────────────────────────────────────────

  it('renders the Editor heading', async () => {
    renderComponent();
    expect(await screen.findByText('Editor')).toBeInTheDocument();
  });

  it('renders the subheading description text', async () => {
    renderComponent();
    expect(
      await screen.findByText(
        'Write, run, and debug code with AI-assisted execution and sandboxed sessions'
      )
    ).toBeInTheDocument();
  });

  it('renders bottom panel tab bar with all tabs', async () => {
    renderComponent();
    expect(await screen.findByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Git')).toBeInTheDocument();
  });

  it('renders the EditorToolbar', async () => {
    renderComponent();
    expect(await screen.findByTestId('editor-toolbar')).toBeInTheDocument();
  });

  it('renders the monaco editor', async () => {
    renderComponent();
    expect(await screen.findByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('renders the entity widget in the chat sidebar', async () => {
    renderComponent();
    expect(await screen.findByTestId('entity-widget')).toBeInTheDocument();
  });

  it('entity widget shows STANDBY label when idle', async () => {
    renderComponent();
    const entity = await screen.findByTestId('entity-widget');
    expect(entity).toHaveTextContent('STANDBY');
  });

  it('renders chat sidebar by default', async () => {
    renderComponent();
    // Chat sidebar has personality selector with "Default Assistant"
    expect(await screen.findByText('Default Assistant')).toBeInTheDocument();
  });

  it('renders the chat input textarea', async () => {
    renderComponent();
    const textarea = await screen.findByPlaceholderText('Message assistant...');
    expect(textarea).toBeInTheDocument();
  });

  it('shows empty chat state with "Chat with the assistant about your code" message', async () => {
    renderComponent();
    expect(
      await screen.findByText(/Chat with.*assistant.*about your code/)
    ).toBeInTheDocument();
  });

  it('shows "No personalities configured" when personalities list is empty and loaded', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    renderComponent();
    expect(await screen.findByText('No personalities configured.')).toBeInTheDocument();
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

  it('switches to Git tab and shows git panel', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Git'));
    expect(await screen.findByTestId('git-panel')).toBeInTheDocument();
  });

  it('switches back to Terminal tab after switching to another', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    await screen.findByText('active');
    await user.click(screen.getByText('Terminal'));
    // Terminal tab content has "Ready." text or terminal input
    expect(screen.getByPlaceholderText('command...')).toBeInTheDocument();
  });

  // ── Execution gate ─────────────────────────────────────────

  it('shows disabled state in Sessions when execution is off', async () => {
    const user = userEvent.setup();
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      ...BASE_POLICY,
      allowExecution: false,
    });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('Code Execution Not Enabled')).toBeInTheDocument();
  });

  it('shows disabled state in History when execution is off', async () => {
    const user = userEvent.setup();
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      ...BASE_POLICY,
      allowExecution: false,
    });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('Code Execution Not Enabled')).toBeInTheDocument();
  });

  it('shows helper text about enabling in Security settings when execution is disabled', async () => {
    const user = userEvent.setup();
    mockFetchExecutionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      ...BASE_POLICY,
      allowExecution: false,
    });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    expect(
      await screen.findByText('Enable sandboxed execution in Security settings.')
    ).toBeInTheDocument();
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

  it('displays session runtime type', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('node')).toBeInTheDocument();
    expect(screen.getByText('python')).toBeInTheDocument();
  });

  it('displays truncated session ID', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    // session.id.slice(0, 12) => 'sess-abc123d'
    expect(await screen.findByText('sess-abc123d')).toBeInTheDocument();
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

  it('shows session filter input in history tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByPlaceholderText('Filter by session ID...')).toBeInTheDocument();
  });

  it('displays execution duration in history', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('150ms')).toBeInTheDocument();
    expect(screen.getByText('80ms')).toBeInTheDocument();
  });

  it('shows exit codes in history', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    // Exit code 0 appears in a styled span; exit code 1 may match multiple elements
    const exitCode0 = screen.getAllByText('0');
    const exitCode1 = screen.getAllByText('1');
    expect(exitCode0.length).toBeGreaterThanOrEqual(1);
    expect(exitCode1.length).toBeGreaterThanOrEqual(1);
  });

  it('shows history table headers', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('has approve and reject buttons in history', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    const approveButtons = screen.getAllByTitle('Approve');
    const rejectButtons = screen.getAllByTitle('Reject');
    expect(approveButtons.length).toBeGreaterThanOrEqual(2);
    expect(rejectButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('clicking approve calls approveExecution', async () => {
    const user = userEvent.setup();
    mockApproveExecution.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    const approveButtons = screen.getAllByLabelText('Approve');
    await user.click(approveButtons[0]);
    await waitFor(() => {
      expect(mockApproveExecution).toHaveBeenCalled();
      expect(mockApproveExecution.mock.calls[0][0]).toBe('exec-1');
    });
  });

  it('clicking reject calls rejectExecution', async () => {
    const user = userEvent.setup();
    mockRejectExecution.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    const rejectButtons = screen.getAllByLabelText('Reject');
    await user.click(rejectButtons[0]);
    await waitFor(() => {
      expect(mockRejectExecution).toHaveBeenCalled();
      expect(mockRejectExecution.mock.calls[0][0]).toBe('exec-1');
    });
  });

  // ── Terminal ───────────────────────────────────────────────

  it('renders terminal with Ready. text initially', async () => {
    renderComponent();
    expect(await screen.findByText('Ready.')).toBeInTheDocument();
  });

  it('renders terminal command input', async () => {
    renderComponent();
    expect(await screen.findByPlaceholderText('command...')).toBeInTheDocument();
  });

  it('terminal has a new terminal button', async () => {
    renderComponent();
    expect(await screen.findByLabelText('New terminal')).toBeInTheDocument();
  });

  it('can type a command into terminal input', async () => {
    const user = userEvent.setup();
    renderComponent();
    const input = await screen.findByPlaceholderText('command...');
    await user.type(input, 'ls -la');
    expect(input).toHaveValue('ls -la');
  });

  it('submits a terminal command on Enter', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockResolvedValue({
      output: 'file1.txt\nfile2.txt',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });
    renderComponent();
    const input = await screen.findByPlaceholderText('command...');
    await user.type(input, 'ls');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(mockExecuteTerminalCommand).toHaveBeenCalledWith('ls', '/tmp');
    });
  });

  it('shows command output in terminal after execution', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockResolvedValue({
      output: 'file1.txt',
      error: '',
      exitCode: 0,
      cwd: '/tmp',
    });
    renderComponent();
    const input = await screen.findByPlaceholderText('command...');
    await user.type(input, 'ls');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('$ ls')).toBeInTheDocument();
    expect(await screen.findByText('file1.txt')).toBeInTheDocument();
  });

  it('shows error output in terminal on failure', async () => {
    const user = userEvent.setup();
    mockExecuteTerminalCommand.mockRejectedValue(new Error('command not found'));
    renderComponent();
    const input = await screen.findByPlaceholderText('command...');
    await user.type(input, 'badcmd');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Error: command not found')).toBeInTheDocument();
  });

  // ── Toolbar toggle interactions ────────────────────────────

  it('toggling explorer via toolbar shows project explorer', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    // Initially explorer is closed (localStorage not set)
    expect(screen.queryByTestId('project-explorer')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('btn-toggle-explorer'));
    expect(await screen.findByTestId('project-explorer')).toBeInTheDocument();
  });

  it('toggling chat via toolbar hides chat sidebar', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    // Chat is visible by default
    expect(screen.getByText('Default Assistant')).toBeInTheDocument();
    await user.click(screen.getByTestId('btn-toggle-chat'));
    await waitFor(() => {
      expect(screen.queryByText('Default Assistant')).not.toBeInTheDocument();
    });
  });

  it('toggling chat via close button hides chat sidebar', async () => {
    const user = userEvent.setup();
    renderComponent();
    const closeBtn = await screen.findByLabelText('Close chat');
    await user.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText('Default Assistant')).not.toBeInTheDocument();
    });
  });

  it('toggling settings via toolbar shows settings panel', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    expect(screen.queryByText('Font Size:')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('btn-toggle-settings'));
    expect(await screen.findByText('Font Size:')).toBeInTheDocument();
  });

  it('settings panel has font size, tab size, minimap, word wrap, line numbers', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    await user.click(screen.getByTestId('btn-toggle-settings'));
    expect(await screen.findByText('Font Size:')).toBeInTheDocument();
    expect(screen.getByText('Tab Size:')).toBeInTheDocument();
    expect(screen.getByText('Minimap')).toBeInTheDocument();
    expect(screen.getByText('Word Wrap')).toBeInTheDocument();
    expect(screen.getByText('Line Numbers')).toBeInTheDocument();
  });

  it('new tab via toolbar adds a tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    const tabCount = await screen.findByTestId('toolbar-tab-count');
    expect(tabCount).toHaveTextContent('1');
    await user.click(screen.getByTestId('btn-new-tab'));
    await waitFor(() => {
      expect(screen.getByTestId('toolbar-tab-count')).toHaveTextContent('2');
    });
  });

  it('toggling git via toolbar switches to Git bottom tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    await user.click(screen.getByTestId('btn-toggle-git'));
    expect(await screen.findByTestId('git-panel')).toBeInTheDocument();
  });

  it('toggling keybindings via toolbar opens keybindings editor', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    expect(screen.queryByTestId('keybindings-editor')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('btn-toggle-keybindings'));
    expect(await screen.findByTestId('keybindings-editor')).toBeInTheDocument();
  });

  // ── File operations (tabs) ─────────────────────────────────

  it('starts with one untitled.ts tab', async () => {
    renderComponent();
    const tabCount = await screen.findByTestId('toolbar-tab-count');
    expect(tabCount).toHaveTextContent('1');
  });

  it('closing only tab creates a new untitled tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    // Get the first tab's close button
    const tabElements = screen.getAllByTestId(/^tab-close-/);
    await user.click(tabElements[0]);
    // Should still have one tab (new untitled.ts created)
    await waitFor(() => {
      expect(screen.getByTestId('toolbar-tab-count')).toHaveTextContent('1');
    });
  });

  // ── Personality selector ───────────────────────────────────

  it('shows personality selector with default option', async () => {
    renderComponent();
    const selector = await screen.findByText('Default Assistant');
    expect(selector).toBeInTheDocument();
  });

  it('lists loaded personalities in the selector', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        {
          id: 'p1',
          name: 'CodeHelper',
          isDefault: false,
          isActive: true,
        },
        {
          id: 'p2',
          name: 'Reviewer',
          isDefault: true,
          isActive: false,
        },
      ],
    } as never);
    renderComponent();
    // Wait for personalities to load and verify they appear as options
    await waitFor(() => {
      const selects = document.querySelectorAll('select');
      // Find the personality select (it contains the default option)
      let found = false;
      selects.forEach((sel) => {
        const options = sel.querySelectorAll('option');
        options.forEach((opt) => {
          if (opt.textContent?.includes('CodeHelper')) found = true;
        });
      });
      expect(found).toBe(true);
    });
  });

  it('shows "Create a personality" link when no personalities exist', async () => {
    mockFetchPersonalities.mockResolvedValue({ personalities: [] });
    renderComponent();
    expect(await screen.findByText('Create a personality')).toBeInTheDocument();
  });

  // ── Agent World ────────────────────────────────────────────

  it('does not show agent world by default', async () => {
    renderComponent();
    await screen.findByText('Editor');
    expect(screen.queryByTestId('agent-world-widget')).not.toBeInTheDocument();
  });

  it('toggling world via toolbar shows agent world panel', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    await user.click(screen.getByTestId('btn-toggle-world'));
    expect(await screen.findByTestId('agent-world-widget')).toBeInTheDocument();
    // "Agent World" text appears in both the widget mock and the panel header
    expect(screen.getAllByText('Agent World').length).toBeGreaterThanOrEqual(1);
  });

  it('agent world panel has view mode buttons (Grid, Map, Large)', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    await user.click(screen.getByTestId('btn-toggle-world'));
    await screen.findByTestId('agent-world-widget');
    expect(screen.getByText('Grid')).toBeInTheDocument();
    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Large')).toBeInTheDocument();
  });

  it('agent world panel can be closed via close button', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    await user.click(screen.getByTestId('btn-toggle-world'));
    await screen.findByTestId('agent-world-widget');
    const closeBtn = screen.getByLabelText('Close agent world');
    await user.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('agent-world-widget')).not.toBeInTheDocument();
    });
  });

  // ── localStorage persistence ───────────────────────────────

  it('persists showExplorer state to localStorage', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    await user.click(screen.getByTestId('btn-toggle-explorer'));
    expect(localStorage.getItem('editor:showExplorer')).toBe('true');
  });

  it('persists showChat state to localStorage when closing', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    await user.click(screen.getByTestId('btn-toggle-chat'));
    expect(localStorage.getItem('editor:showChat')).toBe('false');
  });

  it('reads showChat from localStorage on mount', async () => {
    localStorage.setItem('editor:showChat', 'false');
    renderComponent();
    await screen.findByText('Editor');
    // Chat should be hidden
    expect(screen.queryByText('Default Assistant')).not.toBeInTheDocument();
  });

  it('reads showExplorer from localStorage on mount', async () => {
    localStorage.setItem('editor:showExplorer', 'true');
    renderComponent();
    expect(await screen.findByTestId('project-explorer')).toBeInTheDocument();
  });

  // ── Multiple bottom tab interactions ───────────────────────

  it('sessions tab shows two sessions with correct statuses', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('Sessions'));
    expect(await screen.findByText('active')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('history tab can expand execution detail', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    // Click on first execution row to expand
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    fireEvent.click(rows[0]);
    // Should show detail with stdout
    await waitFor(() => {
      expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    });
  });

  it('history tab can collapse expanded execution detail', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    const rows = document.querySelectorAll('tbody tr');
    // Expand
    fireEvent.click(rows[0]);
    await screen.findByText('Hello, world!');
    // Collapse
    fireEvent.click(rows[0]);
    await waitFor(() => {
      expect(screen.queryByText('Hello, world!')).not.toBeInTheDocument();
    });
  });

  it('history tab shows stderr in expanded detail for failed execution', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    await screen.findByText('150ms');
    const rows = document.querySelectorAll('tbody tr');
    // Click second row (the one with stderr)
    fireEvent.click(rows[1]);
    await waitFor(() => {
      expect(screen.getByText('Error: something failed')).toBeInTheDocument();
    });
  });

  // ── Memory toggle ─────────────────────────────────────────

  it('memory toggle persists to localStorage', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByTestId('editor-toolbar');
    // Memory is enabled by default; toggling should set it to false
    await user.click(screen.getByTestId('btn-toggle-memory'));
    expect(localStorage.getItem('editor:memoryEnabled')).toBe('false');
  });

  // ── Duration formatting ────────────────────────────────────

  it('formats durations under 1000ms correctly', async () => {
    const user = userEvent.setup();
    mockFetchExecutionHistory.mockResolvedValue({
      executions: [
        {
          id: 'exec-fast',
          sessionId: 'sess-1',
          exitCode: 0,
          stdout: '',
          stderr: '',
          duration: 42,
          createdAt: Date.now(),
        },
      ],
      total: 1,
    });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('42ms')).toBeInTheDocument();
  });

  it('formats durations in seconds correctly', async () => {
    const user = userEvent.setup();
    mockFetchExecutionHistory.mockResolvedValue({
      executions: [
        {
          id: 'exec-slow',
          sessionId: 'sess-1',
          exitCode: 0,
          stdout: '',
          stderr: '',
          duration: 5000,
          createdAt: Date.now(),
        },
      ],
      total: 1,
    });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('5s')).toBeInTheDocument();
  });

  it('formats durations in minutes and seconds correctly', async () => {
    const user = userEvent.setup();
    mockFetchExecutionHistory.mockResolvedValue({
      executions: [
        {
          id: 'exec-veryslow',
          sessionId: 'sess-1',
          exitCode: 0,
          stdout: '',
          stderr: '',
          duration: 125000,
          createdAt: Date.now(),
        },
      ],
      total: 1,
    });
    renderComponent();
    await screen.findByText('Terminal');
    await user.click(screen.getByText('History'));
    expect(await screen.findByText('2m 5s')).toBeInTheDocument();
  });
});
