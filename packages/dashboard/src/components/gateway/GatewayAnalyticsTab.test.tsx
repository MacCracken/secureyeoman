// @vitest-environment jsdom
/**
 * GatewayAnalyticsTab tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GatewayAnalyticsTab } from './GatewayAnalyticsTab';

vi.mock('../../api/client', () => ({
  fetchApiKeyUsageSummary: vi.fn(),
  fetchApiKeyUsage: vi.fn(),
  fetchApiKeys: vi.fn(),
}));

import * as apiClient from '../../api/client';

const mockFetchApiKeyUsageSummary = vi.mocked(apiClient.fetchApiKeyUsageSummary);
const mockFetchApiKeyUsage = vi.mocked(apiClient.fetchApiKeyUsage);
const mockFetchApiKeys = vi.mocked(apiClient.fetchApiKeys);

const mockSummary = [
  {
    keyId: 'key-1',
    keyPrefix: 'sck_abc1',
    personalityId: 'personality-a',
    requests24h: 120,
    tokens24h: 5400,
    errors24h: 3,
    p50LatencyMs: 85,
    p95LatencyMs: 320,
  },
  {
    keyId: 'key-2',
    keyPrefix: 'sck_def2',
    personalityId: null,
    requests24h: 50,
    tokens24h: 2100,
    errors24h: 0,
    p50LatencyMs: 60,
    p95LatencyMs: 180,
  },
];

const mockKeys = [
  {
    id: 'key-1',
    name: 'Production Key',
    key_prefix: 'sck_abc1',
    role: 'viewer',
    created_at: 0,
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
    user_id: 'u1',
  },
  {
    id: 'key-2',
    name: 'Dev Key',
    key_prefix: 'sck_def2',
    role: 'viewer',
    created_at: 0,
    expires_at: null,
    last_used_at: null,
    revoked_at: null,
    user_id: 'u1',
  },
];

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <GatewayAnalyticsTab />
    </QueryClientProvider>
  );
}

describe('GatewayAnalyticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApiKeyUsageSummary.mockResolvedValue({ summary: mockSummary });
    mockFetchApiKeyUsage.mockResolvedValue({ usage: [] });
    mockFetchApiKeys.mockResolvedValue({ keys: mockKeys } as any);
  });

  it('should render the "Gateway Analytics" heading', () => {
    renderTab();
    expect(screen.getByText('Gateway Analytics')).toBeInTheDocument();
  });

  it('should show "Per-API-key usage metrics" description', () => {
    renderTab();
    expect(screen.getByText(/per-api-key usage metrics/i)).toBeInTheDocument();
  });

  it('should display total requests KPI (120 + 50 = 170)', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('170')).toBeInTheDocument();
    });
  });

  it('should display total tokens KPI using fmt() — 7500 → "7.5k"', async () => {
    renderTab();
    await waitFor(() => {
      // 5400 + 2100 = 7500 → fmt = "7.5k"
      expect(screen.getByText('7.5k')).toBeInTheDocument();
    });
  });

  it('should display total errors KPI (3 + 0 = 3)', async () => {
    renderTab();
    await waitFor(() => {
      // errors24h total = 3
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should show per-key prefix in the table', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('sck_abc1…')).toBeInTheDocument();
      expect(screen.getByText('sck_def2…')).toBeInTheDocument();
    });
  });

  it('should show key names from keyNameMap lookup', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Production Key')).toBeInTheDocument();
      expect(screen.getByText('Dev Key')).toBeInTheDocument();
    });
  });

  it('should show p95 latency in the table — 320ms', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('320ms')).toBeInTheDocument();
    });
  });

  it('should show p50 latency in the table — 85ms', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('85ms')).toBeInTheDocument();
    });
  });

  it('should show empty state when no usage data', async () => {
    mockFetchApiKeyUsageSummary.mockResolvedValue({ summary: [] });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No API key activity in the last 24 hours.')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    // Make both queries hang
    mockFetchApiKeyUsageSummary.mockReturnValue(new Promise(() => {}));
    mockFetchApiKeys.mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(screen.getByText('Loading usage data…')).toBeInTheDocument();
  });

  it('should call fetchApiKeyUsageSummary on mount', async () => {
    renderTab();
    await waitFor(() => {
      expect(mockFetchApiKeyUsageSummary).toHaveBeenCalled();
    });
  });

  it('should call fetchApiKeys on mount', async () => {
    renderTab();
    await waitFor(() => {
      expect(mockFetchApiKeys).toHaveBeenCalled();
    });
  });

  it('should show the table header columns', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Key')).toBeInTheDocument();
      expect(screen.getByText('Requests')).toBeInTheDocument();
      expect(screen.getByText('Tokens')).toBeInTheDocument();
      expect(screen.getByText('Errors')).toBeInTheDocument();
      expect(screen.getByText('p50')).toBeInTheDocument();
      expect(screen.getByText('p95')).toBeInTheDocument();
    });
  });

  it('should show requests count for each key row', async () => {
    renderTab();
    await waitFor(() => {
      // key-1: 120 requests → fmt = "120"
      expect(screen.getByText('120')).toBeInTheDocument();
      // key-2: 50 requests → fmt = "50"
      expect(screen.getByText('50')).toBeInTheDocument();
    });
  });

  it('should show error rate percentage', async () => {
    renderTab();
    await waitFor(() => {
      // key-1: 3 errors / 120 requests = 2.5%
      expect(screen.getByText(/2\.5%/)).toBeInTheDocument();
    });
  });

  it('should show 0.0% error rate for key with no errors', async () => {
    renderTab();
    await waitFor(() => {
      // key-2: 0 errors
      expect(screen.getByText(/0\.0%/)).toBeInTheDocument();
    });
  });

  it('should show Avg p95 Latency KPI label', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Avg p95 Latency')).toBeInTheDocument();
    });
  });

  it('should show Requests (24 h) KPI label', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Requests (24 h)')).toBeInTheDocument();
    });
  });

  it('should show Tokens (24 h) KPI label', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tokens (24 h)')).toBeInTheDocument();
    });
  });

  it('should show Errors (24 h) KPI label', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Errors (24 h)')).toBeInTheDocument();
    });
  });
});
