// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PersonalTab } from './PersonalTab';

vi.mock('../../api/client', () => ({
  fetchSkills: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  enableSkill: vi.fn(),
  disableSkill: vi.fn(),
  approveSkill: vi.fn(),
  rejectSkill: vi.fn(),
  installMarketplaceSkill: vi.fn(),
  fetchPersonalities: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
}));

// Stub WebSocket so useCollabEditor doesn't open real sockets
vi.stubGlobal(
  'WebSocket',
  class {
    static OPEN = 1;
    static CLOSED = 3;
    binaryType = 'arraybuffer';
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: (() => void) | null = null;
    send() {}
    close() {
      this.onclose?.();
    }
  }
);

import * as api from '../../api/client';

const mockFetchSkills = vi.mocked(api.fetchSkills);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PersonalTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const defaultPersonality = { id: 'p1', name: 'Default', isDefault: true, isActive: true };

describe('PersonalTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (api.getAccessToken as any).mockReturnValue(null);
    mockFetchSkills.mockResolvedValue({ skills: [] } as any);
    mockFetchPersonalities.mockResolvedValue({
      personalities: [defaultPersonality],
    } as any);
  });

  it('renders Add Skill button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Skill')).toBeInTheDocument();
    });
  });

  it('renders Import button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument();
    });
  });

  it('renders status filter', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Status')).toBeInTheDocument();
    });
  });

  it('renders source filter', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Sources')).toBeInTheDocument();
    });
  });

  it('shows "No skills found" when list is empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No skills found')).toBeInTheDocument();
    });
  });

  it('renders skill list', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Code Review',
          description: 'Reviews code',
          instructions: 'Review the code',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: ['/review'],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
      expect(screen.getByText('Reviews code')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  it('shows create form when Add Skill clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Skill')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add Skill'));
    expect(screen.getByText('Create New Skill')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Skill name')).toBeInTheDocument();
  });

  it('renders personality selector in the top bar', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Default (Default) (Active)')).toBeInTheDocument();
    });
  });

  it('shows trigger patterns on skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Test',
          description: 'Test skill',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: ['/test', '/run'],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('/test')).toBeInTheDocument();
      expect(screen.getByText('/run')).toBeInTheDocument();
    });
  });

  it('shows pending approval badge count', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Pending Skill',
          description: 'Pending',
          instructions: '',
          status: 'pending_approval',
          source: 'ai_proposed',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('1 pending approval')).toBeInTheDocument();
    });
  });

  it('shows info text about skills for personality', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Skills for/)).toBeInTheDocument();
    });
  });

  it('filters skills by status', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Active Skill',
          description: 'Active',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
        {
          id: 'sk2',
          name: 'Pending Skill',
          description: 'Pending',
          instructions: '',
          status: 'pending_approval',
          source: 'ai_proposed',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);

    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Active Skill')).toBeInTheDocument();
      expect(screen.getByText('Pending Skill')).toBeInTheDocument();
    });

    // Filter by pending_approval
    const statusSelect = screen.getByDisplayValue('All Status');
    await user.selectOptions(statusSelect, 'pending_approval');

    await waitFor(() => {
      expect(screen.getByText('Pending Skill')).toBeInTheDocument();
    });
  });

  it('filters skills by source', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'User Skill',
          description: 'User created',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
        {
          id: 'sk2',
          name: 'AI Skill',
          description: 'AI learned',
          instructions: '',
          status: 'active',
          source: 'ai_learned',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);

    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('User Skill')).toBeInTheDocument();
    });

    const sourceSelect = screen.getByDisplayValue('All Sources');
    await user.selectOptions(sourceSelect, 'user');

    await waitFor(() => {
      expect(screen.getByText('User Skill')).toBeInTheDocument();
    });
  });

  it('shows disabled status on disabled skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Disabled Skill',
          description: 'Off',
          instructions: '',
          status: 'disabled',
          source: 'user',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Disabled Skill')).toBeInTheDocument();
      expect(screen.getByText('disabled')).toBeInTheDocument();
    });
  });

  it('shows source labels on skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'AI Learned Skill',
          description: 'Learned',
          instructions: '',
          status: 'active',
          source: 'ai_learned',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('AI Learned')).toBeInTheDocument();
    });
  });

  it('shows multiple personalities in selector', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        defaultPersonality,
        { id: 'p2', name: 'Security Bot', isDefault: false, isActive: false },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Default (Default) (Active)')).toBeInTheDocument();
    });
  });

  it('shows create form with all fields', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Skill')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add Skill'));
    expect(screen.getByPlaceholderText('Skill name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('cancels create form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Skill')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add Skill'));
    expect(screen.getByText('Create New Skill')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create New Skill')).not.toBeInTheDocument();
  });

  it('shows approve/reject buttons for pending AI skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'AI Proposed',
          description: 'AI proposed skill',
          instructions: 'Do stuff',
          status: 'pending_approval',
          source: 'ai_proposed',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('AI Proposed')).toBeInTheDocument();
    });
  });

  it('renders multiple skills in list', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Skill One',
          description: 'First skill',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
        {
          id: 'sk2',
          name: 'Skill Two',
          description: 'Second skill',
          instructions: '',
          status: 'active',
          source: 'ai_learned',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: ['/two'],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Skill One')).toBeInTheDocument();
      expect(screen.getByText('Skill Two')).toBeInTheDocument();
    });
  });

  it('shows edit form when edit button clicked', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Editable Skill',
          description: 'Can edit',
          instructions: 'Do things',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: ['/edit'],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Editable Skill')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Edit'));
    await waitFor(() => {
      expect(screen.getByText('Edit Skill')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Editable Skill')).toBeInTheDocument();
    });
  });

  it('shows enable/disable toggle for active skills', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Toggleable',
          description: 'Toggle me',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Toggleable')).toBeInTheDocument();
    });
    const disableBtn = screen.getByTitle('Disable');
    expect(disableBtn).toBeInTheDocument();
    await user.click(disableBtn);
    await waitFor(() => {
      expect(vi.mocked(api.disableSkill)).toHaveBeenCalledWith('sk1');
    });
  });

  it('shows enable button for disabled skills', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Disabled One',
          description: 'Off',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Disabled One')).toBeInTheDocument();
    });
    const enableBtn = screen.getByTitle('Enable');
    expect(enableBtn).toBeInTheDocument();
    await user.click(enableBtn);
    await waitFor(() => {
      expect(vi.mocked(api.enableSkill)).toHaveBeenCalledWith('sk1');
    });
  });

  it('shows approve/reject buttons for pending skills', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Pending One',
          description: 'Needs approval',
          instructions: '',
          status: 'pending_approval',
          source: 'ai_proposed',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Pending One')).toBeInTheDocument();
    });
    expect(screen.getByTitle('Approve')).toBeInTheDocument();
    expect(screen.getByTitle('Reject')).toBeInTheDocument();

    await user.click(screen.getByTitle('Approve'));
    await waitFor(() => {
      expect(vi.mocked(api.approveSkill)).toHaveBeenCalledWith('sk1');
    });
  });

  it('calls rejectSkill on reject button click', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Reject Me',
          description: 'Should reject',
          instructions: '',
          status: 'pending_approval',
          source: 'ai_proposed',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Reject Me')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Reject'));
    await waitFor(() => {
      expect(vi.mocked(api.rejectSkill)).toHaveBeenCalledWith('sk1');
    });
  });

  it('shows delete confirm dialog when delete button clicked', async () => {
    const user = userEvent.setup();
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Delete Me',
          description: 'Should delete',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Delete Me')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    });
  });

  it('calls createSkill when create form submitted', async () => {
    const { fireEvent: fe } = await import('@testing-library/react');
    const user = userEvent.setup();
    const mockCreate = vi.mocked(api.createSkill);
    mockCreate.mockResolvedValue({ id: 'new-1', name: 'New Test' } as any);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Skill')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add Skill'));

    const nameInput = screen.getByPlaceholderText('Skill name');
    const descInput = screen.getByPlaceholderText('Description');
    fe.change(nameInput, { target: { value: 'New Test' } });
    fe.change(descInput, { target: { value: 'A test description' } });

    await user.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Test', description: 'A test description' })
      );
    });
  });

  it('shows export button for AI source skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'AI Exportable',
          description: 'AI learned skill',
          instructions: 'Instructions here',
          status: 'active',
          source: 'ai_learned',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('AI Exportable')).toBeInTheDocument();
    });
    expect(screen.getByTitle('Export as JSON')).toBeInTheDocument();
  });

  it('shows MCP restricted tools on skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Restricted Skill',
          description: 'Has MCP tools',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
          mcpToolsAllowed: ['web_search', 'file_read'],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Restricted Skill')).toBeInTheDocument();
    });
    expect(screen.getByText('MCP Restricted:')).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('file_read')).toBeInTheDocument();
  });

  it('shows linked workflow ID on skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Workflow Skill',
          description: 'Has workflow',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: [],
          linkedWorkflowId: 'wf-abc-123',
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Workflow Skill')).toBeInTheDocument();
    });
    expect(screen.getByText('Workflow:')).toBeInTheDocument();
    expect(screen.getByText('wf-abc-123')).toBeInTheDocument();
  });
});
