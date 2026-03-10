// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditChainTab } from './AuditChainTab';

vi.mock('../api/client', () => ({
  fetchAuditStats: vi.fn(),
  repairAuditChain: vi.fn(),
}));

import * as api from '../api/client';

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AuditChainTab />
    </QueryClientProvider>
  );
}

describe('AuditChainTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchAuditStats).mockResolvedValue({
      chainValid: true,
      totalEntries: 1234,
      lastVerification: Date.now(),
      dbSizeEstimateMb: 45.6,
    } as never);
  });

  it('should render Audit Chain heading', async () => {
    renderTab();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
  });

  it('should show chain status as Valid', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Valid')).toBeInTheDocument();
    });
  });

  it('should show total entries', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('1234')).toBeInTheDocument();
    });
  });

  it('should show database size', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('45.6 MB')).toBeInTheDocument();
    });
  });

  it('should show last verification time', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Last Verification')).toBeInTheDocument();
    });
  });

  it('should show loading state', () => {
    vi.mocked(api.fetchAuditStats).mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(screen.getByText('Loading audit stats...')).toBeInTheDocument();
  });

  it('should show Invalid chain with repair button', async () => {
    vi.mocked(api.fetchAuditStats).mockResolvedValue({
      chainValid: false,
      totalEntries: 500,
      chainError: 'Hash mismatch at entry 42',
      chainBrokenAt: 'entry-42-abc',
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Invalid')).toBeInTheDocument();
    });
    expect(screen.getByText('Chain integrity failure detected')).toBeInTheDocument();
    expect(screen.getByText('Hash mismatch at entry 42')).toBeInTheDocument();
    expect(screen.getByText(/First broken entry: entry-42-abc/)).toBeInTheDocument();
    expect(screen.getByText('Repair Chain')).toBeInTheDocument();
  });

  it('should call repairAuditChain on Repair click', async () => {
    vi.mocked(api.fetchAuditStats).mockResolvedValue({
      chainValid: false,
      totalEntries: 500,
    } as never);
    vi.mocked(api.repairAuditChain).mockResolvedValue({
      repairedCount: 5,
      entriesTotal: 500,
    } as never);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Repair Chain')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Repair Chain'));

    await waitFor(() => {
      expect(api.repairAuditChain).toHaveBeenCalled();
    });
  });
});
