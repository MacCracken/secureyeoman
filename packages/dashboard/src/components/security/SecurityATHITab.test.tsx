// @vitest-environment jsdom
/**
 * SecurityATHITab Tests — Phase 107-F
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ATHITab } from './SecurityATHITab';

vi.mock('../../api/client', () => ({
  fetchAthiScenarios: vi.fn(),
  createAthiScenario: vi.fn(),
  updateAthiScenario: vi.fn(),
  deleteAthiScenario: vi.fn(),
  fetchAthiMatrix: vi.fn(),
  fetchAthiTopRisks: vi.fn(),
  fetchAthiSummary: vi.fn(),
  linkEventsToAthiScenario: vi.fn(),
  fetchAthiScenariosByTechnique: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchScenarios = vi.mocked(api.fetchAthiScenarios);
const mockFetchMatrix = vi.mocked(api.fetchAthiMatrix);
const mockFetchSummary = vi.mocked(api.fetchAthiSummary);
const mockCreateScenario = vi.mocked(api.createAthiScenario);
const mockDeleteScenario = vi.mocked(api.deleteAthiScenario);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderTab() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ATHITab />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchScenarios.mockResolvedValue({ items: [], total: 0 });
  mockFetchMatrix.mockResolvedValue({ matrix: [] });
  mockFetchSummary.mockResolvedValue({
    summary: {
      totalScenarios: 5,
      averageRiskScore: 12,
      mitigationCoverage: 60,
      byStatus: { identified: 3, mitigated: 2 },
      byActor: { cybercriminal: 3, insider: 2 },
      topRisks: [],
    },
  });
});

describe('SecurityATHITab', () => {
  it('renders the ATHI tab', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('athi-tab')).toBeInTheDocument();
    });
  });

  it('shows summary strip with stats', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  it('shows empty state when no scenarios', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/No threat scenarios found/)).toBeInTheDocument();
    });
  });

  it('renders scenarios in table', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Prompt Injection via API',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 4,
          severity: 5,
          riskScore: 20,
          mitigations: [],
          status: 'identified',
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Prompt Injection via API')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
    });
  });

  it('opens create modal when clicking New Scenario', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('New Scenario')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Scenario'));

    await waitFor(() => {
      expect(screen.getByTestId('athi-scenario-modal')).toBeInTheDocument();
      expect(screen.getByText('Create Threat Scenario')).toBeInTheDocument();
    });
  });

  it('renders risk matrix when data available', async () => {
    mockFetchMatrix.mockResolvedValue({
      matrix: [
        {
          actor: 'cybercriminal',
          technique: 'prompt_injection',
          count: 2,
          avgRiskScore: 15,
          maxRiskScore: 20,
          scenarioIds: ['a', 'b'],
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Actor x Technique Risk Matrix')).toBeInTheDocument();
    });
  });

  it('filters by actor', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('New Scenario')).toBeInTheDocument();
    });

    // The actor filter dropdown
    const selects = screen.getAllByRole('combobox');
    const actorSelect = selects[0];
    fireEvent.change(actorSelect, { target: { value: 'insider' } });

    await waitFor(() => {
      expect(mockFetchScenarios).toHaveBeenCalledWith(
        expect.objectContaining({ actor: 'insider' })
      );
    });
  });

  it('filters by status', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('New Scenario')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[1];
    fireEvent.change(statusSelect, { target: { value: 'mitigated' } });

    await waitFor(() => {
      expect(mockFetchScenarios).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'mitigated' })
      );
    });
  });

  it('shows status badge colors', async () => {
    mockFetchSummary.mockResolvedValue({
      summary: {
        totalScenarios: 2,
        averageRiskScore: 10,
        mitigationCoverage: 50,
        byStatus: { identified: 1, mitigated: 1 },
        byActor: {},
        topRisks: [],
      },
    });

    renderTab();

    await waitFor(() => {
      const identified = screen.getByText(/Identified: 1/);
      expect(identified).toBeInTheDocument();
    });
  });

  it('shows linked events badge when scenario has linkedEventIds', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Linked Scenario',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 4,
          severity: 5,
          riskScore: 20,
          mitigations: [],
          linkedEventIds: ['evt-1', 'evt-2'],
          status: 'identified',
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      const badge = screen.getByTestId('linked-events-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain('2');
    });
  });

  it('shows dash when scenario has no linked events', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-2',
          title: 'Unlinked Scenario',
          actor: 'insider',
          techniques: ['data_poisoning'],
          harms: ['misinformation'],
          impacts: ['ip_theft'],
          likelihood: 2,
          severity: 3,
          riskScore: 6,
          mitigations: [],
          linkedEventIds: [],
          status: 'assessed',
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Unlinked Scenario')).toBeInTheDocument();
      expect(screen.queryByTestId('linked-events-badge')).not.toBeInTheDocument();
    });
  });
});
