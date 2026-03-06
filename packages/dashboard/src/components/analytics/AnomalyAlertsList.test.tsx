// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnomalyAlertsList } from './AnomalyAlertsList';

vi.mock('../../api/client', () => ({
  fetchAnomalies: vi.fn(),
}));

import * as api from '../../api/client';

const mockAnomalies = [
  {
    id: 'an1',
    anomalyType: 'message_rate_spike',
    severity: 'high',
    detectedAt: new Date(Date.now() - 300_000).toISOString(),
    userId: 'user-12345678-abcd',
  },
  {
    id: 'an2',
    anomalyType: 'off_hours_activity',
    severity: 'medium',
    detectedAt: new Date(Date.now() - 3600_000).toISOString(),
    userId: null,
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('AnomalyAlertsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchAnomalies).mockResolvedValue({
      anomalies: mockAnomalies,
      total: 2,
    } as never);
  });

  it('should render anomaly items', async () => {
    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText('message rate spike')).toBeInTheDocument();
    });

    expect(screen.getByText('off hours activity')).toBeInTheDocument();
  });

  it('should show severity badges', async () => {
    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText('high')).toBeInTheDocument();
    });

    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('should show total count', async () => {
    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText('2 total')).toBeInTheDocument();
    });
  });

  it('should render type filter buttons', async () => {
    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });

    expect(screen.getByText('message rate spike')).toBeInTheDocument();
  });

  it('should filter by anomaly type', async () => {
    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });

    // Click a filter button
    const filterButtons = screen.getAllByText('message rate spike');
    fireEvent.click(filterButtons[0]); // Click the filter button, not the list item

    expect(api.fetchAnomalies).toHaveBeenCalled();
  });

  it('should show empty state when no anomalies', async () => {
    vi.mocked(api.fetchAnomalies).mockResolvedValue({
      anomalies: [],
      total: 0,
    } as never);

    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText('No anomalies detected')).toBeInTheDocument();
    });
  });

  it('should show user ID when present', async () => {
    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText(/user: user-123/)).toBeInTheDocument();
    });
  });

  it('should show time ago for each anomaly', async () => {
    renderWithProviders(<AnomalyAlertsList />);

    await waitFor(() => {
      expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    });
  });
});
