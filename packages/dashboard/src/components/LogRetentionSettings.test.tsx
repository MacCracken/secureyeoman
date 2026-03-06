// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogRetentionSettings } from './LogRetentionSettings';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchAuditStats: vi.fn(),
    enforceRetention: vi.fn(),
    exportAuditBackup: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderSettings() {
  return render(
    <QueryClientProvider client={createQC()}>
      <LogRetentionSettings />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAuditStats.mockResolvedValue({
    totalEntries: 5000,
    oldestEntry: 1690000000000,
    lastVerification: 1700000000000,
    chainValid: true,
    dbSizeEstimateMb: 25.5,
  } as any);
});

describe('LogRetentionSettings', () => {
  it('renders the component heading', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Log Retention')).toBeInTheDocument();
    });
  });

  it('shows total entries stat', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Total Audit Entries')).toBeInTheDocument();
    });
  });

  it('shows max age input', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByDisplayValue('90')).toBeInTheDocument();
    });
  });

  it('shows max entries input', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByDisplayValue('100000')).toBeInTheDocument();
    });
  });

  it('shows export button', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/Export/i)).toBeInTheDocument();
    });
  });

  it('shows enforce button', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/Enforce/i)).toBeInTheDocument();
    });
  });
});
