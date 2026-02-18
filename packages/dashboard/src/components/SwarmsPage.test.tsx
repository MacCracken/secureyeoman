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
}));

import * as api from '../api/client';

const mockFetchSwarmTemplates = vi.mocked(api.fetchSwarmTemplates);
const mockFetchSwarmRuns = vi.mocked(api.fetchSwarmRuns);
const mockExecuteSwarm = vi.mocked(api.executeSwarm);

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

const MOCK_TEMPLATES = {
  templates: [
    {
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
    },
    {
      id: 'code-review',
      name: 'code-review',
      description: 'Sequential: coder → reviewer',
      strategy: 'sequential' as const,
      roles: [
        { role: 'coder', profileName: 'coder', description: 'Code' },
        { role: 'reviewer', profileName: 'reviewer', description: 'Review' },
      ],
      coordinatorProfile: null,
      isBuiltin: true,
      createdAt: Date.now(),
    },
  ],
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
    // Template names appear in both cards and run history; use heading context
    const heading = await screen.findByText('Templates');
    expect(heading).toBeInTheDocument();
    const allMatches = await screen.findAllByText('research-and-code');
    expect(allMatches.length).toBeGreaterThan(0);
  });

  it('shows template name on card', async () => {
    renderComponent(true);
    // 'code-review' only appears in the Templates section for this mock set
    await screen.findByText('Templates');
    expect(await screen.findByText('code-review')).toBeInTheDocument();
  });

  it('shows strategy badge on template card', async () => {
    renderComponent(true);
    const badges = await screen.findAllByText('sequential');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders Launch button per template', async () => {
    renderComponent(true);
    await screen.findByText('Templates');
    const launchButtons = await screen.findAllByText('Launch');
    expect(launchButtons).toHaveLength(2);
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

  // ── Run history ─────────────────────────────────────────────

  it('shows completed run in history', async () => {
    renderComponent(true);
    expect(await screen.findByText('Build a web scraper')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });
});
