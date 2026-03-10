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

  it('clears filter when clicking same level card again', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // L1 count
    });
    // Click L1 card to filter
    const l1Cards = screen.getAllByText('L1');
    await user.click(l1Cards[0]);
    // Click again to clear
    const l1CardsAgain = screen.getAllByText('L1');
    await user.click(l1CardsAgain[0]);
    // Filter should be cleared - items from all levels visible
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
  });

  it('shows loading state', async () => {
    mockFetchOverview.mockReturnValue(new Promise(() => {}));
    renderTab();
    // Should not crash while loading
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('shows table with item details', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Summarize')).toBeInTheDocument();
    });
    // Table headers
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
  });

  it('shows empty state when filtering level with no items', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('L5')).toBeInTheDocument();
    });
    await user.click(screen.getByText('L5'));
    await waitFor(() => {
      expect(screen.getByText('No items at this level.')).toBeInTheDocument();
    });
  });

  it('shows audit wizard input for name', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Audit name/)).toBeInTheDocument();
    });
  });

  it('disables Start Audit when name is empty', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByText('Start Audit')).toBeDisabled();
    });
  });

  it('shows previous runs in audit wizard', async () => {
    mockFetchAuditRuns.mockResolvedValue([
      { id: 'run-1', name: 'Q1 Review', status: 'completed' },
      { id: 'run-2', name: 'Q2 Review', status: 'in_progress' },
    ] as any);
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByText('Q1 Review')).toBeInTheDocument();
      expect(screen.getByText('Q2 Review')).toBeInTheDocument();
    });
    expect(screen.getByText('Previous Runs')).toBeInTheDocument();
  });

  it('shows Emergency Stop Registry with L5 items', async () => {
    const overviewWithL5 = {
      totals: { L1: 1, L2: 0, L3: 0, L4: 0, L5: 1 },
      byLevel: {
        L1: [{ id: 's-1', name: 'Summarize', type: 'skill', autonomyLevel: 'L1', enabled: true }],
        L2: [],
        L3: [],
        L4: [],
        L5: [
          { id: 's-5', name: 'Auto Deploy', type: 'workflow', autonomyLevel: 'L5', enabled: true },
        ],
      },
    };
    mockFetchOverview.mockResolvedValue(overviewWithL5 as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Emergency Stop Registry')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Emergency Stop Registry'));
    await waitFor(() => {
      expect(screen.getByText('Auto Deploy')).toBeInTheDocument();
    });
  });
});
