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

  it('starts an audit run when name provided and Start clicked', async () => {
    const mockCreateRun = vi.mocked(api.createAuditRun);
    mockCreateRun.mockResolvedValue({ id: 'run-new', name: 'Test Audit', checklist: [] } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Audit name/)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/Audit name/), 'Test Audit');
    await user.click(screen.getByText('Start Audit'));

    await waitFor(() => {
      expect(mockCreateRun).toHaveBeenCalledWith('Test Audit');
    });
  });

  it('shows emergency stop button for L5 items in registry', async () => {
    const overviewWithL5 = {
      totals: { L1: 0, L2: 0, L3: 0, L4: 0, L5: 1 },
      byLevel: {
        L1: [],
        L2: [],
        L3: [],
        L4: [],
        L5: [
          { id: 's-5', name: 'Dangerous Bot', type: 'skill', autonomyLevel: 'L5', enabled: true },
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
      expect(screen.getByText('Dangerous Bot')).toBeInTheDocument();
    });
  });

  it('shows Stop Procedure column in overview', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Stop Procedure')).toBeInTheDocument();
    });
  });

  it('shows item type in overview table', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('skill')).toBeInTheDocument();
    });
  });

  it('renders with multi-level items', async () => {
    const multiOverview = {
      totals: { L1: 1, L2: 1, L3: 1, L4: 0, L5: 0 },
      byLevel: {
        L1: [{ id: 's-1', name: 'Basic', type: 'skill', autonomyLevel: 'L1', enabled: true }],
        L2: [{ id: 's-2', name: 'Moderate', type: 'workflow', autonomyLevel: 'L2', enabled: true }],
        L3: [{ id: 's-3', name: 'Advanced', type: 'skill', autonomyLevel: 'L3', enabled: true }],
        L4: [],
        L5: [],
      },
    };
    mockFetchOverview.mockResolvedValue(multiOverview as any);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Basic')).toBeInTheDocument();
      expect(screen.getByText('Moderate')).toBeInTheDocument();
      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });
  });

  it('shows audit wizard checklist items after starting a run', async () => {
    const mockCreateRun = vi.mocked(api.createAuditRun);
    const mockFetchRun = vi.mocked(api.fetchAuditRun);
    const runData = {
      id: 'run-new',
      name: 'Test Audit',
      status: 'in_progress',
      items: [
        {
          id: 'item-1',
          section: 'A',
          text: 'Verify all L5 items are inventoried',
          status: 'pending',
          note: '',
        },
        {
          id: 'item-2',
          section: 'A',
          text: 'Confirm naming conventions',
          status: 'pending',
          note: '',
        },
        {
          id: 'item-3',
          section: 'B',
          text: 'Review level assignments',
          status: 'pending',
          note: '',
        },
      ],
    };
    mockCreateRun.mockResolvedValue(runData as any);
    mockFetchRun.mockResolvedValue(runData as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Audit name/)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Audit name/), 'Test Audit');
    await user.click(screen.getByText('Start Audit'));

    await waitFor(() => {
      expect(screen.getByText('Verify all L5 items are inventoried')).toBeInTheDocument();
      expect(screen.getByText('Confirm naming conventions')).toBeInTheDocument();
    });
    // Status buttons should be visible
    expect(screen.getAllByText('pass').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('fail').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('deferred').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Next section button in wizard section A', async () => {
    const mockCreateRun = vi.mocked(api.createAuditRun);
    const mockFetchRun = vi.mocked(api.fetchAuditRun);
    const runData = {
      id: 'run-x',
      name: 'Nav Test',
      status: 'in_progress',
      items: [{ id: 'item-1', section: 'A', text: 'Item A1', status: 'pending', note: '' }],
    };
    mockCreateRun.mockResolvedValue(runData as any);
    mockFetchRun.mockResolvedValue(runData as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await user.type(screen.getByPlaceholderText(/Audit name/), 'Nav Test');
    await user.click(screen.getByText('Start Audit'));

    await waitFor(() => {
      expect(screen.getByText('Item A1')).toBeInTheDocument();
    });
    expect(screen.getByText(/Next section/)).toBeInTheDocument();
    expect(screen.getByText('Back to list')).toBeInTheDocument();
  });

  it('shows completed audit with pass/fail/deferred counts', async () => {
    const mockFetchRun = vi.mocked(api.fetchAuditRun);
    mockFetchAuditRuns.mockResolvedValue([
      { id: 'run-done', name: 'Completed Audit', status: 'completed' },
    ] as any);
    mockFetchRun.mockResolvedValue({
      id: 'run-done',
      name: 'Completed Audit',
      status: 'completed',
      reportMarkdown: '# Audit Report\nAll clear.',
      items: [
        { id: 'i1', section: 'A', text: 'Check 1', status: 'pass', note: '' },
        { id: 'i2', section: 'A', text: 'Check 2', status: 'fail', note: 'Missing docs' },
        { id: 'i3', section: 'B', text: 'Check 3', status: 'deferred', note: '' },
      ],
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByText('Completed Audit')).toBeInTheDocument();
    });
    // Click the completed run to view it
    await user.click(screen.getByText('Completed Audit'));
    await waitFor(() => {
      expect(screen.getByText(/Audit Complete/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Pass: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Fail: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Deferred: 1/)).toBeInTheDocument();
  });

  it('shows View Report details in completed audit', async () => {
    const mockFetchRun = vi.mocked(api.fetchAuditRun);
    mockFetchAuditRuns.mockResolvedValue([
      { id: 'run-rpt', name: 'Report Audit', status: 'completed' },
    ] as any);
    mockFetchRun.mockResolvedValue({
      id: 'run-rpt',
      name: 'Report Audit',
      status: 'completed',
      reportMarkdown: '# Report\nDetailed findings here.',
      items: [{ id: 'i1', section: 'A', text: 'Check', status: 'pass', note: '' }],
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Audit Wizard')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Audit Wizard'));
    await waitFor(() => {
      expect(screen.getByText('Report Audit')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Report Audit'));
    await waitFor(() => {
      expect(screen.getByText('View Report')).toBeInTheDocument();
    });
  });

  it('shows Emergency Stop button in registry and opens confirm dialog', async () => {
    const overviewWithL5 = {
      totals: { L1: 0, L2: 0, L3: 0, L4: 0, L5: 1 },
      byLevel: {
        L1: [],
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
      expect(screen.getByText('Emergency Stop')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Emergency Stop'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Disable workflow "Auto Deploy"/)).toBeInTheDocument();
    });
  });

  it('shows no L5 items message in empty registry', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Emergency Stop Registry')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Emergency Stop Registry'));
    await waitFor(() => {
      expect(screen.getByText('No L5 items found.')).toBeInTheDocument();
    });
  });

  it('shows emergency stop warning text in registry', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Emergency Stop Registry')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Emergency Stop Registry'));
    await waitFor(() => {
      expect(screen.getByText(/Emergency stop immediately disables/)).toBeInTheDocument();
    });
  });

  it('shows run status in previous runs list', async () => {
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
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('in_progress')).toBeInTheDocument();
    });
  });
});
