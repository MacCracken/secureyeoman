// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SwarmsPage } from './SwarmsPage';

vi.mock('../api/client', () => ({
  fetchSwarmTemplates: vi.fn(),
  executeSwarm: vi.fn(),
  fetchSwarmRuns: vi.fn(),
  cancelSwarmRun: vi.fn(),
  createSwarmTemplate: vi.fn(),
  updateSwarmTemplate: vi.fn(),
  deleteSwarmTemplate: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSwarmTemplates = vi.mocked(api.fetchSwarmTemplates);
const mockFetchSwarmRuns = vi.mocked(api.fetchSwarmRuns);
const mockExecuteSwarm = vi.mocked(api.executeSwarm);
const mockCreateSwarmTemplate = vi.mocked(api.createSwarmTemplate);
const mockUpdateSwarmTemplate = vi.mocked(api.updateSwarmTemplate);
const mockDeleteSwarmTemplate = vi.mocked(api.deleteSwarmTemplate);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent(allowSubAgents = true) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <SwarmsPage allowSubAgents={allowSubAgents} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const BUILTIN_TEMPLATE = {
  id: 'research-and-code',
  name: 'research-and-code',
  description: 'Sequential: researcher → coder → reviewer',
  strategy: 'sequential' as const,
  roles: [
    { role: 'researcher', profileName: 'researcher', description: 'Gather info' },
    { role: 'coder', profileName: 'coder', description: 'Implement' },
    { role: 'reviewer', profileName: 'reviewer', description: 'Review' },
  ],
  coordinatorProfile: null,
  isBuiltin: true,
  createdAt: Date.now(),
};

const CUSTOM_TEMPLATE = {
  id: 'my-custom',
  name: 'my-custom',
  description: 'A custom user-created template',
  strategy: 'sequential' as const,
  roles: [
    { role: 'coder', profileName: 'coder', description: 'Code' },
    { role: 'reviewer', profileName: 'reviewer', description: 'Review' },
  ],
  coordinatorProfile: null,
  isBuiltin: false,
  createdAt: Date.now(),
};

const MOCK_TEMPLATES = {
  templates: [BUILTIN_TEMPLATE, CUSTOM_TEMPLATE],
};

const MOCK_RUNS = {
  runs: [
    {
      id: 'run-1',
      templateId: 'research-and-code',
      templateName: 'research-and-code',
      task: 'Build a web scraper',
      context: null,
      status: 'completed' as const,
      strategy: 'sequential' as const,
      result: 'Done! Here is the implementation...',
      error: null,
      tokenBudget: 500000,
      tokensUsedPrompt: 1000,
      tokensUsedCompletion: 500,
      createdAt: Date.now() - 60000,
      startedAt: Date.now() - 55000,
      completedAt: Date.now() - 10000,
      initiatedBy: null,
      members: [
        {
          id: 'm1',
          swarmRunId: 'run-1',
          role: 'researcher',
          profileName: 'researcher',
          delegationId: 'del-1',
          status: 'completed',
          result: 'Research done',
          seqOrder: 0,
          createdAt: Date.now() - 55000,
          startedAt: Date.now() - 55000,
          completedAt: Date.now() - 40000,
        },
      ],
    },
  ],
  total: 1,
};

describe('SwarmsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSwarmTemplates.mockResolvedValue(MOCK_TEMPLATES);
    mockFetchSwarmRuns.mockResolvedValue(MOCK_RUNS);
    mockCreateSwarmTemplate.mockResolvedValue({ template: BUILTIN_TEMPLATE });
    mockUpdateSwarmTemplate.mockResolvedValue({ template: CUSTOM_TEMPLATE });
    mockDeleteSwarmTemplate.mockResolvedValue({ success: true });
  });

  // ── Disabled state ──────────────────────────────────────────

  it('shows disabled state when allowSubAgents is false', async () => {
    renderComponent(false);
    await waitFor(() => {
      expect(screen.getByText('Agent Swarms Disabled')).toBeInTheDocument();
    });
  });

  it('shows enable instruction in disabled state', async () => {
    renderComponent(false);
    await waitFor(() => {
      expect(screen.getByText(/allowSubAgents/)).toBeInTheDocument();
    });
  });

  // ── Template cards ──────────────────────────────────────────

  it('shows template cards when enabled', async () => {
    renderComponent(true);
    const heading = await screen.findByText('Templates');
    expect(heading).toBeInTheDocument();
    const allMatches = await screen.findAllByText('research-and-code');
    expect(allMatches.length).toBeGreaterThan(0);
  });

  it('shows custom template name on card', async () => {
    renderComponent(true);
    await screen.findByText('Templates');
    expect(await screen.findByText('my-custom')).toBeInTheDocument();
  });

  it('shows strategy badge on template card', async () => {
    renderComponent(true);
    const badges = await screen.findAllByText('sequential');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders Launch button per template with ghost styling', async () => {
    renderComponent(true);
    await screen.findByText('Templates');
    const launchButtons = await screen.findAllByText('Launch');
    expect(launchButtons).toHaveLength(2);
    // Each Launch button should use btn btn-ghost (not bg-primary)
    for (const btn of launchButtons) {
      expect(btn.closest('button')?.className).toContain('btn-ghost');
      expect(btn.closest('button')?.className).not.toContain('bg-primary');
    }
  });

  it('shows delete button only on custom (non-builtin) templates', async () => {
    renderComponent(true);
    await screen.findByText('my-custom');
    const deleteButtons = screen.queryAllByLabelText('Delete template');
    expect(deleteButtons).toHaveLength(1);
  });

  it('calls deleteSwarmTemplate when delete button clicked', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    await screen.findByText('my-custom');
    const deleteBtn = screen.getByLabelText('Delete template');
    await user.click(deleteBtn);
    expect(mockDeleteSwarmTemplate).toHaveBeenCalledWith('my-custom', expect.any(Object));
  });

  // ── Launch form ─────────────────────────────────────────────

  it('shows launch form when Launch is clicked', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    await screen.findByText('Templates');
    const launchButtons = await screen.findAllByText('Launch');
    await user.click(launchButtons[0]!);
    expect(
      await screen.findByPlaceholderText('Describe the task for the swarm...')
    ).toBeInTheDocument();
  });

  // ── New Template button ─────────────────────────────────────

  it('shows New Template button', async () => {
    renderComponent(true);
    await screen.findByText('Templates');
    expect(await screen.findByText('New Template')).toBeInTheDocument();
  });

  it('shows create template form when New Template is clicked', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    expect(await screen.findByText('New Swarm Template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. review-and-deploy')).toBeInTheDocument();
  });

  it('hides create template form when X is clicked', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    await screen.findByText('New Swarm Template');
    const closeBtn = screen.getByRole('button', { name: '' });
    // Find the X button inside the form header
    const formHeader = screen.getByText('New Swarm Template').parentElement!;
    const xBtn = formHeader.querySelector('button')!;
    await user.click(xBtn);
    await waitFor(() => {
      expect(screen.queryByText('New Swarm Template')).not.toBeInTheDocument();
    });
  });

  it('Create Template button is disabled when name is empty', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    await screen.findByText('New Swarm Template');
    const createBtn = screen.getByRole('button', { name: 'Create Template' });
    expect(createBtn).toBeDisabled();
  });

  it('Create Template button is disabled when role fields are incomplete', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    await screen.findByText('New Swarm Template');
    // Fill name but leave role empty
    await user.type(screen.getByPlaceholderText('e.g. review-and-deploy'), 'my-template');
    const createBtn = screen.getByRole('button', { name: 'Create Template' });
    expect(createBtn).toBeDisabled();
  });

  it('calls createSwarmTemplate with correct data on submit', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    await screen.findByText('New Swarm Template');

    await user.type(screen.getByPlaceholderText('e.g. review-and-deploy'), 'my-pipeline');
    await user.type(
      screen.getByPlaceholderText('What this swarm does...'),
      'A test pipeline'
    );

    // Fill in the first role row
    const roleInputs = screen.getAllByPlaceholderText('role (e.g. reviewer)');
    const profileInputs = screen.getAllByPlaceholderText('profile (e.g. reviewer)');
    await user.type(roleInputs[0]!, 'coder');
    await user.type(profileInputs[0]!, 'coder');

    const createBtn = screen.getByRole('button', { name: 'Create Template' });
    await user.click(createBtn);

    expect(mockCreateSwarmTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-pipeline',
        description: 'A test pipeline',
        strategy: 'sequential',
        roles: expect.arrayContaining([
          expect.objectContaining({ role: 'coder', profileName: 'coder' }),
        ]),
        coordinatorProfile: null,
      }),
      expect.any(Object)
    );
  });

  it('can add a second role row', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    await screen.findByText('New Swarm Template');

    const addRoleBtn = screen.getByText('Add Role');
    await user.click(addRoleBtn);

    const roleInputs = screen.getAllByPlaceholderText('role (e.g. reviewer)');
    expect(roleInputs).toHaveLength(2);
  });

  it('remove role button is disabled when only one role remains', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    await screen.findByText('New Swarm Template');

    const removeButtons = screen.getAllByLabelText('Remove role');
    expect(removeButtons[0]).toBeDisabled();
  });

  it('can remove a role row when multiple exist', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    const newBtn = await screen.findByText('New Template');
    await user.click(newBtn);
    await screen.findByText('New Swarm Template');

    await user.click(screen.getByText('Add Role'));
    let roleInputs = screen.getAllByPlaceholderText('role (e.g. reviewer)');
    expect(roleInputs).toHaveLength(2);

    const removeButtons = screen.getAllByLabelText('Remove role');
    await user.click(removeButtons[0]!);
    roleInputs = screen.getAllByPlaceholderText('role (e.g. reviewer)');
    expect(roleInputs).toHaveLength(1);
  });

  // ── Edit template ────────────────────────────────────────────

  it('shows edit button on custom template but not on builtin', async () => {
    renderComponent(true);
    await screen.findByText('my-custom');
    const editButtons = screen.queryAllByLabelText('Edit template');
    expect(editButtons).toHaveLength(1);
  });

  it('clicking edit opens pre-populated form with existing values', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    await screen.findByText('my-custom');
    const editBtn = screen.getByLabelText('Edit template');
    await user.click(editBtn);
    expect(await screen.findByText('Edit Swarm Template')).toBeInTheDocument();
    expect(screen.getByDisplayValue('my-custom')).toBeInTheDocument();
  });

  it('submitting edit form calls updateSwarmTemplate with correct id and data', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    await screen.findByText('my-custom');
    const editBtn = screen.getByLabelText('Edit template');
    await user.click(editBtn);
    await screen.findByText('Edit Swarm Template');
    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    await user.click(saveBtn);
    expect(mockUpdateSwarmTemplate).toHaveBeenCalledWith(
      'my-custom',
      expect.objectContaining({ name: 'my-custom' })
    );
  });

  it('form closes after successful edit', async () => {
    const user = userEvent.setup();
    renderComponent(true);
    await screen.findByText('my-custom');
    const editBtn = screen.getByLabelText('Edit template');
    await user.click(editBtn);
    await screen.findByText('Edit Swarm Template');
    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(screen.queryByText('Edit Swarm Template')).not.toBeInTheDocument();
    });
  });

  // ── Run history ─────────────────────────────────────────────

  it('shows completed run in history', async () => {
    renderComponent(true);
    expect(await screen.findByText('Build a web scraper')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });
});
