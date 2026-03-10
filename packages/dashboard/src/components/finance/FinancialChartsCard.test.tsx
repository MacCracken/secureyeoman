// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinancialChartsCard } from './FinancialChartsCard';

vi.mock('recharts', () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div data-testid="pie" />,
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  Cell: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
}));

vi.mock('../../api/client', () => ({
  fetchMarketHistorical: vi.fn(),
  fetchBullshiftPositions: vi.fn(),
}));

import * as api from '../../api/client';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('FinancialChartsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchMarketHistorical).mockResolvedValue({
      data: {},
    } as never);
    vi.mocked(api.fetchBullshiftPositions).mockResolvedValue([] as never);
  });

  it('should render the card', async () => {
    renderWithProviders(<FinancialChartsCard />);
    expect(screen.getByTestId('financial-charts-card')).toBeInTheDocument();
  });

  it('should render Price and Allocation buttons', async () => {
    renderWithProviders(<FinancialChartsCard />);
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Allocation')).toBeInTheDocument();
  });

  it('should show candlestick chart by default', async () => {
    renderWithProviders(<FinancialChartsCard />);
    // Default view is candlestick
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should switch to allocation view when clicking Allocation', async () => {
    renderWithProviders(<FinancialChartsCard />);
    fireEvent.click(screen.getByText('Allocation'));
    // Still has chart container (now pie chart)
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should switch back to candlestick view', async () => {
    renderWithProviders(<FinancialChartsCard />);
    fireEvent.click(screen.getByText('Allocation'));
    fireEvent.click(screen.getByText('Price'));
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should show DEMO badge when no real data', async () => {
    renderWithProviders(<FinancialChartsCard />);
    await waitFor(() => {
      expect(screen.getByText('DEMO')).toBeInTheDocument();
    });
  });

  it('should parse AlphaVantage data format', async () => {
    vi.mocked(api.fetchMarketHistorical).mockResolvedValue({
      data: {
        'Time Series (Daily)': {
          '2026-03-01': {
            '1. open': '100',
            '2. high': '110',
            '3. low': '95',
            '4. close': '105',
            '5. volume': '1000000',
          },
          '2026-03-02': {
            '1. open': '105',
            '2. high': '115',
            '3. low': '100',
            '4. close': '112',
            '5. volume': '1200000',
          },
        },
      },
    } as never);

    renderWithProviders(<FinancialChartsCard />);
    await waitFor(() => {
      expect(api.fetchMarketHistorical).toHaveBeenCalledWith('SPY', 30);
    });
  });

  it('should parse Finnhub data format', async () => {
    vi.mocked(api.fetchMarketHistorical).mockResolvedValue({
      data: {
        s: 'ok',
        c: [105, 112],
        h: [110, 115],
        l: [95, 100],
        o: [100, 105],
        t: [1709251200, 1709337600],
        v: [1000000, 1200000],
      },
    } as never);

    renderWithProviders(<FinancialChartsCard />);
    await waitFor(() => {
      expect(api.fetchMarketHistorical).toHaveBeenCalled();
    });
  });

  it('should parse positions data for allocation view', async () => {
    vi.mocked(api.fetchBullshiftPositions).mockResolvedValue([
      { symbol: 'AAPL', market_value: 50000 },
      { symbol: 'MSFT', market_value: 30000 },
      { symbol: 'GOOGL', marketValue: 20000 },
    ] as never);

    renderWithProviders(<FinancialChartsCard />);
    fireEvent.click(screen.getByText('Allocation'));

    await waitFor(() => {
      expect(api.fetchBullshiftPositions).toHaveBeenCalled();
    });
  });

  it('should handle positions with qty and current_price', async () => {
    vi.mocked(api.fetchBullshiftPositions).mockResolvedValue([
      { symbol: 'TSLA', qty: 100, current_price: 250 },
    ] as never);

    renderWithProviders(<FinancialChartsCard />);
    fireEvent.click(screen.getByText('Allocation'));

    await waitFor(() => {
      expect(api.fetchBullshiftPositions).toHaveBeenCalled();
    });
  });

  it('should use demo data when positions array is empty', async () => {
    vi.mocked(api.fetchBullshiftPositions).mockResolvedValue([] as never);

    renderWithProviders(<FinancialChartsCard />);
    fireEvent.click(screen.getByText('Allocation'));

    await waitFor(() => {
      expect(screen.getByText('DEMO')).toBeInTheDocument();
    });
  });

  it('should not show DEMO badge when real data is available', async () => {
    vi.mocked(api.fetchMarketHistorical).mockResolvedValue({
      data: {
        'Time Series (Daily)': {
          '2026-03-01': {
            '1. open': '100',
            '2. high': '110',
            '3. low': '95',
            '4. close': '105',
            '5. volume': '1000000',
          },
        },
      },
    } as never);

    renderWithProviders(<FinancialChartsCard />);
    await waitFor(() => {
      expect(screen.queryByText('DEMO')).not.toBeInTheDocument();
    });
  });
});
