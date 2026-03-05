// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CostDashboard } from './CostDashboard';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual('../../api/client');
  return {
    ...actual,
    fetchAccountCosts: vi.fn(),
    fetchAccountCostTrend: vi.fn(),
    exportAccountCostsCsv: vi.fn(),
  };
});

import { fetchAccountCosts, fetchAccountCostTrend, exportAccountCostsCsv } from '../../api/client';

const mockFetchAccountCosts = vi.mocked(fetchAccountCosts);
const mockFetchAccountCostTrend = vi.mocked(fetchAccountCostTrend);
const _mockExportAccountCostsCsv = vi.mocked(exportAccountCostsCsv);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <CostDashboard />
    </QueryClientProvider>
  );
}

const sampleCosts = [
  {
    accountId: 'acc-1',
    provider: 'anthropic',
    label: 'Claude Key',
    totalCostUsd: 24.5,
    totalInputTokens: 500000,
    totalOutputTokens: 250000,
    totalRequests: 1200,
  },
  {
    accountId: 'acc-2',
    provider: 'openai',
    label: 'GPT Key',
    totalCostUsd: 10.0,
    totalInputTokens: 200000,
    totalOutputTokens: 100000,
    totalRequests: 600,
  },
];

const sampleTrend = [
  { date: '2026-03-01', costUsd: 5.0, requests: 100 },
  { date: '2026-03-02', costUsd: 7.5, requests: 150 },
  { date: '2026-03-03', costUsd: 3.2, requests: 80 },
];

describe('CostDashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state while costs are being fetched', () => {
    // Return a promise that never resolves to keep the loading state
    mockFetchAccountCosts.mockReturnValue(new Promise(() => {}));
    mockFetchAccountCostTrend.mockReturnValue(new Promise(() => {}));

    renderComponent();

    expect(screen.getByText('Loading costs...')).toBeInTheDocument();
  });

  it('renders cost data in a table when costs are loaded', async () => {
    mockFetchAccountCosts.mockResolvedValue(sampleCosts);
    mockFetchAccountCostTrend.mockResolvedValue([]);

    renderComponent();

    // Wait for data to appear — "anthropic" shows in both the overview card
    // (Top Provider) and the table row, so use findAllByText
    const anthropicElements = await screen.findAllByText('anthropic');
    expect(anthropicElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Claude Key')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('GPT Key')).toBeInTheDocument();

    // Check cost values are rendered (formatted as $X.XXXX)
    expect(screen.getByText('$24.5000')).toBeInTheDocument();
    expect(screen.getByText('$10.0000')).toBeInTheDocument();

    // Check table headers
    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Cost (USD)')).toBeInTheDocument();
    expect(screen.getByText('Requests')).toBeInTheDocument();
  });

  it('renders "No cost data" message when costs array is empty', async () => {
    mockFetchAccountCosts.mockResolvedValue([]);
    mockFetchAccountCostTrend.mockResolvedValue([]);

    renderComponent();

    expect(await screen.findByText(/No cost data for this period/)).toBeInTheDocument();
  });

  it('renders overview cards with calculated totals', async () => {
    mockFetchAccountCosts.mockResolvedValue(sampleCosts);
    mockFetchAccountCostTrend.mockResolvedValue([]);

    renderComponent();

    // Wait for data to load
    await screen.findAllByText('anthropic');

    // Total Spend: 24.5 + 10.0 = 34.5
    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getByText('$34.5000')).toBeInTheDocument();

    // Daily Average: 34.5 / 30 = 1.15 (default period is 30d)
    expect(screen.getByText('Daily Average')).toBeInTheDocument();
    expect(screen.getByText('$1.1500')).toBeInTheDocument();

    // Top Provider: anthropic (highest cost) — appears in both overview card and table
    expect(screen.getByText('Top Provider')).toBeInTheDocument();
    const anthropicElements = screen.getAllByText('anthropic');
    expect(anthropicElements.length).toBe(2); // overview card + table row

    // Total Requests: 1200 + 600 = 1800
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    expect(screen.getByText('1,800')).toBeInTheDocument();
  });

  it('period selector changes the active period', async () => {
    const user = userEvent.setup();

    mockFetchAccountCosts.mockResolvedValue(sampleCosts);
    mockFetchAccountCostTrend.mockResolvedValue([]);

    renderComponent();

    // Wait for initial render
    await screen.findAllByText('anthropic');

    // Default period is 30d. Click 7d to change.
    const btn7d = screen.getByText('7d');
    await user.click(btn7d);

    // After switching to 7d, fetchAccountCosts should be called again
    // with a different `from` value. The daily average should recalculate.
    // With 7d period: 34.5 / 7 = 4.9286
    expect(await screen.findByText('$4.9286')).toBeInTheDocument();

    // Switch to 90d
    const btn90d = screen.getByText('90d');
    await user.click(btn90d);

    // With 90d period: 34.5 / 90 = 0.3833
    expect(await screen.findByText('$0.3833')).toBeInTheDocument();
  });

  it('renders trend bars when trend data is available', async () => {
    mockFetchAccountCosts.mockResolvedValue(sampleCosts);
    mockFetchAccountCostTrend.mockResolvedValue(sampleTrend);

    renderComponent();

    // Wait for data
    await screen.findAllByText('anthropic');

    // The TrendBars component shows a heading
    expect(screen.getByText('Daily Cost Trend')).toBeInTheDocument();
  });
});
