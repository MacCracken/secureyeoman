// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ResponsibleAiPage from './ResponsibleAiPage';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <ResponsibleAiPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ResponsibleAiPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('renders the page title', () => {
    renderComponent();
    expect(screen.getByText('Responsible AI')).toBeInTheDocument();
  });

  it('renders the Cohort Error Analysis section', () => {
    renderComponent();
    expect(screen.getByText('Cohort Error Analysis')).toBeInTheDocument();
  });

  it('renders the Fairness Metrics section', () => {
    renderComponent();
    expect(screen.getByText('Fairness Metrics')).toBeInTheDocument();
  });

  it('renders the SHAP Explainability section', () => {
    renderComponent();
    expect(screen.getByText('SHAP Explainability')).toBeInTheDocument();
  });

  it('renders the Data Provenance section', () => {
    renderComponent();
    expect(screen.getByText('Data Provenance')).toBeInTheDocument();
  });

  it('renders the Model Cards section', () => {
    renderComponent();
    expect(screen.getByText('Model Cards')).toBeInTheDocument();
  });

  it('renders all five sections simultaneously', () => {
    renderComponent();
    const headings = [
      'Cohort Error Analysis',
      'Fairness Metrics',
      'SHAP Explainability',
      'Data Provenance',
      'Model Cards',
    ];
    for (const heading of headings) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
  });

  it('renders the page description', () => {
    renderComponent();
    expect(
      screen.getByText(/Bias detection, fairness analysis/),
    ).toBeInTheDocument();
  });

  // ── Cohort Error Analysis interactions ───────────────────────────

  it('shows Analyze button in Cohort Error Analysis', () => {
    renderComponent();
    expect(screen.getByText('Analyze')).toBeInTheDocument();
  });

  it('shows Eval Run ID input for Cohort Analysis', () => {
    renderComponent();
    expect(screen.getAllByPlaceholderText('Eval Run ID').length).toBeGreaterThanOrEqual(1);
  });

  it('fetches cohort data after clicking Analyze', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ slices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderComponent();

    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    await user.type(inputs[0], 'run-123');
    await user.click(screen.getByText('Analyze'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/cohort-analysis'),
        expect.anything(),
      );
    });

    mockFetch.mockRestore();
  });

  // ── Fairness Metrics interactions ────────────────────────────────

  it('shows Evaluate button in Fairness Metrics', () => {
    renderComponent();
    expect(screen.getByText('Evaluate')).toBeInTheDocument();
  });

  it('fetches fairness data after clicking Evaluate', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          disparateImpactRatio: 0.95,
          groups: [],
          pass: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();

    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    // Second Eval Run ID input is for Fairness
    await user.type(inputs[1], 'run-456');
    await user.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/fairness'),
        expect.anything(),
      );
    });

    mockFetch.mockRestore();
  });

  // ── SHAP Explainability interactions ─────────────────────────────

  it('shows Explain button in SHAP section', () => {
    renderComponent();
    expect(screen.getByText('Explain')).toBeInTheDocument();
  });

  it('shows Explanation ID input for SHAP', () => {
    renderComponent();
    expect(screen.getByPlaceholderText('Explanation ID')).toBeInTheDocument();
  });

  // ── Data Provenance interactions ─────────────────────────────────

  it('shows Dataset ID input and Load button for Data Provenance', () => {
    renderComponent();
    expect(screen.getByPlaceholderText('Dataset ID')).toBeInTheDocument();
    expect(screen.getAllByText('Load').length).toBeGreaterThanOrEqual(1);
  });

  // ── Model Cards interactions ─────────────────────────────────────

  it('shows Model Card ID input and Load button', () => {
    renderComponent();
    expect(screen.getByPlaceholderText('Model Card ID')).toBeInTheDocument();
  });

  // ── Cohort Error Analysis data rendering ───────────────────────

  it('renders cohort table with slices', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          slices: [
            {
              dimension: 'region',
              value: 'US',
              sampleCount: 200,
              errorCount: 40,
              errorRate: 0.2,
              avgScore: 0.85,
            },
            {
              dimension: 'region',
              value: 'EU',
              sampleCount: 100,
              errorCount: 5,
              errorRate: 0.05,
              avgScore: 0.95,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();
    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    await user.type(inputs[0], 'run-789');
    await user.click(screen.getByText('Analyze'));

    expect(await screen.findByText('US')).toBeInTheDocument();
    expect(screen.getByText('EU')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText('5.0%')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('shows empty cohort message when no slices', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ slices: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();
    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    await user.type(inputs[0], 'run-empty');
    await user.click(screen.getByText('Analyze'));
    expect(await screen.findByText('No cohort slices found for this eval run.')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('shows cohort loading state', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

    renderComponent();
    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    await user.type(inputs[0], 'run-loading');
    await user.click(screen.getByText('Analyze'));
    expect(await screen.findByText('Loading cohort analysis...')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('shows cohort error state', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    renderComponent();
    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    await user.type(inputs[0], 'run-err');
    await user.click(screen.getByText('Analyze'));
    expect(await screen.findByText(/Error:/)).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  // ── SHAP Explainability data rendering ─────────────────────────

  it('renders SHAP token heatmap', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'shap-1',
          tokens: [
            { token: 'Hello', attribution: 0.5 },
            { token: 'world', attribution: -0.3 },
            { token: 'test', attribution: 0 },
          ],
          inputText: 'Hello world test',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();
    await user.type(screen.getByPlaceholderText('Explanation ID'), 'shap-1');
    await user.click(screen.getByText('Explain'));

    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
    // Legend should be rendered
    expect(screen.getByText('High positive')).toBeInTheDocument();
    expect(screen.getByText('High negative')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('shows SHAP loading state', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

    renderComponent();
    await user.type(screen.getByPlaceholderText('Explanation ID'), 'shap-loading');
    await user.click(screen.getByText('Explain'));
    expect(await screen.findByText('Loading SHAP explanation...')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  // ── Data Provenance rendering ──────────────────────────────────

  it('renders provenance summary cards and entries', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          included: 500,
          filtered: 20,
          synthetic: 10,
          redacted: 5,
          entries: [
            { id: 'e1', userId: 'alice', conversationId: 'conv-1', status: 'included' },
            { id: 'e2', userId: 'bob', conversationId: 'conv-2', status: 'redacted' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();
    await user.type(screen.getByPlaceholderText('Dataset ID'), 'ds-1');
    const loadButtons = screen.getAllByText('Load');
    await user.click(loadButtons[0]);

    expect(await screen.findByText('500')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    // GDPR Redact button should be present for non-redacted entries
    expect(screen.getByText('GDPR Redact')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('shows provenance search filter', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          included: 100,
          filtered: 0,
          synthetic: 0,
          redacted: 0,
          entries: [
            { id: 'e1', userId: 'alice', conversationId: 'conv-1', status: 'included' },
            { id: 'e2', userId: 'bob', conversationId: 'conv-2', status: 'included' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();
    await user.type(screen.getByPlaceholderText('Dataset ID'), 'ds-filter');
    const loadButtons = screen.getAllByText('Load');
    await user.click(loadButtons[0]);
    await screen.findByText('alice');

    // Type in the search field to filter
    const searchInput = screen.getByPlaceholderText('Search by user or conversation ID...');
    await user.type(searchInput, 'alice');

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.queryByText('bob')).not.toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  // ── Model Cards rendering ─────────────────────────────────────

  it('renders model card details', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'mc-1',
          name: 'Test Model',
          version: '2.0',
          description: 'A test model',
          intendedUse: 'Testing',
          limitations: 'None',
          ethicalConsiderations: 'Fair',
          trainingData: 'Public',
          metrics: { accuracy: 0.95, f1: 0.92 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();
    await user.type(screen.getByPlaceholderText('Model Card ID'), 'mc-1');
    const loadButtons = screen.getAllByText('Load');
    await user.click(loadButtons[1]);

    expect(await screen.findByText('Test Model')).toBeInTheDocument();
    expect(screen.getByText('Version 2.0')).toBeInTheDocument();
    expect(screen.getByText('A test model')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getByText('View Markdown')).toBeInTheDocument();
    expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    expect(screen.getByText('accuracy')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('displays fairness FAIL badge when threshold not met', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          disparateImpactRatio: 0.5,
          groups: [],
          pass: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();
    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    await user.type(inputs[1], 'run-fail');
    await user.click(screen.getByText('Evaluate'));

    expect(await screen.findByText('FAIL')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('displays fairness PASS badge when data is returned', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          disparateImpactRatio: 0.95,
          groups: [{ name: 'Group A', positiveRate: 0.8, sampleCount: 100 }],
          pass: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderComponent();

    const inputs = screen.getAllByPlaceholderText('Eval Run ID');
    await user.type(inputs[1], 'run-fair');
    await user.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(screen.getByText('PASS')).toBeInTheDocument();
    });
    expect(screen.getByText('0.950')).toBeInTheDocument();
    expect(screen.getByText('Group A')).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
