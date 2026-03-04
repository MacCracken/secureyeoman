import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SandboxTab } from './SecuritySandboxTab';

// Mock API client
vi.mock('../../api/client', () => ({
  fetchScanHistory: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  fetchScanStats: vi.fn().mockResolvedValue({
    stats: { total: 42, byVerdict: { pass: 30, quarantine: 5, block: 2 }, bySeverity: { high: 3 } },
  }),
  fetchQuarantineItems: vi.fn().mockResolvedValue({ items: [] }),
  fetchThreatIntelligence: vi.fn().mockResolvedValue({
    patternCount: 17,
    categories: ['reverse_shell', 'cryptominer'],
    stages: ['command_and_control'],
    patterns: [
      { id: 'p1', name: 'Bash Rev Shell', category: 'reverse_shell', intentWeight: 0.9 },
    ],
  }),
  fetchSandboxPolicy: vi.fn().mockResolvedValue({
    policy: { enabled: true, maxArtifactSizeBytes: 10_000_000, redactSecrets: true },
  }),
  approveQuarantine: vi.fn().mockResolvedValue(undefined),
  deleteQuarantine: vi.fn().mockResolvedValue(undefined),
}));

import {
  fetchScanStats,
  fetchQuarantineItems,
  approveQuarantine,
  deleteQuarantine,
} from '../../api/client';

const QUARANTINE_ENTRY_BASE = {
  artifactId: 'a0000000-0000-0000-0000-000000000000',
  createdAt: Date.now(),
  scanResult: {
    artifactId: 'a0000000-0000-0000-0000-000000000000',
    verdict: 'quarantine' as const,
    findings: [],
    worstSeverity: 'info' as const,
    scanDurationMs: 10,
    scannerVersions: {},
    scannedAt: Date.now(),
  },
};

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SandboxTab />
    </QueryClientProvider>,
  );
}

describe('SecuritySandboxTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stat cards', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Total Scans')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('renders quarantine section', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/Quarantined Artifacts/)).toBeInTheDocument();
    });
  });

  it('renders empty quarantine message', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No quarantined artifacts.')).toBeInTheDocument();
    });
  });

  it('renders threat intelligence panel', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/Threat Intelligence/)).toBeInTheDocument();
      expect(screen.getByText(/17 patterns/)).toBeInTheDocument();
    });
  });

  it('renders policy banner', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Externalization Policy')).toBeInTheDocument();
    });
  });

  it('renders recent scans section', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Recent Scans')).toBeInTheDocument();
    });
  });

  it('shows quarantine items with approve/delete buttons', async () => {
    vi.mocked(fetchQuarantineItems).mockResolvedValue({
      items: [{
        ...QUARANTINE_ENTRY_BASE,
        id: 'abc12345-1234-1234-1234-1234567890ab',
        status: 'quarantined',
        sourceContext: 'test',
        artifactType: 'text/javascript',
      }],
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('abc12345-123...')).toBeInTheDocument();
      expect(screen.getByTitle('Approve and release')).toBeInTheDocument();
      expect(screen.getByTitle('Permanently delete')).toBeInTheDocument();
    });
  });

  it('calls approve mutation on click', async () => {
    vi.mocked(fetchQuarantineItems).mockResolvedValue({
      items: [{
        ...QUARANTINE_ENTRY_BASE,
        id: 'abc12345-1234-1234-1234-1234567890ab',
        status: 'quarantined',
        sourceContext: 'test',
        artifactType: 'text/plain',
      }],
    });
    renderTab();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByTitle('Approve and release')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Approve and release'));
    await waitFor(() => {
      expect(approveQuarantine).toHaveBeenCalledWith('abc12345-1234-1234-1234-1234567890ab');
    });
  });

  it('calls delete mutation on click', async () => {
    vi.mocked(fetchQuarantineItems).mockResolvedValue({
      items: [{
        ...QUARANTINE_ENTRY_BASE,
        id: 'abc12345-1234-1234-1234-1234567890ab',
        status: 'quarantined',
        sourceContext: 'test',
        artifactType: 'text/plain',
      }],
    });
    renderTab();
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByTitle('Permanently delete')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Permanently delete'));
    await waitFor(() => {
      expect(deleteQuarantine).toHaveBeenCalledWith('abc12345-1234-1234-1234-1234567890ab');
    });
  });

  it('renders no scan records message', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No scan records found.')).toBeInTheDocument();
    });
  });

  it('renders stat badges', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Quarantined')).toBeInTheDocument();
      expect(screen.getByText('Blocked')).toBeInTheDocument();
      expect(screen.getByText('Passed')).toBeInTheDocument();
    });
  });

  it('renders threat pattern cards', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Bash Rev Shell')).toBeInTheDocument();
    });
  });
});
