// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RiskTrendChart } from './RiskTrendChart';

vi.mock('../../api/client', () => ({
  fetchRiskTrend: vi.fn(),
}));

// Mock recharts to avoid canvas issues in jsdom
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="chart-line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

import * as api from '../../api/client';

const mockTrendData = {
  points: [
    { date: '2026-01-01', overallScore: 75, openRisks: 5, overdueRisks: 1 },
    { date: '2026-02-01', overallScore: 68, openRisks: 4, overdueRisks: 0 },
    { date: '2026-03-01', overallScore: 62, openRisks: 3, overdueRisks: 0 },
  ],
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RiskTrendChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchRiskTrend).mockResolvedValue(mockTrendData as never);
  });

  it('should render chart container', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByTestId('risk-trend-chart')).toBeInTheDocument();
    });
  });

  it('should render the title', () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    expect(screen.getByText('Risk Score Trend')).toBeInTheDocument();
  });

  it('should show time range buttons', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByText('30d')).toBeInTheDocument();
    });
    expect(screen.getByText('90d')).toBeInTheDocument();
    expect(screen.getByText('180d')).toBeInTheDocument();
    expect(screen.getByText('365d')).toBeInTheDocument();
  });

  it('should show loading state while fetching', () => {
    vi.mocked(api.fetchRiskTrend).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    expect(screen.getByText('Loading trend data...')).toBeInTheDocument();
  });

  it('should show empty state when no data', async () => {
    vi.mocked(api.fetchRiskTrend).mockResolvedValue({ points: [] } as never);
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByText('No trend data available for this time range.')).toBeInTheDocument();
    });
  });

  it('should render chart when data is available', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('should switch time range on click', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('90d'));
    await waitFor(() => {
      expect(api.fetchRiskTrend).toHaveBeenCalledWith('d1', 90);
    });
  });

  it('should switch to 180d range', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    fireEvent.click(screen.getByText('180d'));
    await waitFor(() => {
      expect(api.fetchRiskTrend).toHaveBeenCalledWith('d1', 180);
    });
  });

  it('should switch to 365d range', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    fireEvent.click(screen.getByText('365d'));
    await waitFor(() => {
      expect(api.fetchRiskTrend).toHaveBeenCalledWith('d1', 365);
    });
  });

  it('should show error message when query fails', async () => {
    vi.mocked(api.fetchRiskTrend).mockRejectedValue(new Error('Network error'));
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load trend data/)).toBeInTheDocument();
    });
  });

  it('should fetch risk trend data with default 30 days', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(api.fetchRiskTrend).toHaveBeenCalledWith('d1', 30);
    });
  });

  it('should render with compare departments', async () => {
    const compData = {
      points: [
        { date: '2026-01-01', overallScore: 80, openRisks: 3, overdueRisks: 0 },
        { date: '2026-02-01', overallScore: 77, openRisks: 2, overdueRisks: 1 },
      ],
    };
    vi.mocked(api.fetchRiskTrend).mockImplementation((deptId: string) => {
      if (deptId === 'd1') return Promise.resolve(mockTrendData as never);
      return Promise.resolve(compData as never);
    });

    renderWithProviders(
      <RiskTrendChart
        departmentId="d1"
        compareDepartments={[
          { id: 'd2', name: 'Engineering' },
          { id: 'd3', name: 'Finance' },
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
    // With comparisons, legend should show
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('should cap compareDepartments at 5', async () => {
    const depts = Array.from({ length: 7 }, (_, i) => ({
      id: `dept-${i + 2}`,
      name: `Dept ${i + 2}`,
    }));

    renderWithProviders(<RiskTrendChart departmentId="d1" compareDepartments={depts} />);
    await waitFor(() => {
      // primary + 5 capped comparisons = 6 calls
      expect(api.fetchRiskTrend).toHaveBeenCalledTimes(6);
    });
  });

  it('should not show legend for single department', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('should not fetch when departmentId is empty', () => {
    renderWithProviders(<RiskTrendChart departmentId="" />);
    expect(api.fetchRiskTrend).not.toHaveBeenCalled();
  });

  it('should handle comparison with empty points gracefully', async () => {
    vi.mocked(api.fetchRiskTrend).mockImplementation((deptId: string) => {
      if (deptId === 'd1') return Promise.resolve(mockTrendData as never);
      return Promise.resolve({ points: [] } as never);
    });

    renderWithProviders(
      <RiskTrendChart departmentId="d1" compareDepartments={[{ id: 'd2', name: 'Empty Dept' }]} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
    // Empty comparison data should be filtered out; no legend needed
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('should show error message text from error object', async () => {
    vi.mocked(api.fetchRiskTrend).mockRejectedValue(new Error('Server down'));
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    await waitFor(() => {
      expect(screen.getByText(/Server down/)).toBeInTheDocument();
    });
  });

  it('defaults to 30d active style', () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);
    const btn30 = screen.getByText('30d');
    expect(btn30.className).toContain('font-medium');
  });
});
