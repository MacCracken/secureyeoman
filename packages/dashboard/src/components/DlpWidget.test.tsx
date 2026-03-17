/**
 * DlpWidget — unit tests
 *
 * Phase 136-F — DLP Egress Monitoring, MCP Tools, Dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DlpWidget } from './DlpWidget';

// Mock auth
vi.mock('../api/client', () => ({
  getAccessToken: vi.fn(() => 'test-token'),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockClassifications = {
  records: [
    { classificationLevel: 'public' },
    { classificationLevel: 'public' },
    { classificationLevel: 'internal' },
    { classificationLevel: 'confidential' },
    { classificationLevel: 'confidential' },
    { classificationLevel: 'confidential' },
    { classificationLevel: 'restricted' },
  ],
  total: 7,
};

const mockEgressStats = {
  totalEvents: 42,
  byDestination: { email: 20, slack: 22 },
  byAction: { allowed: 38, blocked: 2, warned: 2 },
  byClassification: { internal: 30, confidential: 12 },
  period: { from: 1000, to: 2000 },
};

const mockPolicies = {
  policies: [
    { id: 'p1', name: 'Block PII in email', enabled: true, action: 'block' },
    { id: 'p2', name: 'Warn on confidential', enabled: true, action: 'warn' },
    { id: 'p3', name: 'Log internal exports', enabled: false, action: 'log' },
  ],
  total: 3,
};

function mockFetchAll() {
  let _callCount = 0;
  return vi.fn().mockImplementation((url: string) => {
    _callCount++;
    if (url.includes('/classifications')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockClassifications,
      });
    }
    if (url.includes('/egress/stats')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockEgressStats,
      });
    }
    if (url.includes('/policies')) {
      return Promise.resolve({
        ok: true,
        json: async () => mockPolicies,
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  });
}

describe('DlpWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    render(<DlpWidget />, { wrapper });
    expect(screen.getByText(/Loading DLP/i)).toBeTruthy();
  });

  it('renders classification counts', async () => {
    vi.stubGlobal('fetch', mockFetchAll());
    render(<DlpWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('public')).toBeTruthy();
      expect(screen.getByText('internal')).toBeTruthy();
      expect(screen.getByText('confidential')).toBeTruthy();
      expect(screen.getByText('restricted')).toBeTruthy();
    });
    // Check counts are rendered (multiple "2"s appear: public=2, blocked=2, warned=2)
    await waitFor(() => {
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('3')).toBeTruthy(); // confidential count
    });
  });

  it('shows total classifications', async () => {
    vi.stubGlobal('fetch', mockFetchAll());
    render(<DlpWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/7 total classifications/)).toBeTruthy();
    });
  });

  it('renders egress stats', async () => {
    vi.stubGlobal('fetch', mockFetchAll());
    render(<DlpWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Egress Activity')).toBeTruthy();
      expect(screen.getByText('42')).toBeTruthy();
    });
  });

  it('renders policy status', async () => {
    vi.stubGlobal('fetch', mockFetchAll());
    render(<DlpWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Policy Status')).toBeTruthy();
      expect(screen.getByText('Block PII in email')).toBeTruthy();
      expect(screen.getByText('Warn on confidential')).toBeTruthy();
      expect(screen.getByText('Log internal exports')).toBeTruthy();
      // 2 enabled out of 3
      expect(screen.getByText('2/3')).toBeTruthy();
    });
  });

  it('shows error state when all APIs fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
    );
    render(<DlpWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeTruthy();
    });
  });

  it('renders the title', async () => {
    vi.stubGlobal('fetch', mockFetchAll());
    render(<DlpWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Data Loss Prevention')).toBeTruthy();
    });
  });

  it('renders section headers', async () => {
    vi.stubGlobal('fetch', mockFetchAll());
    render(<DlpWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Classification Overview')).toBeTruthy();
      expect(screen.getByText('Egress Activity')).toBeTruthy();
      expect(screen.getByText('Policy Status')).toBeTruthy();
    });
  });
});
