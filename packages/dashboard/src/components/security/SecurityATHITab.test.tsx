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
const _mockCreateScenario = vi.mocked(api.createAthiScenario);
const _mockDeleteScenario = vi.mocked(api.deleteAthiScenario);

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
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
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
          createdAt: Date.now(),
          updatedAt: Date.now(),
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
          createdAt: Date.now(),
          updatedAt: Date.now(),
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

  it('shows delete button on scenarios', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Deletable Scenario',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 3,
          severity: 4,
          riskScore: 12,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Deletable Scenario')).toBeInTheDocument();
    });
  });

  it('shows edit button on scenarios', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Editable Scenario',
          actor: 'insider',
          techniques: ['data_poisoning'],
          harms: ['misinformation'],
          impacts: ['ip_theft'],
          likelihood: 2,
          severity: 2,
          riskScore: 4,
          mitigations: [{ description: 'Monitor logs', status: 'implemented', owner: 'Security' }],
          linkedEventIds: [],
          status: 'mitigated',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Editable Scenario')).toBeInTheDocument();
    });
  });

  it('shows scenario count in header', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Scenario One',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 3,
          severity: 3,
          riskScore: 9,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Threat Scenarios (1)')).toBeInTheDocument();
    });
  });

  it('renders scenario with mitigations', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Mitigated Threat',
          actor: 'hacktivist',
          techniques: ['social_engineering'],
          harms: ['reputational_damage'],
          impacts: ['customer_trust_loss'],
          likelihood: 3,
          severity: 4,
          riskScore: 12,
          mitigations: [
            { description: 'Employee training', status: 'implemented', owner: 'HR' },
            { description: 'Phishing filter', status: 'planned', owner: 'IT' },
          ],
          linkedEventIds: [],
          status: 'assessed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Mitigated Threat')).toBeInTheDocument();
    });
  });

  it('renders actor column in scenario table', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Actor Test',
          actor: 'nation_state',
          techniques: ['model_theft'],
          harms: ['privacy_violation'],
          impacts: ['legal_liability'],
          likelihood: 5,
          severity: 5,
          riskScore: 25,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Nation State')).toBeInTheDocument();
    });
  });

  it('shows multiple scenarios with different risk colors', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'High Risk',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 5,
          severity: 5,
          riskScore: 25,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'athi-2',
          title: 'Low Risk',
          actor: 'insider',
          techniques: ['data_poisoning'],
          harms: ['misinformation'],
          impacts: ['ip_theft'],
          likelihood: 1,
          severity: 2,
          riskScore: 2,
          mitigations: [],
          linkedEventIds: [],
          status: 'mitigated',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 2,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('High Risk')).toBeInTheDocument();
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });
  });

  it('shows Threat Scenarios header with total 0 when empty', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Threat Scenarios (0)')).toBeInTheDocument();
    });
  });

  it('shows risk matrix with multiple cells', async () => {
    mockFetchMatrix.mockResolvedValue({
      matrix: [
        {
          actor: 'cybercriminal',
          technique: 'prompt_injection',
          count: 3,
          avgRiskScore: 18,
          maxRiskScore: 25,
          scenarioIds: ['a', 'b', 'c'],
        },
        {
          actor: 'insider',
          technique: 'data_poisoning',
          count: 1,
          avgRiskScore: 6,
          maxRiskScore: 6,
          scenarioIds: ['d'],
        },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Actor x Technique Risk Matrix')).toBeInTheDocument();
      expect(screen.getByText('18')).toBeInTheDocument();
    });
  });

  it('shows loading state', () => {
    mockFetchScenarios.mockReturnValue(new Promise(() => {}));
    renderTab();
    // Should not crash while loading
    expect(screen.getByTestId('athi-tab')).toBeInTheDocument();
  });

  it('shows byActor stats in summary when available', async () => {
    mockFetchSummary.mockResolvedValue({
      summary: {
        totalScenarios: 10,
        averageRiskScore: 15,
        mitigationCoverage: 80,
        byStatus: { identified: 5, assessed: 3, mitigated: 2 },
        byActor: { cybercriminal: 5, insider: 3, hacktivist: 2 },
        topRisks: [],
      },
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
    });
  });

  it('shows edit button on scenario row and opens edit modal', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Editable Threat',
          description: 'A threat to edit',
          actor: 'insider',
          techniques: ['data_poisoning'],
          harms: ['misinformation'],
          impacts: ['ip_theft'],
          likelihood: 2,
          severity: 3,
          riskScore: 6,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Editable Threat')).toBeInTheDocument();
    });
    const editBtn = screen.getByTitle('Edit');
    fireEvent.click(editBtn);
    await waitFor(() => {
      expect(screen.getByTestId('athi-scenario-modal')).toBeInTheDocument();
    });
  });

  it('shows technique badges on scenario row', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-tech',
          title: 'Multi Technique',
          actor: 'cybercriminal',
          techniques: ['prompt_injection', 'data_poisoning', 'model_theft'],
          harms: ['data_breach'],
          impacts: ['regulatory_penalty'],
          likelihood: 4,
          severity: 4,
          riskScore: 16,
          mitigations: [],
          linkedEventIds: [],
          status: 'assessed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Prompt Injection')).toBeInTheDocument();
      expect(screen.getByText('Data Poisoning')).toBeInTheDocument();
      expect(screen.getByText('Model Theft')).toBeInTheDocument();
    });
  });

  it('renders table headers for scenario list', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-1',
          title: 'Header Test',
          actor: 'cybercriminal',
          techniques: ['prompt_injection'],
          harms: ['data_breach'],
          impacts: [],
          likelihood: 1,
          severity: 1,
          riskScore: 1,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Actor')).toBeInTheDocument();
      expect(screen.getByText('Techniques')).toBeInTheDocument();
      expect(screen.getByText('Score')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Linked')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('shows assessed status formatted correctly', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-assessed',
          title: 'Assessed Threat',
          actor: 'hacktivist',
          techniques: ['social_engineering'],
          harms: ['reputational_damage'],
          impacts: [],
          likelihood: 3,
          severity: 3,
          riskScore: 9,
          mitigations: [],
          linkedEventIds: [],
          status: 'assessed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Assessed')).toBeInTheDocument();
    });
  });

  it('shows Hacktivist actor formatted correctly', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-hack',
          title: 'Hacktivist Scenario',
          actor: 'hacktivist',
          techniques: ['prompt_injection'],
          harms: [],
          impacts: [],
          likelihood: 2,
          severity: 2,
          riskScore: 4,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Hacktivist')).toBeInTheDocument();
    });
  });

  it('shows delete button on scenario row', async () => {
    mockFetchScenarios.mockResolvedValue({
      items: [
        {
          id: 'athi-del',
          title: 'Delete Me',
          actor: 'insider',
          techniques: [],
          harms: [],
          impacts: [],
          likelihood: 1,
          severity: 1,
          riskScore: 1,
          mitigations: [],
          linkedEventIds: [],
          status: 'identified',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      total: 1,
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByTitle('Delete')).toBeInTheDocument();
    });
  });

  it('shows By Status label in summary', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('By Status')).toBeInTheDocument();
    });
  });

  it('shows Total Scenarios label in summary', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Total Scenarios')).toBeInTheDocument();
      expect(screen.getByText('Avg Risk Score')).toBeInTheDocument();
      expect(screen.getByText('Mitigation Coverage')).toBeInTheDocument();
    });
  });
});
