// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeveloperPage } from './DeveloperPage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchSecurityPolicy: vi.fn(),
    fetchExtensionConfig: vi.fn(),
    fetchTrainingStats: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExtensionConfig = vi.mocked(api.fetchExtensionConfig);
const mockFetchTrainingStats = vi.mocked(api.fetchTrainingStats);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <DeveloperPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const FULL_POLICY = {
  allowSubAgents: false,
  allowA2A: false,
  allowSwarms: false,
  allowExtensions: true,
  allowExecution: true,
  allowProactive: false,
  allowExperiments: true,
  allowStorybook: true,
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

describe('DeveloperPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSecurityPolicy.mockResolvedValue(FULL_POLICY);
    mockFetchExtensionConfig.mockResolvedValue({ config: {} });
    mockFetchTrainingStats.mockResolvedValue({ conversations: 42, memories: 7, knowledge: 3 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('renders the Developers heading', () => {
    renderComponent();
    expect(screen.getByText('Developers')).toBeInTheDocument();
  });

  it('renders all three tab buttons', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /extensions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /experiments/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /storybook/i })).toBeInTheDocument();
  });

  it('shows Extensions content by default, not Storybook', () => {
    renderComponent();
    expect(screen.queryByText('Storybook is Disabled')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick Start')).not.toBeInTheDocument();
  });

  it('switches to StorybookPage when Storybook tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /storybook/i }));

    await waitFor(() => {
      expect(
        screen.queryByText('Storybook is Disabled') ?? screen.queryByText('Quick Start')
      ).toBeTruthy();
    });
  });

  it('switches to ExperimentsPage when Experiments tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /experiments/i }));

    await waitFor(() => {
      expect(
        screen.queryByText('Experiments are Disabled') ?? screen.queryByText('New Experiment')
      ).toBeTruthy();
    });
  });

  it('does NOT render Training tab when allowTrainingExport is false', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...FULL_POLICY, allowTrainingExport: false });
    renderComponent();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /training/i })).not.toBeInTheDocument();
    });
  });

  it('renders Training tab when allowTrainingExport is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...FULL_POLICY, allowTrainingExport: true });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /training/i })).toBeInTheDocument();
    });
  });

  it('shows Training content when Training tab is clicked', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...FULL_POLICY, allowTrainingExport: true });
    const user = userEvent.setup();
    renderComponent();

    const trainingBtn = await screen.findByRole('button', { name: /training/i });
    await user.click(trainingBtn);

    await waitFor(() => {
      expect(
        screen.queryByText('Training Dataset Export') ?? screen.queryByText('Download Dataset')
      ).toBeTruthy();
    });
  });
});
