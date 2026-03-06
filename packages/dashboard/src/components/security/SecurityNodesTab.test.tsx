// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NodeDetailsTab } from './SecurityNodesTab';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchHealth: vi.fn(),
    fetchMetrics: vi.fn(),
    fetchAuditStats: vi.fn(),
    fetchMcpServers: vi.fn(),
  };
});

import * as api from '../../api/client';

const mockFetchHealth = vi.mocked(api.fetchHealth);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderTab() {
  return render(
    <QueryClientProvider client={createQC()}>
      <MemoryRouter>
        <NodeDetailsTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchHealth.mockResolvedValue({
    status: 'ok',
    version: '1.0.0',
    uptime: 3600000,
    checks: { database: true, auditChain: true },
  } as any);
  mockFetchMetrics.mockResolvedValue({
    tasks: {
      queueDepth: 2,
      inProgress: 1,
      total: 50,
      successRate: 0.95,
      failureRate: 0.05,
      avgDurationMs: 1200,
      p95DurationMs: 3000,
      p99DurationMs: 5000,
    },
    resources: { memoryPercent: 45 },
    security: { injectionAttemptsTotal: 0 },
  } as any);
  mockFetchAuditStats.mockResolvedValue({
    totalEntries: 1000,
    chainValid: true,
    dbSizeEstimateMb: 50,
  } as any);
  mockFetchMcpServers.mockResolvedValue({
    servers: [{ enabled: true, name: 'test-mcp' }],
    total: 1,
  } as any);
});

describe('NodeDetailsTab', () => {
  it('renders all node labels', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Agent Core')).toBeInTheDocument();
    });
    expect(screen.getByText('Task Queue')).toBeInTheDocument();
    expect(screen.getByText('Postgres')).toBeInTheDocument();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
  });

  it('shows OK status badges for healthy nodes', async () => {
    renderTab();
    await waitFor(() => {
      const okBadges = screen.getAllByText('OK');
      expect(okBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('expands node panel on click', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Agent Core')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Agent Core'));
    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Version')).toBeInTheDocument();
    });
  });

  it('shows warning for high memory usage', async () => {
    mockFetchMetrics.mockResolvedValue({
      tasks: { queueDepth: 0, successRate: 1, failureRate: 0 },
      resources: { memoryPercent: 90 },
      security: { injectionAttemptsTotal: 0 },
    } as any);
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Memory')).toBeInTheDocument();
    });
    const warnings = screen.getAllByText('Warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('shows error for database down', async () => {
    mockFetchHealth.mockResolvedValue({
      status: 'ok',
      checks: { database: false, auditChain: true },
    } as any);
    renderTab();
    await waitFor(() => {
      const errors = screen.getAllByText('Error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});
