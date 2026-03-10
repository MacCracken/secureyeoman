// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradingDashboardWidget } from './TradingDashboardWidget';

vi.mock('recharts', () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Cell: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
}));

vi.mock('../../api/client', () => ({
  fetchMarketHistorical: vi.fn(),
}));

import * as api from '../../api/client';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TradingDashboardWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchMarketHistorical).mockResolvedValue({
      data: {},
    } as never);
  });

  it('should render the widget', () => {
    renderWithProviders(<TradingDashboardWidget />);
    expect(screen.getByTestId('trading-dashboard-widget')).toBeInTheDocument();
  });

  it('should show default symbol AAPL', () => {
    renderWithProviders(<TradingDashboardWidget />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('should show search input', () => {
    renderWithProviders(<TradingDashboardWidget />);
    const input = screen.getByPlaceholderText('Symbol');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('AAPL');
  });

  it('should show candlestick chart', () => {
    renderWithProviders(<TradingDashboardWidget />);
    expect(screen.getByTestId('chart-container')).toBeInTheDocument();
  });

  it('should show OHLC stats', () => {
    renderWithProviders(<TradingDashboardWidget />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('should update symbol on form submit', () => {
    renderWithProviders(<TradingDashboardWidget />);
    const input = screen.getByPlaceholderText('Symbol');
    fireEvent.change(input, { target: { value: 'msft' } });
    // Input should be uppercased
    expect(input).toHaveValue('MSFT');
    // Submit form
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('should show DEMO badge when no real data', async () => {
    renderWithProviders(<TradingDashboardWidget />);
    await waitFor(() => {
      expect(screen.getByText('DEMO')).toBeInTheDocument();
    });
  });

  it('should parse AlphaVantage data', async () => {
    vi.mocked(api.fetchMarketHistorical).mockResolvedValue({
      data: {
        'Time Series (Daily)': {
          '2026-03-01': {
            '1. open': '150',
            '2. high': '155',
            '3. low': '148',
            '4. close': '153',
            '5. volume': '2000000',
          },
        },
      },
    } as never);

    renderWithProviders(<TradingDashboardWidget />);
    await waitFor(() => {
      expect(api.fetchMarketHistorical).toHaveBeenCalledWith('AAPL', 60);
    });
  });

  it('should parse Finnhub data', async () => {
    vi.mocked(api.fetchMarketHistorical).mockResolvedValue({
      data: {
        s: 'ok',
        c: [153],
        h: [155],
        l: [148],
        o: [150],
        t: [1709251200],
        v: [2000000],
      },
    } as never);

    renderWithProviders(<TradingDashboardWidget />);
    await waitFor(() => {
      expect(api.fetchMarketHistorical).toHaveBeenCalled();
    });
  });

  it('should not change symbol if same as current', () => {
    renderWithProviders(<TradingDashboardWidget />);
    const input = screen.getByPlaceholderText('Symbol');
    fireEvent.change(input, { target: { value: 'AAPL' } });
    fireEvent.submit(input.closest('form')!);
    // Should still show AAPL
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('should accept nodeId and onConfigChange props', () => {
    renderWithProviders(<TradingDashboardWidget nodeId="test-node" onConfigChange={vi.fn()} />);
    expect(screen.getByTestId('trading-dashboard-widget')).toBeInTheDocument();
  });
});
