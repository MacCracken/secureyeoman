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
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
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
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
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
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
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
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
    });

    renderComponent();

    await waitFor(() => {
      expect(
        screen.getByText(/must be explicitly enabled after initialization/)
      ).toBeInTheDocument();
    });
  });
});
