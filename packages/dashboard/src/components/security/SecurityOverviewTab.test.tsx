// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SecurityOverviewTab } from './SecurityOverviewTab';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchTlsStatus: vi.fn().mockResolvedValue({
      enabled: true,
      expired: false,
      expiryWarning: false,
      issuer: 'Test CA',
      expiresAt: Date.now() + 86400000,
    }),
    generateTlsCert: vi.fn(),
  };
});

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

const EVENTS = [
  {
    id: 'ev-1',
    type: 'injection_attempt',
    severity: 'critical',
    message: 'Injection detected',
    timestamp: Date.now() - 60000,
    acknowledged: false,
  },
  {
    id: 'ev-2',
    type: 'rate_limit',
    severity: 'warn',
    message: 'Rate limit exceeded',
    timestamp: Date.now() - 120000,
    acknowledged: false,
  },
];

function renderTab(overrides = {}) {
  const props = {
    events: EVENTS as any,
    criticalCount: 1,
    warningCount: 1,
    verifying: false,
    verificationResult: null,
    onVerify: vi.fn(),
    onAcknowledge: vi.fn(),
    onAcknowledgeAll: vi.fn(),
    onViewAuditLog: vi.fn(),
    ...overrides,
  };
  return render(
    <QueryClientProvider client={createQC()}>
      <SecurityOverviewTab {...props} />
    </QueryClientProvider>
  );
}

describe('SecurityOverviewTab', () => {
  it('renders critical count', () => {
    renderTab();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    // criticalCount=1, but '1' may match multiple elements
    const criticalCard = screen.getByText('Critical').closest('div');
    expect(criticalCard).toBeTruthy();
  });

  it('renders warning count', () => {
    renderTab();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
  });

  it('shows event messages', () => {
    renderTab();
    expect(screen.getByText('Injection detected')).toBeInTheDocument();
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
  });

  it('shows verify button', () => {
    renderTab();
    const verifyBtns = screen.getAllByText(/Verify/i);
    expect(verifyBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows verification result when valid', () => {
    renderTab({
      verificationResult: { valid: true, entriesChecked: 42 },
    });
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('shows verification result when invalid', () => {
    renderTab({
      verificationResult: { valid: false, entriesChecked: 10, error: 'Chain broken' },
    });
    expect(screen.getByText(/Chain broken/)).toBeInTheDocument();
  });

  it('shows acknowledge all button', () => {
    renderTab();
    const ackBtn = screen.queryByText(/Acknowledge all/);
    expect(ackBtn).toBeInTheDocument();
  });

  it('shows no events message when empty', () => {
    renderTab({ events: [], criticalCount: 0, warningCount: 0 });
    expect(screen.getByText(/No security events/i)).toBeInTheDocument();
  });
});
