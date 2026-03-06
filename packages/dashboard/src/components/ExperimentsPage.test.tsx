// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExperimentsPage } from './ExperimentsPage';

vi.mock('../api/client', () => ({
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <ExperimentsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ExperimentsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Mock global fetch for experiment API calls (fetchExperiments uses fetch directly)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ experiments: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('shows disabled state when allowExperiments is false', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
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
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Experiments are Disabled')).toBeInTheDocument();
    });
  });

  it('shows experiments list when allowExperiments is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: true,
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
    });

    renderComponent();

    expect(await screen.findByText('Experiments')).toBeInTheDocument();
    expect(await screen.findByText('New Experiment')).toBeInTheDocument();
  });

  it('renders the page heading', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: true,
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
    });

    renderComponent();
    expect(await screen.findByText('Experiments')).toBeInTheDocument();
  });

  it('mentions security settings in disabled state', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
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
    });

    renderComponent();

    await waitFor(() => {
      expect(
        screen.getByText(/must be explicitly enabled after initialization/)
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when experiments list is empty and enabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ experiments: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/No experiments yet/)).toBeInTheDocument();
    });
  });

  it('shows experiment count', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          experiments: [
            {
              id: 'exp-1',
              name: 'Test Exp',
              description: 'A test',
              status: 'draft',
              variants: [
                { id: 'v1', name: 'Control', config: {}, trafficPercent: 50 },
                { id: 'v2', name: 'Variant A', config: {}, trafficPercent: 50 },
              ],
              createdAt: Date.now(),
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('1 experiment(s)')).toBeInTheDocument();
    });
  });

  it('shows experiment name and status', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          experiments: [
            {
              id: 'exp-1',
              name: 'My Experiment',
              description: 'Testing something',
              status: 'running',
              variants: [{ id: 'v1', name: 'Control', config: {}, trafficPercent: 50 }],
              createdAt: Date.now(),
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('My Experiment')).toBeInTheDocument();
      expect(screen.getByText('running')).toBeInTheDocument();
      expect(screen.getByText('Testing something')).toBeInTheDocument();
    });
  });

  it('shows create form when New Experiment is clicked', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    renderComponent();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText('New Experiment')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Experiment'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Experiment name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('What this experiment tests')).toBeInTheDocument();
      expect(screen.getByText('Create Experiment')).toBeInTheDocument();
    });
  });

  it('hides create form when Cancel is clicked', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    renderComponent();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText('New Experiment')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Experiment'));
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Experiment name')).not.toBeInTheDocument();
    });
  });

  it('Create Experiment button is disabled when name is empty', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    renderComponent();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByText('New Experiment')).toBeInTheDocument();
    });
    await user.click(screen.getByText('New Experiment'));
    await waitFor(() => {
      expect(screen.getByText('Create Experiment')).toBeInTheDocument();
    });
    expect(screen.getByText('Create Experiment').closest('button')).toBeDisabled();
  });

  it('shows Start button for draft experiments', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          experiments: [
            {
              id: 'exp-1',
              name: 'Draft Exp',
              description: '',
              status: 'draft',
              variants: [],
              createdAt: Date.now(),
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTitle('Start experiment')).toBeInTheDocument();
    });
  });

  it('shows Stop button for running experiments', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          experiments: [
            {
              id: 'exp-1',
              name: 'Running Exp',
              description: '',
              status: 'running',
              variants: [],
              createdAt: Date.now(),
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTitle('Stop experiment')).toBeInTheDocument();
    });
  });

  it('shows delete button for all experiments', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          experiments: [
            {
              id: 'exp-1',
              name: 'Some Exp',
              description: '',
              status: 'completed',
              variants: [],
              createdAt: Date.now(),
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTitle('Delete experiment')).toBeInTheDocument();
    });
  });

  it('shows variant count and created date', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: true } as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          experiments: [
            {
              id: 'exp-1',
              name: 'Exp',
              description: '',
              status: 'draft',
              variants: [
                { id: 'v1', name: 'Control', config: {}, trafficPercent: 50 },
                { id: 'v2', name: 'Variant A', config: {}, trafficPercent: 50 },
              ],
              createdAt: Date.now(),
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/2 variants/)).toBeInTheDocument();
    });
  });

  it('shows allowExperiments code in disabled state', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowExperiments: false } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('allowExperiments')).toBeInTheDocument();
    });
  });
});
