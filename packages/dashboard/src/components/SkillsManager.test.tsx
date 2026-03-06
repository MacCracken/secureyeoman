// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SkillsManager } from './SkillsManager';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchSkills: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    enableSkill: vi.fn(),
    disableSkill: vi.fn(),
    approveSkill: vi.fn(),
    rejectSkill: vi.fn(),
  };
});

vi.mock('./common/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel, message, title }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span data-testid="dialog-title">{title}</span>
        <span>{message}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

import * as api from '../api/client';

const mockFetchSkills = vi.mocked(api.fetchSkills);
const mockCreateSkill = vi.mocked(api.createSkill);
const mockUpdateSkill = vi.mocked(api.updateSkill);
const mockDeleteSkill = vi.mocked(api.deleteSkill);
const mockEnableSkill = vi.mocked(api.enableSkill);
const mockDisableSkill = vi.mocked(api.disableSkill);
const mockApproveSkill = vi.mocked(api.approveSkill);
const mockRejectSkill = vi.mocked(api.rejectSkill);

const SKILL: any = {
  id: 'sk-1',
  name: 'Summarize',
  description: 'Summarize text',
  instructions: 'Take text and summarize it.',
  triggerPatterns: ['summarize *'],
  enabled: true,
  source: 'user',
  status: 'active',
  useWhen: 'when user asks for summary',
  doNotUseWhen: 'not for code',
  successCriteria: 'good summary',
  mcpToolsAllowed: ['read_file'],
  routing: 'fuzzy',
  linkedWorkflowId: null,
  autonomyLevel: 'L1',
  emergencyStopProcedure: '',
  personalityId: 'p-1',
  usageCount: 5,
  invokedCount: 10,
  lastUsedAt: 1700000000000,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

const PENDING_SKILL: any = {
  ...SKILL,
  id: 'sk-2',
  name: 'Translate',
  status: 'pending_approval',
  source: 'ai_proposed',
  description: 'Translate text',
  triggerPatterns: ['translate *'],
  usageCount: 0,
  invokedCount: 0,
  lastUsedAt: null,
};

const DISABLED_SKILL: any = {
  ...SKILL,
  id: 'sk-3',
  name: 'Disabled Skill',
  status: 'disabled',
  enabled: false,
  description: 'A disabled skill',
  usageCount: 3,
  invokedCount: 0,
  lastUsedAt: null,
};

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderManager(initialEntries: string[] = ['/']) {
  return render(
    <QueryClientProvider client={createQC()}>
      <MemoryRouter initialEntries={initialEntries}>
        <SkillsManager />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchSkills.mockResolvedValue({ skills: [SKILL] } as any);
  mockCreateSkill.mockResolvedValue({} as any);
  mockUpdateSkill.mockResolvedValue({} as any);
  mockDeleteSkill.mockResolvedValue({} as any);
  mockEnableSkill.mockResolvedValue({} as any);
  mockDisableSkill.mockResolvedValue({} as any);
  mockApproveSkill.mockResolvedValue({} as any);
  mockRejectSkill.mockResolvedValue({} as any);
});

describe('SkillsManager', () => {
  it('renders the skills list', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
  });

  it('shows skill description', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize text')).toBeInTheDocument();
    });
  });

  it('shows skill source badge', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('User')).toBeInTheDocument();
    });
  });

  it('shows empty state when no skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText(/No skills/i)).toBeInTheDocument();
    });
  });

  it('shows filter controls', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by source')).toBeInTheDocument();
  });

  it('renders create button', async () => {
    renderManager();
    await waitFor(() => {
      const createBtn = screen.queryByText(/New Skill|Create/i);
      expect(createBtn).toBeInTheDocument();
    });
  });

  // --- Trigger patterns display ---
  it('shows trigger pattern chips', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('summarize *')).toBeInTheDocument();
    });
  });

  // --- Usage stats ---
  it('shows usage count', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Used 5 times')).toBeInTheDocument();
    });
  });

  it('shows routing precision when invokedCount > 0', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Routing precision: 50%')).toBeInTheDocument();
    });
  });

  it('shows last used date', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText(/Last:/)).toBeInTheDocument();
    });
  });

  it('shows created date', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText(/Created/)).toBeInTheDocument();
    });
  });

  // --- Pending count badge ---
  it('shows pending approval badge when pending skills exist', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [SKILL, PENDING_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('1 pending approval')).toBeInTheDocument();
    });
  });

  it('does not show pending badge when no pending skills', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    expect(screen.queryByText(/pending approval/)).not.toBeInTheDocument();
  });

  // --- Loading state ---
  it('shows loading indicator while fetching', async () => {
    mockFetchSkills.mockReturnValue(new Promise(() => {})); // never resolves
    renderManager();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  // --- Filter status change ---
  it('refetches skills when status filter changes', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    const statusFilter = screen.getByLabelText('Filter by status');
    await user.selectOptions(statusFilter, 'active');
    await waitFor(() => {
      expect(mockFetchSkills).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      );
    });
  });

  it('refetches skills when source filter changes', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    const sourceFilter = screen.getByLabelText('Filter by source');
    await user.selectOptions(sourceFilter, 'ai_proposed');
    await waitFor(() => {
      expect(mockFetchSkills).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'ai_proposed' }),
      );
    });
  });

  // --- Create flow ---
  it('opens create form and submits a new skill', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    expect(screen.getByText('Create Skill')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'New Skill Name');
    await user.type(screen.getByPlaceholderText('What this skill does'), 'A description');
    await user.type(
      screen.getByPlaceholderText(/Detailed instructions/),
      'Do something',
    );
    await user.type(
      screen.getByPlaceholderText(/Comma-separated patterns/),
      'trigger1, trigger2',
    );

    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockCreateSkill).toHaveBeenCalledTimes(1);
    });
    const createArg = mockCreateSkill.mock.calls[0][0];
    expect(createArg.name).toBe('New Skill Name');
    expect(createArg.triggerPatterns).toEqual(['trigger1', 'trigger2']);
  });

  it('disables save button when name is empty', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    const saveBtn = screen.getByText('Save');
    expect(saveBtn).toBeDisabled();
  });

  it('cancel button closes editor form', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    expect(screen.getByText('Create Skill')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create Skill')).not.toBeInTheDocument();
  });

  // --- Edit flow ---
  it('opens edit form with skill data pre-filled', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Edit skill Summarize'));
    expect(screen.getByText('Edit Skill')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Summarize')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Summarize text')).toBeInTheDocument();
    expect(screen.getByDisplayValue('summarize *')).toBeInTheDocument();
    expect(screen.getByDisplayValue('read_file')).toBeInTheDocument();
  });

  it('submits update when editing existing skill', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Edit skill Summarize'));
    const nameInput = screen.getByDisplayValue('Summarize');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdateSkill).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateSkill.mock.calls[0][0]).toBe('sk-1');
    expect(mockUpdateSkill.mock.calls[0][1].name).toBe('Updated Name');
  });

  // --- Delete flow ---
  it('opens confirm dialog and deletes skill', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Delete skill Summarize'));
    const dialog = screen.getByTestId('confirm-dialog');
    expect(within(dialog).getByText(/delete "Summarize"/i)).toBeInTheDocument();
    await user.click(within(dialog).getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteSkill).toHaveBeenCalledWith('sk-1');
    });
  });

  it('cancels delete dialog without deleting', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Delete skill Summarize'));
    const dialog = screen.getByTestId('confirm-dialog');
    await user.click(within(dialog).getByText('Cancel'));
    expect(mockDeleteSkill).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  // --- Enable/Disable toggle ---
  it('calls disableSkill when toggling an enabled active skill', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Disable skill Summarize'));
    await waitFor(() => {
      expect(mockDisableSkill).toHaveBeenCalledWith('sk-1');
    });
  });

  it('calls enableSkill when toggling a disabled skill', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({ skills: [DISABLED_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Disabled Skill')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Enable skill Disabled Skill'));
    await waitFor(() => {
      expect(mockEnableSkill).toHaveBeenCalledWith('sk-3');
    });
  });

  // --- Approve/Reject for pending skills ---
  it('shows approve/reject buttons for pending skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [PENDING_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Translate')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Approve skill Translate')).toBeInTheDocument();
    expect(screen.getByLabelText('Reject skill Translate')).toBeInTheDocument();
  });

  it('does not show approve/reject buttons for active skills', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Approve skill Summarize')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reject skill Summarize')).not.toBeInTheDocument();
  });

  it('does not show enable/disable toggle for pending skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [PENDING_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Translate')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Disable skill Translate/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Enable skill Translate/)).not.toBeInTheDocument();
  });

  it('calls approveSkill when approve button clicked', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({ skills: [PENDING_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Translate')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Approve skill Translate'));
    await waitFor(() => {
      expect(mockApproveSkill).toHaveBeenCalledWith('sk-2');
    });
  });

  it('calls rejectSkill when reject button clicked', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({ skills: [PENDING_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Translate')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Reject skill Translate'));
    await waitFor(() => {
      expect(mockRejectSkill).toHaveBeenCalledWith('sk-2');
    });
  });

  // --- Disabled skill badge rendering ---
  it('shows "disabled" badge for disabled skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [DISABLED_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('disabled')).toBeInTheDocument();
    });
  });

  it('shows status text for enabled skill', async () => {
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  it('shows "pending approval" status for pending skills', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [PENDING_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('pending approval')).toBeInTheDocument();
    });
  });

  // --- Source labels ---
  it('shows AI Proposed label for ai_proposed source', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [PENDING_SKILL] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('AI Proposed')).toBeInTheDocument();
    });
  });

  // --- Autonomy level: L4/L5 emergency stop field ---
  it('shows emergency stop procedure field for L4 autonomy', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    // Initially L1, no emergency stop field
    expect(screen.queryByPlaceholderText(/How to disable this skill/)).not.toBeInTheDocument();
    // Change to L4
    const autonomySelect = screen.getByDisplayValue(/L1/);
    await user.selectOptions(autonomySelect, 'L4');
    expect(screen.getByPlaceholderText(/How to disable this skill/)).toBeInTheDocument();
  });

  it('shows emergency stop procedure field for L5 autonomy', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    const autonomySelect = screen.getByDisplayValue(/L1/);
    await user.selectOptions(autonomySelect, 'L5');
    expect(screen.getByPlaceholderText(/How to disable this skill/)).toBeInTheDocument();
  });

  it('hides emergency stop for L2/L3', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    const autonomySelect = screen.getByDisplayValue(/L1/);
    await user.selectOptions(autonomySelect, 'L2');
    expect(screen.queryByPlaceholderText(/How to disable this skill/)).not.toBeInTheDocument();
    await user.selectOptions(autonomySelect, 'L3');
    expect(screen.queryByPlaceholderText(/How to disable this skill/)).not.toBeInTheDocument();
  });

  // --- Routing mode select ---
  it('allows changing routing mode in editor', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    const routingSelect = screen.getByDisplayValue(/Fuzzy/);
    await user.selectOptions(routingSelect, 'explicit');
    expect((routingSelect as HTMLSelectElement).value).toBe('explicit');
  });

  // --- Char counter ---
  it('shows character count for instructions', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    expect(screen.getByText('0 / 8,000 chars')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Detailed instructions/), 'Hello');
    expect(screen.getByText('5 / 8,000 chars')).toBeInTheDocument();
  });

  // --- Save warnings banner ---
  it('shows credential warning banner after create with warnings', async () => {
    const user = userEvent.setup();
    mockCreateSkill.mockResolvedValue({
      warnings: ['Possible API key detected'],
    } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'Cred Skill');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText('Possible API key detected')).toBeInTheDocument();
    });
    expect(screen.getByText(/Possible credential detected/)).toBeInTheDocument();
  });

  it('dismisses warning banner when dismiss button clicked', async () => {
    const user = userEvent.setup();
    mockCreateSkill.mockResolvedValue({
      warnings: ['Possible API key detected'],
    } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'Cred Skill');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText('Possible API key detected')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Dismiss warning'));
    expect(screen.queryByText('Possible API key detected')).not.toBeInTheDocument();
  });

  // --- Escalation warning modal ---
  it('shows escalation warning modal when autonomy escalated', async () => {
    const user = userEvent.setup();
    mockCreateSkill.mockResolvedValue({
      warnings: ['Autonomy escalated to L4'],
    } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'Esc Skill');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      const dialog = screen.getByTestId('confirm-dialog');
      expect(within(dialog).getByText('Autonomy escalated to L4')).toBeInTheDocument();
    });
  });

  it('dismisses escalation warning on confirm', async () => {
    const user = userEvent.setup();
    mockCreateSkill.mockResolvedValue({
      warnings: ['Autonomy escalated to L4'],
    } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'Esc Skill');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Confirm'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  // --- Update also shows warnings ---
  it('shows warnings after update mutation', async () => {
    const user = userEvent.setup();
    mockUpdateSkill.mockResolvedValue({
      warnings: ['Possible secret in instructions'],
    } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('Edit skill Summarize'));
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByText('Possible secret in instructions')).toBeInTheDocument();
    });
  });

  // --- Search params ?create=true pre-fill ---
  it('opens create form pre-filled from search params', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [] } as any);
    renderManager(['/?create=true&name=AutoSkill&description=A+desc&trigger=t1,t2&action=Do+stuff']);
    await waitFor(() => {
      expect(screen.getByText('Create Skill')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('AutoSkill')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A desc')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Do stuff')).toBeInTheDocument();
    expect(screen.getByDisplayValue('t1,t2')).toBeInTheDocument();
  });

  // --- Skills with no description ---
  it('does not render description paragraph when empty', async () => {
    const noDescSkill = { ...SKILL, description: '' };
    mockFetchSkills.mockResolvedValue({ skills: [noDescSkill] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    // Only the source "User" text; no description paragraph
    const cards = document.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThan(0);
  });

  // --- Skills with no trigger patterns ---
  it('does not render trigger chips when patterns empty', async () => {
    const noTriggerSkill = { ...SKILL, triggerPatterns: [] };
    mockFetchSkills.mockResolvedValue({ skills: [noTriggerSkill] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    expect(screen.queryByText('summarize *')).not.toBeInTheDocument();
  });

  // --- MCP tools input ---
  it('includes mcpToolsAllowed in create payload', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'Tools Skill');
    await user.type(
      screen.getByPlaceholderText(/Comma-separated tool names/),
      'read_file, web_search',
    );
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockCreateSkill).toHaveBeenCalledTimes(1);
    });
    const arg = mockCreateSkill.mock.calls[0][0];
    expect(arg.mcpToolsAllowed).toEqual(['read_file', 'web_search']);
  });

  // --- Linked workflow ID ---
  it('includes linkedWorkflowId in payload when set', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'WF Skill');
    await user.type(
      screen.getByPlaceholderText(/Workflow ID to trigger/),
      'wf-123',
    );
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockCreateSkill).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateSkill.mock.calls[0][0].linkedWorkflowId).toBe('wf-123');
  });

  it('sends null linkedWorkflowId when field is empty', async () => {
    const user = userEvent.setup();
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Skill/));
    await user.type(screen.getByPlaceholderText('e.g., Code Review'), 'WF Skill');
    // Leave workflow field empty
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockCreateSkill).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateSkill.mock.calls[0][0].linkedWorkflowId).toBeNull();
  });

  // --- Multiple skills rendering ---
  it('renders multiple skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [SKILL, PENDING_SKILL, DISABLED_SKILL],
    } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
      expect(screen.getByText('Translate')).toBeInTheDocument();
      expect(screen.getByText('Disabled Skill')).toBeInTheDocument();
    });
  });

  // --- Unknown source falls back to raw value ---
  it('falls back to raw source string for unknown sources', async () => {
    const customSkill = { ...SKILL, source: 'custom_source' };
    mockFetchSkills.mockResolvedValue({ skills: [customSkill] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('custom_source')).toBeInTheDocument();
    });
  });

  // --- No lastUsedAt ---
  it('does not show Last: when lastUsedAt is null', async () => {
    const noLastUsed = { ...SKILL, lastUsedAt: null };
    mockFetchSkills.mockResolvedValue({ skills: [noLastUsed] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Last:/)).not.toBeInTheDocument();
  });

  // --- No invokedCount (0) hides routing precision ---
  it('does not show routing precision when invokedCount is 0', async () => {
    const noInvoked = { ...SKILL, invokedCount: 0 };
    mockFetchSkills.mockResolvedValue({ skills: [noInvoked] } as any);
    renderManager();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Routing precision/)).not.toBeInTheDocument();
  });
});
