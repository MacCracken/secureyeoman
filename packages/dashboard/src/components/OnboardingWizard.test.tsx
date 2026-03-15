// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnboardingWizard } from './OnboardingWizard';

vi.mock('../api/client', () => ({
  completeOnboarding: vi.fn(),
  fetchApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  updateSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

function renderWizard(onComplete = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OnboardingWizard onComplete={onComplete} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchApiKeys).mockResolvedValue({ keys: [] });
  vi.mocked(api.fetchSecurityPolicy).mockResolvedValue({
    allowSubAgents: false,
    allowA2A: false,
    allowSwarms: false,
    allowExtensions: false,
    allowExecution: true,
    allowProactive: false,
    allowWorkflows: false,
    allowCommunityGitFetch: false,
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
    allowTwingate: false,
    allowOrgIntent: false,
    allowIntentEditor: true,
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
  vi.mocked(api.updateSecurityPolicy).mockResolvedValue({} as any);
  vi.mocked(api.createApiKey).mockResolvedValue({
    id: 'k1',
    name: 'test',
    role: 'admin',
    prefix: 'sy_',
    createdAt: new Date().toISOString(),
    rawKey: 'sy_test_secret_key_value',
  });
  vi.mocked(api.completeOnboarding).mockResolvedValue(undefined as any);
});

// Step order: personality → model → security → api-keys → done

/** Navigate to a specific step by index (0-based) */
async function _navigateToStep(stepIndex: number) {
  renderWizard();
  for (let i = 0; i < stepIndex; i++) {
    const skipBtn = screen.queryByRole('button', { name: /skip for now/i });
    if (skipBtn) {
      fireEvent.click(skipBtn);
    } else {
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    }
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`Step ${i + 2} of 5`))).toBeInTheDocument();
    });
  }
}

describe('OnboardingWizard', () => {
  it('renders 5 step progress indicators', () => {
    renderWizard();
    expect(screen.getByText(/Step 1 of 5/)).toBeInTheDocument();
  });

  it('personality step shows agent name input and trait chips', () => {
    renderWizard();
    expect(screen.getByLabelText(/Agent Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^casual$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^formal$/i })).toBeInTheDocument();
    expect(screen.getByText(/Meet your agent/i)).toBeInTheDocument();
  });

  it('Next from personality advances to model step', async () => {
    renderWizard();
    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText(/AI provider & model/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
  });

  it('model step has provider chips, model input, and provider API key input', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByText(/AI provider & model/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /anthropic/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Model name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^API Key$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
  });

  it('model step hides API key input for ollama provider', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByText(/AI provider & model/i)).toBeInTheDocument();
    });
    // Select ollama
    fireEvent.click(screen.getByRole('button', { name: /ollama/i }));
    expect(screen.queryByLabelText(/^API Key$/i)).not.toBeInTheDocument();
  });

  it('Skip from model advances to security step', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => {
      expect(screen.getByText(/Security policy/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Step 3 of 5/)).toBeInTheDocument();
  });

  it('security step shows 5 policy toggles', async () => {
    renderWizard();
    // personality → model (skip) → security
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => {
      expect(screen.getByText(/Security policy/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Code Editor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Advanced Editor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Intent Document Editor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/File System Access/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Network Access/i)).toBeInTheDocument();
  });

  it('Skip on security advances to api-keys step without calling updateSecurityPolicy', async () => {
    renderWizard();
    // personality → model (skip) → security
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByText(/Security policy/i));
    // skip security
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Dashboard API key/i })).toBeInTheDocument();
    });
    expect(api.updateSecurityPolicy).not.toHaveBeenCalled();
  });

  it('toggling a policy then clicking Next calls updateSecurityPolicy', async () => {
    renderWizard();
    // personality → model (skip) → security
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByText(/Security policy/i));

    // toggle Advanced Editor
    const advancedToggle = screen.getByLabelText(/Advanced Editor/i);
    fireEvent.click(advancedToggle);

    // click Next
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(api.updateSecurityPolicy).toHaveBeenCalled();
    });
  });

  it('api-keys step has Create API Key form and Skip for now button', async () => {
    renderWizard();
    // personality → model (skip) → security (skip) → api-keys
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByText(/Security policy/i));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => {
      expect(screen.getByText(/Create API Key/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
    expect(screen.getByText(/Step 4 of 5/)).toBeInTheDocument();
  });

  it('successful api key create shows copy banner', async () => {
    renderWizard();
    // navigate to api-keys step
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByText(/Security policy/i));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Key name/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Key name/i), { target: { value: 'My key' } });
    fireEvent.click(screen.getByRole('button', { name: /create key/i }));
    await waitFor(() => {
      expect(screen.getByText(/copy it now/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/sy_test_secret_key_value/)).toBeInTheDocument();
  });

  it('Next from api-keys advances to done step', async () => {
    renderWizard();
    // personality → model (skip) → security (skip) → api-keys
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByText(/Security policy/i));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByRole('heading', { name: /Dashboard API key/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByText(/You're all set/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Step 5 of 5/)).toBeInTheDocument();
  });

  it('done step Launch button calls completeOnboarding', async () => {
    const onComplete = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OnboardingWizard onComplete={onComplete} />
      </QueryClientProvider>
    );
    // navigate to done
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByRole('button', { name: /skip for now/i }));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByText(/Security policy/i));
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => screen.getByRole('heading', { name: /Dashboard API key/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByText(/Launch SecureYeoman/i));

    fireEvent.click(screen.getByRole('button', { name: /Launch SecureYeoman/i }));
    await waitFor(() => {
      expect(api.completeOnboarding).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
