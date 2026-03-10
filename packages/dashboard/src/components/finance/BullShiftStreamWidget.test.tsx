// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BullShiftStreamWidget } from './BullShiftStreamWidget';

vi.mock('../../api/client', () => ({
  fetchBullshiftPositions: vi.fn(),
  fetchBullshiftHealth: vi.fn(),
}));

import * as api from '../../api/client';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('BullShiftStreamWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.fetchBullshiftHealth).mockResolvedValue({ status: 'unavailable' } as never);
    vi.mocked(api.fetchBullshiftPositions).mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render the widget', () => {
    renderWithProviders(<BullShiftStreamWidget />);
    expect(screen.getByTestId('bullshift-stream-widget')).toBeInTheDocument();
  });

  it('should show LIVE STREAM text when active', () => {
    renderWithProviders(<BullShiftStreamWidget />);
    expect(screen.getByText('LIVE STREAM')).toBeInTheDocument();
  });

  it('should show Live button', () => {
    renderWithProviders(<BullShiftStreamWidget />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should show DEMO badge when BullShift is not connected', async () => {
    renderWithProviders(<BullShiftStreamWidget />);
    await waitFor(() => {
      expect(screen.getByText('DEMO')).toBeInTheDocument();
    });
  });

  it('should show ticker symbols', () => {
    renderWithProviders(<BullShiftStreamWidget />);
    // Should render demo ticker symbols (may appear in both ticker bar and trade stream)
    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MSFT').length).toBeGreaterThan(0);
  });

  it('should show Buy Vol and Sell Vol labels', () => {
    renderWithProviders(<BullShiftStreamWidget />);
    expect(screen.getByText('Buy Vol')).toBeInTheDocument();
    expect(screen.getByText('Sell Vol')).toBeInTheDocument();
    expect(screen.getByText('Spread')).toBeInTheDocument();
  });

  it('should toggle pause/resume when clicking Live button', async () => {
    renderWithProviders(<BullShiftStreamWidget />);
    const liveBtn = screen.getByText('Live');
    fireEvent.click(liveBtn);
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('should resume from paused state', async () => {
    renderWithProviders(<BullShiftStreamWidget />);
    // Pause
    fireEvent.click(screen.getByText('Live'));
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    // Resume
    fireEvent.click(screen.getByText('Resume'));
    expect(screen.getByText('LIVE STREAM')).toBeInTheDocument();
  });

  it('should show event count after trades generate', async () => {
    renderWithProviders(<BullShiftStreamWidget />);
    // The component generates 5 initial trades, so event count should show
    await waitFor(() => {
      expect(screen.getByText(/events/)).toBeInTheDocument();
    });
  });

  it('should show trade entries in the stream', async () => {
    renderWithProviders(<BullShiftStreamWidget />);
    // Should generate initial burst of trades
    await waitFor(() => {
      const buyTexts = screen.queryAllByText('BUY');
      const sellTexts = screen.queryAllByText('SELL');
      expect(buyTexts.length + sellTexts.length).toBeGreaterThan(0);
    });
  });

  it('should use real position data when BullShift is healthy', async () => {
    vi.mocked(api.fetchBullshiftHealth).mockResolvedValue({ status: 'ok' } as never);
    vi.mocked(api.fetchBullshiftPositions).mockResolvedValue([
      {
        symbol: 'AAPL',
        current_price: 180.5,
        avg_entry_price: 170.0,
        qty: 100,
        market_value: 18050,
      },
      {
        symbol: 'GOOGL',
        currentPrice: 165.8,
        avgEntryPrice: 160.0,
        qty: 50,
        marketValue: 8290,
      },
    ] as never);

    renderWithProviders(<BullShiftStreamWidget />);

    await waitFor(() => {
      expect(api.fetchBullshiftHealth).toHaveBeenCalled();
    });
  });
});
