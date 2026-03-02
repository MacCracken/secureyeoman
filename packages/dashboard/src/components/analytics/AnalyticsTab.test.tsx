/**
 * AnalyticsTab.test.tsx — Unit tests for the Analytics tab (Phase 96).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../api/client', () => ({
  getAccessToken: vi.fn(() => null),
  fetchPersonalities: vi.fn().mockResolvedValue([
    { id: 'p1', name: 'Test Bot', isActive: true, isDefault: true },
  ]),
  fetchSentimentTrend: vi.fn().mockResolvedValue([
    { date: '2026-01-01', positive: 5, neutral: 3, negative: 2, avgScore: 0.65 },
  ]),
  fetchEngagementMetrics: vi.fn().mockResolvedValue({
    personalityId: 'p1',
    periodDays: 30,
    avgConversationLength: 8.5,
    followUpRate: 0.6,
    abandonmentRate: 0.15,
    toolCallSuccessRate: 0.9,
    totalConversations: 100,
  }),
  fetchKeyPhrases: vi.fn().mockResolvedValue([
    { id: 'kp1', personalityId: 'p1', phrase: 'machine learning', frequency: 12, windowStart: '2026-01-01', windowEnd: '2026-01-31', updatedAt: '2026-01-15' },
  ]),
  fetchTopEntities: vi.fn().mockResolvedValue([
    { entityType: 'technology', entityValue: 'React', totalMentions: 10, conversationCount: 3 },
  ]),
  searchEntities: vi.fn().mockResolvedValue([]),
  fetchAnomalies: vi.fn().mockResolvedValue({ anomalies: [], total: 0 }),
}));

// Mock recharts to avoid rendering issues in test env
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      {ui}
    </QueryClientProvider>
  );
}

// Dynamic import for lazy component
let AnalyticsTab: any;
beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('./AnalyticsTab');
  AnalyticsTab = mod.default;
});

describe('AnalyticsTab', () => {
  it('renders the analytics tab with sub-tabs', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByTestId('analytics-tab')).toBeInTheDocument();
    });
    expect(screen.getByText('Sentiment')).toBeInTheDocument();
    expect(screen.getByText('Engagement')).toBeInTheDocument();
    expect(screen.getByText('Topics')).toBeInTheDocument();
    expect(screen.getByText('Entities')).toBeInTheDocument();
    expect(screen.getByText('Anomalies')).toBeInTheDocument();
  });

  it('shows sentiment trend chart by default', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Sentiment Trend')).toBeInTheDocument();
    });
  });

  it('switches to engagement tab', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Engagement')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Engagement'));
    await waitFor(() => {
      expect(screen.getByText('Engagement Metrics')).toBeInTheDocument();
    });
  });

  it('switches to topics tab', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Topics')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Topics'));
    await waitFor(() => {
      expect(screen.getByText('Key Phrases')).toBeInTheDocument();
    });
  });

  it('switches to entities tab', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Entities')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Entities'));
    await waitFor(() => {
      expect(screen.getByText('Entity Explorer')).toBeInTheDocument();
    });
  });

  it('switches to anomalies tab', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Anomalies')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Anomalies'));
    await waitFor(() => {
      expect(screen.getByText('Usage Anomalies')).toBeInTheDocument();
    });
  });

  it('shows day range toggles for sentiment and engagement', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('7d')).toBeInTheDocument();
      expect(screen.getByText('30d')).toBeInTheDocument();
      expect(screen.getByText('90d')).toBeInTheDocument();
    });
  });

  it('changes day range on click', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('7d')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('7d'));
    // The query should refetch with new days
    await waitFor(() => {
      expect(screen.getByText('Sentiment Trend')).toBeInTheDocument();
    });
  });

  it('hides day range toggles on non-time tabs', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Entities')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Entities'));
    await waitFor(() => {
      expect(screen.queryByText('7d')).not.toBeInTheDocument();
    });
  });

  it('renders engagement metrics panel with stats', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Engagement')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Engagement'));
    await waitFor(() => {
      expect(screen.getByTestId('engagement-metrics-panel')).toBeInTheDocument();
    });
  });

  it('renders anomaly alerts list when no anomalies', async () => {
    renderWithProviders(<AnalyticsTab />);
    await waitFor(() => {
      expect(screen.getByText('Anomalies')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Anomalies'));
    await waitFor(() => {
      expect(screen.getByTestId('anomaly-alerts-list')).toBeInTheDocument();
      expect(screen.getByText('No anomalies detected')).toBeInTheDocument();
    });
  });
});
