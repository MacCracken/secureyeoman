// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NewEntityDialog } from './NewEntityDialog';

const mockCreateProactiveTrigger = vi.fn();
const mockRegisterExtension = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateWorkspace = vi.fn();
const mockAddMemory = vi.fn();
const mockLearnKnowledge = vi.fn();
const mockCreateIntent = vi.fn();
const mockFetchModelInfo = vi.fn().mockResolvedValue({ current: { model: 'gpt-4' } });

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchModelInfo: (...args: unknown[]) => mockFetchModelInfo(...args),
    createProactiveTrigger: (...args: unknown[]) => mockCreateProactiveTrigger(...args),
    registerExtension: (...args: unknown[]) => mockRegisterExtension(...args),
    createUser: (...args: unknown[]) => mockCreateUser(...args),
    createWorkspace: (...args: unknown[]) => mockCreateWorkspace(...args),
    addMemory: (...args: unknown[]) => mockAddMemory(...args),
    learnKnowledge: (...args: unknown[]) => mockLearnKnowledge(...args),
    createIntent: (...args: unknown[]) => mockCreateIntent(...args),
  };
});

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderDialog(open = true) {
  const onClose = vi.fn();
  const qc = createQC();
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <NewEntityDialog open={open} onClose={onClose} />
      </QueryClientProvider>
    ),
    onClose,
    qc,
  };
}

