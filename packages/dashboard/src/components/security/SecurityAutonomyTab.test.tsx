// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutonomyTab } from './SecurityAutonomyTab';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchAutonomyOverview: vi.fn(),
    fetchAuditRuns: vi.fn(),
    fetchAuditRun: vi.fn(),
    createAuditRun: vi.fn(),
    updateAuditItem: vi.fn(),
    finalizeAuditRun: vi.fn(),
    emergencyStop: vi.fn(),
  };
});

vi.mock('../common/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, onConfirm, onCancel, message }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{message}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

import * as api from '../../api/client';

const mockFetchOverview = vi.mocked(api.fetchAutonomyOverview);
const mockFetchAuditRuns = vi.mocked(api.fetchAuditRuns);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderTab() {
  return render(
    <QueryClientProvider client={createQC()}>
      <AutonomyTab />
    </QueryClientProvider>
  );
}

const OVERVIEW = {
  totals: { L1: 5, L2: 3, L3: 2, L4: 1, L5: 0 },
  byLevel: {
    L1: [{ id: 's-1', name: 'Summarize', type: 'skill', autonomyLevel: 'L1', enabled: true }],
    L2: [],
    L3: [],
    L4: [],
    L5: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOverview.mockResolvedValue(OVERVIEW as any);
  mockFetchAuditRuns.mockResolvedValue([] as any);
});

describe('AutonomyTab', () => {
  it('renders panel buttons', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    expect(screen.getByText('Emergency Stop Registry')).toBeInTheDocument();
  });

  it('shows autonomy level cards with counts', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('L1')).toBeInTheDocument();
    });
    expect(screen.getByText('L2')).toBeInTheDocument();
    expect(screen.getByText('L3')).toBeInTheDocument();
    expect(screen.getByText('L4')).toBeInTheDocument();
    expect(screen.getByText('L5')).toBeInTheDocument();
  });

  it('shows level count values', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // L1 count
    });
  });

  it('shows item name from overview', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
  });

  it('switches to Audit Wizard panel', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByText('Start Audit')).toBeInTheDocument();
    });
  });

  it('switches to Emergency Stop Registry', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Emergency Stop Registry')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Emergency Stop Registry'));
    await waitFor(() => {
      expect(screen.getByText(/L5/)).toBeInTheDocument();
    });
  });

  it('filters by level when clicking level card', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('L1')).toBeInTheDocument();
    });
    await user.click(screen.getByText('L1'));
    // Should filter to only L1 items
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
  });
});
