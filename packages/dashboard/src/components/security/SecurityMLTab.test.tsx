// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MLSecurityTab } from './SecurityMLTab';

vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchMlSummary: vi.fn(),
    fetchSecurityEvents: vi.fn(),
  };
});

import * as api from '../../api/client';

const mockFetchMlSummary = vi.mocked(api.fetchMlSummary);
const mockFetchSecurityEvents = vi.mocked(api.fetchSecurityEvents);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MLSecurityTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const defaultSummary = {
  enabled: true,
  riskScore: 42,
  riskLevel: 'medium' as const,
  detections: {
    anomaly: 5,
    injectionAttempt: 3,
    sandboxViolation: 1,
    secretAccess: 2,
    total: 11,
  },
  trend: [],
};

describe('MLSecurityTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMlSummary.mockResolvedValue(defaultSummary as any);
    mockFetchSecurityEvents.mockResolvedValue({ events: [], total: 0 } as any);
  });

  it('renders header', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/ML.*Anomaly Detection/)).toBeInTheDocument();
    });
  });

  it('renders period selector buttons', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('24h')).toBeInTheDocument();
      expect(screen.getByText('7d')).toBeInTheDocument();
      expect(screen.getByText('30d')).toBeInTheDocument();
    });
  });

  it('shows active status when enabled', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('ML anomaly detection is active.')).toBeInTheDocument();
    });
  });

  it('shows disabled warning when not enabled', async () => {
    mockFetchMlSummary.mockResolvedValue({ ...defaultSummary, enabled: false } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/ML anomaly detection is disabled/)).toBeInTheDocument();
    });
  });

  it('renders risk score and level', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Risk Score')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
    });
  });

  it('renders detection stat cards', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Anomalies')).toBeInTheDocument();
      expect(screen.getByText('Injections')).toBeInTheDocument();
      expect(screen.getByText('Sandbox Violations')).toBeInTheDocument();
      expect(screen.getByText('Credential Scans')).toBeInTheDocument();
    });
  });

  it('renders detection activity chart section', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Detection Activity')).toBeInTheDocument();
    });
  });

  it('shows no detection events message when trend is empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No detection events in this period.')).toBeInTheDocument();
    });
  });

  it('renders ML Event Feed section', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('ML Event Feed')).toBeInTheDocument();
    });
  });

  it('shows empty events message', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/No ML events found/)).toBeInTheDocument();
    });
  });

  it('renders events when present', async () => {
    mockFetchSecurityEvents.mockResolvedValue({
      events: [
        {
          id: 'e1',
          type: 'anomaly',
          severity: 'warn',
          message: 'Unusual access pattern detected',
          timestamp: Date.now(),
          userId: 'user1',
          ipAddress: '10.0.0.1',
        },
      ],
      total: 1,
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Unusual access pattern detected')).toBeInTheDocument();
      expect(screen.getByText('anomaly')).toBeInTheDocument();
    });
  });

  it('renders type filter dropdown', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All ML Types')).toBeInTheDocument();
    });
  });
});