describe('NewEntityDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchModelInfo.mockResolvedValue({ current: { model: 'gpt-4' } });
    // Reset window.location.href mock
    Object.defineProperty(window, 'location', {
      value: { href: '/' },
      writable: true,
    });
  });

  // ── Visibility ────────────────────────────────────────────────────────

  it('does not render when open is false', () => {
    const { container } = renderDialog(false);
    expect(
      container.querySelector('[role="dialog"]') ?? container.querySelector('.fixed')
    ).toBeFalsy();
  });

  it('renders the selector grid when open', () => {
    renderDialog();
    expect(screen.getByText('Skill')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Personality')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  it('shows all config items', () => {
    renderDialog();
    expect(screen.getByText('Sub-Agent')).toBeInTheDocument();
    expect(screen.getByText('Intent')).toBeInTheDocument();
    expect(screen.getByText('Proactive Trigger')).toBeInTheDocument();
    expect(screen.getByText('Extension')).toBeInTheDocument();
    expect(screen.getByText('Experiment')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Custom Role')).toBeInTheDocument();
  });

  it('shows navigate items', () => {
    renderDialog();
    expect(screen.getByText('Conversation')).toBeInTheDocument();
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
    expect(screen.getByText('A2A Peer')).toBeInTheDocument();
    expect(screen.getByText('Report')).toBeInTheDocument();
    expect(screen.getByText('Routing Rule')).toBeInTheDocument();
    expect(screen.getByText('Integration')).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
  });

  it('shows item descriptions', () => {
    renderDialog();
    expect(screen.getByText('New skill definition')).toBeInTheDocument();
    expect(screen.getByText('Schedule a task')).toBeInTheDocument();
    expect(screen.getByText('New AI personality')).toBeInTheDocument();
  });

  it('shows Create New header', () => {
    renderDialog();
    expect(screen.getByText('Create New')).toBeInTheDocument();
  });

  // ── Navigate items close dialog and set location ──────────────────────

  it('clicking Conversation nav item closes dialog and navigates', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Conversation'));
    expect(onClose).toHaveBeenCalled();
    expect(window.location.href).toBe('/chat');
  });

  it('clicking Workflow nav item navigates to automation', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Workflow'));
    expect(onClose).toHaveBeenCalled();
    expect(window.location.href).toBe('/automation?tab=workflows');
  });

  it('clicking Routing Rule nav item navigates with routing tab', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Routing Rule'));
    expect(window.location.href).toBe('/connections?tab=routing');
  });

  // ── Backdrop click closes ─────────────────────────────────────────────

  it('clicking the backdrop overlay closes the dialog', async () => {
    const user = userEvent.setup();
    const { container, onClose } = renderDialog();
    // The backdrop is the outermost .fixed div
    const backdrop = container.querySelector('.fixed');
    expect(backdrop).toBeTruthy();
    await user.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking inside the dialog content does not close', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    // Click on a text element inside the dialog
    await user.click(screen.getByText('Create New'));
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── X button closes ───────────────────────────────────────────────────

  it('clicking the X button closes the dialog', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    // The X button is next to "Create New" header
    const header = screen.getByText('Create New');
    const headerParent = header.closest('.flex')!;
    const xBtn = headerParent.querySelector('button')!;
    // The X button is the second element (after h3) in the flex container
    const buttons = headerParent.querySelectorAll('button');
    await user.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  // ── Form navigation ──────────────────────────────────────────────────

  it('navigates to Personality form when clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Personality'));
    await waitFor(() => {
      expect(screen.getByText(/Name/)).toBeInTheDocument();
    });
  });

  it('navigates to Skill form when clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Skill'));
    await waitFor(() => {
      expect(screen.getByText(/Name/)).toBeInTheDocument();
    });
  });

  it('navigates to User form when clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText(/Email/)).toBeInTheDocument();
    });
  });

  it('navigates to Workspace form when clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Workspace'));
    await waitFor(() => {
      expect(screen.getByText(/Name/)).toBeInTheDocument();
    });
  });

  it('navigates to Extension form when clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Extension'));
    await waitFor(() => {
      expect(screen.getByText(/Version/)).toBeInTheDocument();
    });
  });

  it('navigates to Memory form when clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText(/Content/i)).toBeInTheDocument();
    });
  });

  it('navigates to Proactive Trigger form', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText(/Name/)).toBeInTheDocument();
    });
  });

  it('navigates to Intent form', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText(/Name/)).toBeInTheDocument();
    });
  });

  it('navigates to Experiment form', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Experiment'));
    await waitFor(() => {
      expect(screen.getByText('New Experiment')).toBeInTheDocument();
    });
  });

  it('navigates to Sub-Agent form', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Sub-Agent'));
    await waitFor(() => {
      expect(screen.getByText('New Sub-Agent')).toBeInTheDocument();
    });
  });

  it('navigates to Custom Role form', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Custom Role'));
    await waitFor(() => {
      expect(screen.getByText('New Custom Role')).toBeInTheDocument();
    });
  });

  it('navigates to Task form', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Task'));
    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });
  });

  // ── Back button ───────────────────────────────────────────────────────

  it('shows back button after navigating to a form', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Skill'));
    await waitFor(() => {
      const backBtn = screen.queryByText(/Back/) || screen.queryByTitle(/back/i);
      expect(backBtn || screen.getByText(/Cancel/)).toBeInTheDocument();
    });
  });

  it('back button returns to the selection grid', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Skill'));
    await waitFor(() => {
      expect(screen.getByText('New Skill')).toBeInTheDocument();
    });
    const backBtn = screen.getByLabelText('Go back');
    await user.click(backBtn);
    await waitFor(() => {
      expect(screen.getByText('Skill')).toBeInTheDocument();
      expect(screen.getByText('Task')).toBeInTheDocument();
    });
  });

  // ── Cancel button ─────────────────────────────────────────────────────

  it('cancel button on Personality form closes dialog', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Personality'));
    await waitFor(() => {
      expect(screen.getByText('New Personality')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('cancel button on User form closes dialog', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText('New User')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  // ── Personality form ──────────────────────────────────────────────────

  it('personality create button is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Personality'));
    await waitFor(() => {
      expect(screen.getByText('New Personality')).toBeInTheDocument();
    });
    const createBtn = screen.getByText('Create');
    expect(createBtn).toBeDisabled();
  });

  it('personality create navigates with query params', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Personality'));
    await waitFor(() => {
      expect(screen.getByText('New Personality')).toBeInTheDocument();
    });
    const nameInput = screen.getByPlaceholderText('e.g., Coding Assistant');
    await user.type(nameInput, 'My Bot');
    const createBtn = screen.getByText('Create');
    expect(createBtn).not.toBeDisabled();
    await user.click(createBtn);
    expect(window.location.href).toContain('/personality?create=true');
    expect(window.location.href).toContain('name=My%20Bot');
    expect(onClose).toHaveBeenCalled();
  });

  it('personality form shows text input when no models available', async () => {
    mockFetchModelInfo.mockResolvedValue({ current: { model: 'gpt-4' } });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Personality'));
    await waitFor(() => {
      expect(screen.getByText('New Personality')).toBeInTheDocument();
    });
    // Should show a text input for model since modelsByProvider is empty
    expect(screen.getByPlaceholderText('e.g., claude-3-5-sonnet-20241022')).toBeInTheDocument();
  });

  it('personality form shows select when models are available', async () => {
    mockFetchModelInfo.mockResolvedValue({
      current: { model: 'gpt-4' },
      available: { openai: [{ model: 'gpt-4' }, { model: 'gpt-3.5-turbo' }] },
    });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Personality'));
    await waitFor(() => {
      expect(screen.getByText('New Personality')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Default (system)')).toBeInTheDocument();
    });
  });

  // ── Task form ─────────────────────────────────────────────────────────

  it('task create button is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Task'));
    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });
    expect(screen.getByText('Create')).toBeDisabled();
  });

  it('task create navigates with query params', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Task'));
    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g., Run backup'), 'Daily backup');
    expect(screen.getByText('Create')).not.toBeDisabled();
    await user.click(screen.getByText('Create'));
    expect(window.location.href).toContain('/automation?create=true');
    expect(window.location.href).toContain('name=Daily%20backup');
  });

  it('task form allows selecting type', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Task'));
    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });
    const typeSelect = screen.getByDisplayValue('Execute');
    await user.selectOptions(typeSelect, 'query');
    expect(typeSelect).toHaveValue('query');
  });

  it('task form allows entering JSON input', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Task'));
    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });
    const jsonInput = screen.getByPlaceholderText('{"key": "value"}');
    // userEvent.type treats { } as special chars, use clear + paste instead
    await user.clear(jsonInput);
    await user.click(jsonInput);
    await user.paste('{"foo": "bar"}');
    expect(jsonInput).toHaveValue('{"foo": "bar"}');
  });

  // ── Skill form ────────────────────────────────────────────────────────

  it('skill create button is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Skill'));
    await waitFor(() => {
      expect(screen.getByText('New Skill')).toBeInTheDocument();
    });
    expect(screen.getByText('Create')).toBeDisabled();
  });

  it('skill create navigates with all fields', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Skill'));
    await waitFor(() => {
      expect(screen.getByText('New Skill')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g., Git Helper'), 'MySkill');
    await user.type(screen.getByPlaceholderText('What this skill does'), 'Does things');
    await user.type(screen.getByPlaceholderText('e.g., /git or on_push'), '/test');
    await user.click(screen.getByText('Create'));
    expect(window.location.href).toContain('/skills?create=true');
    expect(window.location.href).toContain('name=MySkill');
    expect(window.location.href).toContain('trigger=%2Ftest');
  });

  // ── Experiment form ───────────────────────────────────────────────────

  it('experiment create is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Experiment'));
    await waitFor(() => {
      expect(screen.getByText('New Experiment')).toBeInTheDocument();
    });
    expect(screen.getByText('Create')).toBeDisabled();
  });

  it('experiment create navigates with params', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Experiment'));
    await waitFor(() => {
      expect(screen.getByText('New Experiment')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g., New Voice UI'), 'Test Exp');
    expect(screen.getByText('Create')).not.toBeDisabled();
    await user.click(screen.getByText('Create'));
    expect(window.location.href).toContain('/experiments?create=true');
    expect(window.location.href).toContain('name=Test%20Exp');
  });

  it('experiment form shows variant info text', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Experiment'));
    await waitFor(() => {
      expect(
        screen.getByText(/Control and Variant A variants/)
      ).toBeInTheDocument();
    });
  });

  // ── Sub-Agent form ────────────────────────────────────────────────────

  it('sub-agent continue is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Sub-Agent'));
    await waitFor(() => {
      expect(screen.getByText('New Sub-Agent')).toBeInTheDocument();
    });
    expect(screen.getByText('Continue')).toBeDisabled();
  });

  it('sub-agent continue navigates to agents page', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Sub-Agent'));
    await waitFor(() => {
      expect(screen.getByText('New Sub-Agent')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g., Research Agent'), 'Research');
    await user.click(screen.getByText('Continue'));
    expect(window.location.href).toContain('/agents?create=true');
    expect(window.location.href).toContain('name=Research');
  });

  // ── Custom Role form ──────────────────────────────────────────────────

  it('custom role continue is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Custom Role'));
    await waitFor(() => {
      expect(screen.getByText('New Custom Role')).toBeInTheDocument();
    });
    expect(screen.getByText('Continue')).toBeDisabled();
  });

  it('custom role continue navigates to settings', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Custom Role'));
    await waitFor(() => {
      expect(screen.getByText('New Custom Role')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g., Data Analyst'), 'Reviewer');
    await user.click(screen.getByText('Continue'));
    expect(window.location.href).toContain('/settings?tab=security&create=true');
    expect(window.location.href).toContain('name=Reviewer');
  });

  // ── Proactive Trigger form ────────────────────────────────────────────

  it('proactive trigger create is disabled without name and content', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    expect(screen.getByText('Create Trigger')).toBeDisabled();
  });

  it('proactive trigger submits with schedule type', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 't1' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'Morning check');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'Good morning'
    );
    const createBtn = screen.getByText('Create Trigger');
    expect(createBtn).not.toBeDisabled();
    await user.click(createBtn);
    await waitFor(() => {
      expect(mockCreateProactiveTrigger).toHaveBeenCalledTimes(1);
    });
    const callArgs = mockCreateProactiveTrigger.mock.calls[0][0];
    expect(callArgs.name).toBe('Morning check');
    expect(callArgs.type).toBe('schedule');
    expect(callArgs.condition.type).toBe('schedule');
    expect(callArgs.condition.cron).toBe('0 9 * * 1-5');
    expect(callArgs.action.type).toBe('message');
    expect(callArgs.action.content).toBe('Good morning');
  });

  it('proactive trigger shows cron field for schedule type', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('Cron Expression')).toBeInTheDocument();
    });
  });

  it('proactive trigger shows event type field when event type selected', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    const typeSelect = screen.getByDisplayValue('Schedule (Cron)');
    await user.selectOptions(typeSelect, 'event');
    expect(screen.getByPlaceholderText('integration_disconnected')).toBeInTheDocument();
    // Cron field should be gone
    expect(screen.queryByText('Cron Expression')).not.toBeInTheDocument();
  });

  it('proactive trigger submits with event type', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 't2' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'Event trigger');
    const typeSelect = screen.getByDisplayValue('Schedule (Cron)');
    await user.selectOptions(typeSelect, 'event');
    await user.type(screen.getByPlaceholderText('integration_disconnected'), 'user_login');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'Welcome'
    );
    await user.click(screen.getByText('Create Trigger'));
    await waitFor(() => {
      expect(mockCreateProactiveTrigger).toHaveBeenCalled();
    });
    const callArgs = mockCreateProactiveTrigger.mock.calls[0][0];
    expect(callArgs.condition.type).toBe('event');
    expect(callArgs.condition.eventType).toBe('user_login');
  });

  it('proactive trigger submits with pattern type', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 't3' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'Pattern trigger');
    const typeSelect = screen.getByDisplayValue('Schedule (Cron)');
    await user.selectOptions(typeSelect, 'pattern');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'Pattern content'
    );
    await user.click(screen.getByText('Create Trigger'));
    await waitFor(() => {
      expect(mockCreateProactiveTrigger).toHaveBeenCalled();
    });
    expect(mockCreateProactiveTrigger.mock.calls[0][0].condition.type).toBe('pattern');
  });

  it('proactive trigger submits with webhook type', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 't4' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'Webhook trigger');
    await user.selectOptions(screen.getByDisplayValue('Schedule (Cron)'), 'webhook');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'Hook content'
    );
    await user.click(screen.getByText('Create Trigger'));
    await waitFor(() => {
      expect(mockCreateProactiveTrigger).toHaveBeenCalled();
    });
    expect(mockCreateProactiveTrigger.mock.calls[0][0].condition.type).toBe('webhook');
  });

  it('proactive trigger submits with llm type', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 't5' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'LLM trigger');
    await user.selectOptions(screen.getByDisplayValue('Schedule (Cron)'), 'llm');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'LLM prompt'
    );
    await user.click(screen.getByText('Create Trigger'));
    await waitFor(() => {
      expect(mockCreateProactiveTrigger).toHaveBeenCalled();
    });
    expect(mockCreateProactiveTrigger.mock.calls[0][0].condition.type).toBe('llm');
  });

  it('proactive trigger remind action type', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 't6' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'Remind trigger');
    await user.selectOptions(screen.getByDisplayValue('Message'), 'remind');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'Reminder text'
    );
    await user.click(screen.getByText('Create Trigger'));
    await waitFor(() => {
      expect(mockCreateProactiveTrigger).toHaveBeenCalled();
    });
    expect(mockCreateProactiveTrigger.mock.calls[0][0].action.type).toBe('remind');
    expect(mockCreateProactiveTrigger.mock.calls[0][0].action.category).toBe('user_trigger');
  });

  it('proactive trigger allows changing approval mode', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 't7' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'Auto trigger');
    await user.selectOptions(screen.getByDisplayValue('Suggest first'), 'auto');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'Auto content'
    );
    await user.click(screen.getByText('Create Trigger'));
    await waitFor(() => {
      expect(mockCreateProactiveTrigger).toHaveBeenCalled();
    });
    expect(mockCreateProactiveTrigger.mock.calls[0][0].approvalMode).toBe('auto');
  });

  // ── Extension form ────────────────────────────────────────────────────

  it('extension register is disabled without required fields', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Extension'));
    await waitFor(() => {
      expect(screen.getByText('New Extension')).toBeInTheDocument();
    });
    expect(screen.getByText('Register Extension')).toBeDisabled();
  });

  it('extension register submits with all fields', async () => {
    mockRegisterExtension.mockResolvedValue({ id: 'ext1' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Extension'));
    await waitFor(() => {
      expect(screen.getByText('New Extension')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. my-extension'), 'test-ext');
    await user.type(screen.getByPlaceholderText('My Extension'), 'Test Extension');
    // Version already has default 1.0.0
    await user.click(screen.getByText('Register Extension'));
    await waitFor(() => {
      expect(mockRegisterExtension).toHaveBeenCalledTimes(1);
    });
    const args = mockRegisterExtension.mock.calls[0][0];
    expect(args.id).toBe('test-ext');
    expect(args.name).toBe('Test Extension');
    expect(args.version).toBe('1.0.0');
  });

  it('extension parses hooks text into structured data', async () => {
    mockRegisterExtension.mockResolvedValue({ id: 'ext2' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Extension'));
    await waitFor(() => {
      expect(screen.getByText('New Extension')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. my-extension'), 'hook-ext');
    await user.type(screen.getByPlaceholderText('My Extension'), 'Hook Extension');
    // The hooks textarea doesn't have an htmlFor-linked label, find it by its sibling context
    const allTextareas = document.querySelectorAll('textarea');
    const hooksArea = Array.from(allTextareas).find(
      (ta) => ta.placeholder.includes('pre-chat')
    )!;
    expect(hooksArea).toBeTruthy();
    await user.type(hooksArea, 'pre-chat, observe, 10');
    await user.click(screen.getByText('Register Extension'));
    await waitFor(() => {
      expect(mockRegisterExtension).toHaveBeenCalled();
    });
    const hooks = mockRegisterExtension.mock.calls[0][0].hooks;
    expect(hooks).toHaveLength(1);
    expect(hooks[0].point).toBe('pre-chat');
    expect(hooks[0].semantics).toBe('observe');
    expect(hooks[0].priority).toBe(10);
  });

  it('extension shows error on registration failure', async () => {
    mockRegisterExtension.mockRejectedValue(new Error('Duplicate ID'));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Extension'));
    await waitFor(() => {
      expect(screen.getByText('New Extension')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. my-extension'), 'dup-ext');
    await user.type(screen.getByPlaceholderText('My Extension'), 'Dup Ext');
    await user.click(screen.getByText('Register Extension'));
    await waitFor(() => {
      expect(screen.getByText('Duplicate ID')).toBeInTheDocument();
    });
  });

  it('extension shows fallback error for non-Error rejection', async () => {
    mockRegisterExtension.mockRejectedValue('unknown');
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Extension'));
    await waitFor(() => {
      expect(screen.getByText('New Extension')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. my-extension'), 'unk-ext');
    await user.type(screen.getByPlaceholderText('My Extension'), 'Unk Ext');
    await user.click(screen.getByText('Register Extension'));
    await waitFor(() => {
      expect(screen.getByText('Registration failed')).toBeInTheDocument();
    });
  });

  // ── User form ─────────────────────────────────────────────────────────

  it('user create is disabled without all required fields', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText('New User')).toBeInTheDocument();
    });
    expect(screen.getByText('Create User')).toBeDisabled();
    // Fill only email
    await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');
    expect(screen.getByText('Create User')).toBeDisabled();
  });

  it('user create submits all fields', async () => {
    mockCreateUser.mockResolvedValue({ id: 'u1' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText('New User')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('user@example.com'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Test User');
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await user.click(screen.getByText('Create User'));
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledTimes(1);
    });
    const args = mockCreateUser.mock.calls[0][0];
    expect(args.email).toBe('test@test.com');
    expect(args.displayName).toBe('Test User');
    expect(args.password).toBe('password123');
    expect(args.isAdmin).toBe(false);
  });

  it('user create with admin checkbox', async () => {
    mockCreateUser.mockResolvedValue({ id: 'u2' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText('New User')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('user@example.com'), 'admin@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Admin User');
    await user.type(screen.getByPlaceholderText('••••••••'), 'adminpass');
    await user.click(screen.getByText('Admin'));
    await user.click(screen.getByText('Create User'));
    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalled();
    });
    expect(mockCreateUser.mock.calls[0][0].isAdmin).toBe(true);
  });

  it('user create shows error on failure', async () => {
    mockCreateUser.mockRejectedValue(new Error('Email taken'));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText('New User')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('user@example.com'), 'dup@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Dup');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass');
    await user.click(screen.getByText('Create User'));
    await waitFor(() => {
      expect(screen.getByText('Email taken')).toBeInTheDocument();
    });
  });

  it('user create shows fallback error for non-Error rejection', async () => {
    mockCreateUser.mockRejectedValue(42);
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText('New User')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('user@example.com'), 'x@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'X');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass');
    await user.click(screen.getByText('Create User'));
    await waitFor(() => {
      expect(screen.getByText('Failed to create user')).toBeInTheDocument();
    });
  });

  // ── Workspace form ────────────────────────────────────────────────────

  it('workspace create is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Workspace'));
    await waitFor(() => {
      expect(screen.getByText('New Workspace')).toBeInTheDocument();
    });
    expect(screen.getByText('Create Workspace')).toBeDisabled();
  });

  it('workspace create submits with name only', async () => {
    mockCreateWorkspace.mockResolvedValue({ id: 'w1' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Workspace'));
    await waitFor(() => {
      expect(screen.getByText('New Workspace')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), 'Engineering');
    await user.click(screen.getByText('Create Workspace'));
    await waitFor(() => {
      expect(mockCreateWorkspace).toHaveBeenCalledTimes(1);
    });
    const args = mockCreateWorkspace.mock.calls[0][0];
    expect(args.name).toBe('Engineering');
    expect(args.description).toBeUndefined();
  });

  it('workspace create submits with description', async () => {
    mockCreateWorkspace.mockResolvedValue({ id: 'w2' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Workspace'));
    await waitFor(() => {
      expect(screen.getByText('New Workspace')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), 'Ops');
    await user.type(screen.getByPlaceholderText('Optional description'), 'Operations team');
    await user.click(screen.getByText('Create Workspace'));
    await waitFor(() => {
      expect(mockCreateWorkspace).toHaveBeenCalled();
    });
    expect(mockCreateWorkspace.mock.calls[0][0].description).toBe('Operations team');
  });

  it('workspace shows error on failure', async () => {
    mockCreateWorkspace.mockRejectedValue(new Error('Name taken'));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Workspace'));
    await waitFor(() => {
      expect(screen.getByText('New Workspace')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), 'Dup');
    await user.click(screen.getByText('Create Workspace'));
    await waitFor(() => {
      expect(screen.getByText('Name taken')).toBeInTheDocument();
    });
  });

  it('workspace shows fallback error for non-Error rejection', async () => {
    mockCreateWorkspace.mockRejectedValue(null);
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Workspace'));
    await waitFor(() => {
      expect(screen.getByText('New Workspace')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), 'Fail');
    await user.click(screen.getByText('Create Workspace'));
    await waitFor(() => {
      expect(screen.getByText('Failed to create workspace')).toBeInTheDocument();
    });
  });

  // ── Memory form — Vector Memory ───────────────────────────────────────

  it('memory form defaults to vector memory subtype', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    expect(screen.getByText('Vector Memory')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    // Vector memory fields visible
    expect(screen.getByText('Memory Type')).toBeInTheDocument();
    expect(screen.getByText('Source *')).toBeInTheDocument();
  });

  it('memory add is disabled without content and source', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    expect(screen.getByText('Add to Memory')).toBeDisabled();
  });

  it('memory vector submit sends correct data', async () => {
    mockAddMemory.mockResolvedValue({ id: 'm1' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.type(
      screen.getByPlaceholderText('The memory content to store...'),
      'Important fact'
    );
    await user.type(screen.getByPlaceholderText('e.g. user, system, chat'), 'user');
    await user.click(screen.getByText('Add to Memory'));
    await waitFor(() => {
      expect(mockAddMemory).toHaveBeenCalledTimes(1);
    });
    const args = mockAddMemory.mock.calls[0][0];
    expect(args.content).toBe('Important fact');
    expect(args.source).toBe('user');
    expect(args.type).toBe('semantic');
    expect(args.importance).toBe(0.5);
  });

  it('memory allows changing memory type', async () => {
    mockAddMemory.mockResolvedValue({ id: 'm2' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    const typeSelect = screen.getByDisplayValue('Semantic \u2014 facts and concepts');
    await user.selectOptions(typeSelect, 'procedural');
    await user.type(
      screen.getByPlaceholderText('The memory content to store...'),
      'How to deploy'
    );
    await user.type(screen.getByPlaceholderText('e.g. user, system, chat'), 'system');
    await user.click(screen.getByText('Add to Memory'));
    await waitFor(() => {
      expect(mockAddMemory).toHaveBeenCalled();
    });
    expect(mockAddMemory.mock.calls[0][0].type).toBe('procedural');
  });

  it('memory shows error on failure', async () => {
    mockAddMemory.mockRejectedValue(new Error('Storage full'));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.type(
      screen.getByPlaceholderText('The memory content to store...'),
      'Some content'
    );
    await user.type(screen.getByPlaceholderText('e.g. user, system, chat'), 'user');
    await user.click(screen.getByText('Add to Memory'));
    await waitFor(() => {
      expect(screen.getByText('Storage full')).toBeInTheDocument();
    });
  });

  it('memory shows fallback error for non-Error rejection', async () => {
    mockAddMemory.mockRejectedValue('boom');
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.type(
      screen.getByPlaceholderText('The memory content to store...'),
      'Content'
    );
    await user.type(screen.getByPlaceholderText('e.g. user, system, chat'), 'src');
    await user.click(screen.getByText('Add to Memory'));
    await waitFor(() => {
      expect(screen.getByText('Failed to add memory')).toBeInTheDocument();
    });
  });

  // ── Memory form — Knowledge Base ──────────────────────────────────────

  it('memory switches to knowledge base subtype', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Knowledge Base'));
    // Knowledge fields visible
    expect(screen.getByText('Topic *')).toBeInTheDocument();
    expect(screen.getByText('Save to Knowledge Base')).toBeInTheDocument();
    // Vector memory fields gone
    expect(screen.queryByText('Memory Type')).not.toBeInTheDocument();
  });

  it('knowledge base submit is disabled without topic and content', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Knowledge Base'));
    expect(screen.getByText('Save to Knowledge Base')).toBeDisabled();
  });

  it('knowledge base submit sends correct data', async () => {
    mockLearnKnowledge.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Knowledge Base'));
    await user.type(
      screen.getByPlaceholderText('e.g. Project Architecture, API Design'),
      'API Design'
    );
    await user.type(
      screen.getByPlaceholderText(
        'Markdown or plain text content to store in the knowledge base...'
      ),
      'REST conventions'
    );
    await user.click(screen.getByText('Save to Knowledge Base'));
    await waitFor(() => {
      expect(mockLearnKnowledge).toHaveBeenCalledTimes(1);
    });
    // learnKnowledge wraps in mutationFn: ({topic, content}) => learnKnowledge(topic, content)
    expect(mockLearnKnowledge.mock.calls[0][0]).toBe('API Design');
    expect(mockLearnKnowledge.mock.calls[0][1]).toBe('REST conventions');
  });

  it('knowledge base shows error on failure', async () => {
    mockLearnKnowledge.mockRejectedValue(new Error('Parse error'));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Knowledge Base'));
    await user.type(
      screen.getByPlaceholderText('e.g. Project Architecture, API Design'),
      'Topic'
    );
    await user.type(
      screen.getByPlaceholderText(
        'Markdown or plain text content to store in the knowledge base...'
      ),
      'Content'
    );
    await user.click(screen.getByText('Save to Knowledge Base'));
    await waitFor(() => {
      expect(screen.getByText('Parse error')).toBeInTheDocument();
    });
  });

  it('knowledge base shows fallback error for non-Error rejection', async () => {
    mockLearnKnowledge.mockRejectedValue(undefined);
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Knowledge Base'));
    await user.type(
      screen.getByPlaceholderText('e.g. Project Architecture, API Design'),
      'T'
    );
    await user.type(
      screen.getByPlaceholderText(
        'Markdown or plain text content to store in the knowledge base...'
      ),
      'C'
    );
    await user.click(screen.getByText('Save to Knowledge Base'));
    await waitFor(() => {
      expect(screen.getByText('Failed to save knowledge')).toBeInTheDocument();
    });
  });

  it('memory can switch back from knowledge to vector', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Knowledge Base'));
    expect(screen.getByText('Topic *')).toBeInTheDocument();
    await user.click(screen.getByText('Vector Memory'));
    expect(screen.getByText('Memory Type')).toBeInTheDocument();
    expect(screen.getByText('Add to Memory')).toBeInTheDocument();
  });

  // ── Intent form ───────────────────────────────────────────────────────

  it('intent form shows tabs', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    expect(screen.getByText('Basics')).toBeInTheDocument();
    expect(screen.getByText('Boundaries')).toBeInTheDocument();
    expect(screen.getByText('Policies')).toBeInTheDocument();
    expect(screen.getByText('Import JSON')).toBeInTheDocument();
  });

  it('intent create is disabled without name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    expect(screen.getByText('Create Intent')).toBeDisabled();
  });

  it('intent basics tab shows empty goals message', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    expect(screen.getByText(/No goals yet/)).toBeInTheDocument();
  });

  it('intent add and remove goals', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add Goal'));
    expect(screen.queryByText(/No goals yet/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Goal name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
    // Fill in goal name
    await user.type(screen.getByPlaceholderText('Goal name'), 'Safety');
    // Remove the goal
    const removeButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg') && btn.className.includes('hover:text-destructive')
    );
    expect(removeButtons.length).toBeGreaterThan(0);
    await user.click(removeButtons[0]);
    expect(screen.getByText(/No goals yet/)).toBeInTheDocument();
  });

  it('intent boundaries tab add and remove', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Boundaries'));
    expect(screen.getByText('No hard boundaries defined.')).toBeInTheDocument();
    await user.click(screen.getByText('Add Boundary'));
    expect(screen.queryByText('No hard boundaries defined.')).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('e.g., Never delete production data')
    ).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText('e.g., Never delete production data'),
      'No deletions'
    );
    await user.type(screen.getByPlaceholderText('Rationale'), 'Safety');
    // Remove boundary
    const removeButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('hover:text-destructive')
    );
    await user.click(removeButtons[0]);
    expect(screen.getByText('No hard boundaries defined.')).toBeInTheDocument();
  });

  it('intent policies tab add and remove', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Policies'));
    expect(screen.getByText('No policies defined.')).toBeInTheDocument();
    await user.click(screen.getByText('Add Policy'));
    expect(screen.queryByText('No policies defined.')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Policy rule')).toBeInTheDocument();
    // Change enforcement to block
    const enforcementSelect = screen.getByDisplayValue('Warn');
    await user.selectOptions(enforcementSelect, 'block');
    expect(enforcementSelect).toHaveValue('block');
    // Remove
    const removeButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('hover:text-destructive')
    );
    await user.click(removeButtons[0]);
    expect(screen.getByText('No policies defined.')).toBeInTheDocument();
  });

  it('intent import JSON tab — valid JSON', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Import JSON'));
    expect(
      screen.getByText(/Paste a full intent JSON document/)
    ).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/\"name\": \"\.\.\.\"/);
    const validJson = JSON.stringify({
      name: 'Imported Intent',
      goals: [{ name: 'G1', description: 'Goal 1', priority: 3 }],
      hardBoundaries: [{ rule: 'No delete', rationale: 'Safety' }],
      policies: [{ rule: 'Log all', enforcement: 'block', rationale: 'Audit' }],
    });
    await user.click(textarea);
    await user.paste(validJson);
    // Parse & Apply button should be rendered with HTML entity
    const parseBtn = screen.getByRole('button', { name: /Parse/ });
    expect(parseBtn).not.toBeDisabled();
    await user.click(parseBtn);
    // Should switch to basics tab with imported name
    await waitFor(() => {
      expect(screen.getByDisplayValue('Imported Intent')).toBeInTheDocument();
    });
  });

  it('intent import JSON tab — invalid JSON shows error', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Import JSON'));
    const textarea = screen.getByPlaceholderText(/\"name\": \"\.\.\.\"/);
    await user.type(textarea, 'not valid json{{');
    const parseBtn = screen.getByRole('button', { name: /Parse/ });
    await user.click(parseBtn);
    await waitFor(() => {
      expect(
        screen.getByText('Invalid JSON \u2014 check the format and try again.')
      ).toBeInTheDocument();
    });
  });

  it('intent import parse button is disabled when textarea is empty', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Import JSON'));
    const parseBtn = screen.getByRole('button', { name: /Parse/ });
    expect(parseBtn).toBeDisabled();
  });

  it('intent create submits structured data', async () => {
    mockCreateIntent.mockResolvedValue({ id: 'i1' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    // Fill in name
    await user.type(
      screen.getByPlaceholderText('e.g., Production Safety Intent'),
      'Test Intent'
    );
    // Add a goal
    await user.click(screen.getByText('Add Goal'));
    await user.type(screen.getByPlaceholderText('Goal name'), 'Safety');
    await user.type(screen.getByPlaceholderText('Description'), 'Keep things safe');
    // Submit
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(mockCreateIntent).toHaveBeenCalledTimes(1);
    });
    const args = mockCreateIntent.mock.calls[0][0];
    expect(args.name).toBe('Test Intent');
    expect(args.goals).toHaveLength(1);
    expect(args.goals[0].name).toBe('Safety');
    expect(args.goals[0].description).toBe('Keep things safe');
    expect(args.apiVersion).toBe('1.0');
  });

  it('intent create shows error on failure in import tab', async () => {
    mockCreateIntent.mockRejectedValue(new Error('Validation failed'));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.type(
      screen.getByPlaceholderText('e.g., Production Safety Intent'),
      'Bad Intent'
    );
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(mockCreateIntent).toHaveBeenCalled();
    });
    // Error is stored in importError, visible on import tab
    await user.click(screen.getByText('Import JSON'));
    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });
  });

  it('intent create shows fallback error for non-Error rejection', async () => {
    mockCreateIntent.mockRejectedValue(undefined);
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.type(
      screen.getByPlaceholderText('e.g., Production Safety Intent'),
      'Fail Intent'
    );
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(mockCreateIntent).toHaveBeenCalled();
    });
    // Error is stored in importError, visible on import tab
    await user.click(screen.getByText('Import JSON'));
    await waitFor(() => {
      expect(screen.getByText('Failed to create intent')).toBeInTheDocument();
    });
  });

  it('intent filters out goals with empty names on submit', async () => {
    mockCreateIntent.mockResolvedValue({ id: 'i2' });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText('Intent'));
    await waitFor(() => {
      expect(screen.getByText('New Intent')).toBeInTheDocument();
    });
    await user.type(
      screen.getByPlaceholderText('e.g., Production Safety Intent'),
      'Filter Test'
    );
    // Add a goal but leave name empty
    await user.click(screen.getByText('Add Goal'));
    // Don't fill the name, just submit
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(mockCreateIntent).toHaveBeenCalled();
    });
    // Empty-named goal should be filtered out
    expect(mockCreateIntent.mock.calls[0][0].goals).toHaveLength(0);
  });

  // ── Proactive trigger on success closes dialog ────────────────────────

  it('proactive trigger on success closes dialog', async () => {
    mockCreateProactiveTrigger.mockResolvedValue({ id: 'ok' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Proactive Trigger'));
    await waitFor(() => {
      expect(screen.getByText('New Proactive Trigger')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('My trigger'), 'Test');
    await user.type(
      screen.getByPlaceholderText('Enter the message or reminder content...'),
      'Content'
    );
    await user.click(screen.getByText('Create Trigger'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Extension on success closes dialog ────────────────────────────────

  it('extension on success closes dialog', async () => {
    mockRegisterExtension.mockResolvedValue({ id: 'ok' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Extension'));
    await waitFor(() => {
      expect(screen.getByText('New Extension')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. my-extension'), 'ext');
    await user.type(screen.getByPlaceholderText('My Extension'), 'Ext');
    await user.click(screen.getByText('Register Extension'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Memory on success closes dialog ───────────────────────────────────

  it('memory on success closes dialog', async () => {
    mockAddMemory.mockResolvedValue({ id: 'ok' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.type(
      screen.getByPlaceholderText('The memory content to store...'),
      'Fact'
    );
    await user.type(screen.getByPlaceholderText('e.g. user, system, chat'), 'user');
    await user.click(screen.getByText('Add to Memory'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('knowledge on success closes dialog', async () => {
    mockLearnKnowledge.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Memory'));
    await waitFor(() => {
      expect(screen.getByText('Add Memory')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Knowledge Base'));
    await user.type(
      screen.getByPlaceholderText('e.g. Project Architecture, API Design'),
      'Topic'
    );
    await user.type(
      screen.getByPlaceholderText(
        'Markdown or plain text content to store in the knowledge base...'
      ),
      'Content'
    );
    await user.click(screen.getByText('Save to Knowledge Base'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── User on success closes dialog ─────────────────────────────────────

  it('user on success closes dialog', async () => {
    mockCreateUser.mockResolvedValue({ id: 'ok' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('User'));
    await waitFor(() => {
      expect(screen.getByText('New User')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Jane');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass');
    await user.click(screen.getByText('Create User'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Workspace on success closes dialog ────────────────────────────────

  it('workspace on success closes dialog', async () => {
    mockCreateWorkspace.mockResolvedValue({ id: 'ok' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Workspace'));
    await waitFor(() => {
      expect(screen.getByText('New Workspace')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), 'Eng');
    await user.click(screen.getByText('Create Workspace'));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
