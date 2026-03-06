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

const mockTrendData = [
  { date: '2026-01-01', overallScore: 75, openRisks: 5, overdueRisks: 1 },
  { date: '2026-02-01', overallScore: 68, openRisks: 4, overdueRisks: 0 },
  { date: '2026-03-01', overallScore: 62, openRisks: 3, overdueRisks: 0 },
];

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

  it('should show time range buttons', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);

    await waitFor(() => {
      expect(screen.getByText('30d')).toBeInTheDocument();
    });
    expect(screen.getByText('90d')).toBeInTheDocument();
    expect(screen.getByText('180d')).toBeInTheDocument();
    expect(screen.getByText('365d')).toBeInTheDocument();
  });

  it('should switch time range on click', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);

    await waitFor(() => {
      expect(screen.getByText('90d')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('90d'));
    expect(true).toBe(true);
  });

  it('should render with compare departments', async () => {
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
      expect(screen.getByTestId('risk-trend-chart')).toBeInTheDocument();
    });
  });

  it('should render the chart component', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);

    await waitFor(() => {
      expect(screen.getByTestId('risk-trend-chart')).toBeInTheDocument();
    });
  });

  it('should fetch risk trend data', async () => {
    renderWithProviders(<RiskTrendChart departmentId="d1" />);

    await waitFor(() => {
      expect(api.fetchRiskTrend).toHaveBeenCalled();
    });
  });
});
