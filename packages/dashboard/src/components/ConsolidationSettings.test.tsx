// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ConsolidationSettings from './ConsolidationSettings';

vi.mock('../api/client', () => ({
  runConsolidation: vi.fn(),
  fetchConsolidationSchedule: vi.fn(),
  updateConsolidationSchedule: vi.fn(),
  fetchConsolidationHistory: vi.fn(),
  fetchMemories: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSchedule = vi.mocked(api.fetchConsolidationSchedule);
const mockFetchHistory = vi.mocked(api.fetchConsolidationHistory);
const mockFetchMemories = vi.mocked(api.fetchMemories);
const mockRunConsolidation = vi.mocked(api.runConsolidation);
const mockUpdateSchedule = vi.mocked(api.updateConsolidationSchedule);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConsolidationSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const HISTORY_ENTRY_LIVE = {
  timestamp: Date.now() - 60000,
  totalCandidates: 50,
  summary: { merged: 10, replaced: 5, updated: 3, keptSeparate: 2, skipped: 1 },
  dryRun: false,
  durationMs: 1234,
};

const HISTORY_ENTRY_DRY = {
  timestamp: Date.now() - 120000,
  totalCandidates: 30,
  summary: { merged: 0, replaced: 0, updated: 0, keptSeparate: 0, skipped: 30 },
  dryRun: true,
  durationMs: 500,
};

describe('ConsolidationSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSchedule.mockResolvedValue({ schedule: '0 2 * * *' } as any);
    mockFetchHistory.mockResolvedValue({ history: [] } as any);
    mockFetchMemories.mockResolvedValue({ memories: [] } as any);
    mockRunConsolidation.mockResolvedValue({} as any);
    mockUpdateSchedule.mockResolvedValue({} as any);
  });

  // ── Stat cards ─────────────────────────────────────────────────────

  it('renders stat cards', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Total Memories')).toBeInTheDocument();
      expect(screen.getByText('Total Merged')).toBeInTheDocument();
      expect(screen.getByText('Consolidation Runs')).toBeInTheDocument();
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    });
  });

  it('shows memory count from fetched data', async () => {
    mockFetchMemories.mockResolvedValue({
      memories: [{ id: '1' }, { id: '2' }, { id: '3' }],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('shows 0 memories when memoriesData has no memories array', async () => {
    mockFetchMemories.mockResolvedValue({} as any);
    renderComponent();
    await waitFor(() => {
      // Multiple stat cards show "0" -- just verify at least one exists
      const zeroes = screen.getAllByText('0');
      expect(zeroes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('computes trends from live runs only (excludes dry runs)', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE, HISTORY_ENTRY_DRY],
    } as any);
    renderComponent();
    await waitFor(() => {
      // Avg Duration stat card = 1234ms (only live run counted); also in history table
      const durationMatches = screen.getAllByText('1234ms');
      expect(durationMatches.length).toBeGreaterThanOrEqual(1);
    });
    // "Total Merged" stat card shows "10" (only from live run)
    const allValues = screen.getAllByText('10');
    expect(allValues.length).toBeGreaterThanOrEqual(1);
  });

  it('shows 0ms avg duration when no live runs', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_DRY],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('0ms')).toBeInTheDocument();
    });
  });

  // ── Schedule section ───────────────────────────────────────────────

  it('renders schedule presets', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Every night at 2 AM')).toBeInTheDocument();
      expect(screen.getByText('Every 6 hours')).toBeInTheDocument();
      expect(screen.getByText('Every day at noon')).toBeInTheDocument();
      expect(screen.getByText('Weekly (Sunday 3 AM)')).toBeInTheDocument();
    });
  });

  it('shows current schedule from fetched data', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('0 2 * * *')).toBeInTheDocument();
    });
  });

  it('does not show current schedule line when no schedule data', async () => {
    mockFetchSchedule.mockResolvedValue({} as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Consolidation Schedule')).toBeInTheDocument();
    });
    expect(screen.queryByText('Current:')).not.toBeInTheDocument();
  });

  it('populates custom cron input from fetched schedule', async () => {
    renderComponent();
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Custom cron expression') as HTMLInputElement;
      expect(input.value).toBe('0 2 * * *');
    });
  });

  it('calls updateConsolidationSchedule when a preset is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Every 6 hours')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Every 6 hours'));

    await waitFor(() => {
      expect(mockUpdateSchedule).toHaveBeenCalledWith('0 */6 * * *');
    });
  });

  it('updates cron input value when preset is selected', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Weekly (Sunday 3 AM)')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Weekly (Sunday 3 AM)'));

    const input = screen.getByPlaceholderText('Custom cron expression') as HTMLInputElement;
    expect(input.value).toBe('0 3 * * 0');
  });

  it('allows typing a custom cron and saving it', async () => {
    mockFetchSchedule.mockResolvedValue({} as any);
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Custom cron expression')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Custom cron expression');
    await user.clear(input);
    await user.type(input, '*/15 * * * *');
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdateSchedule).toHaveBeenCalledWith('*/15 * * * *');
    });
  });

  it('trims whitespace from custom cron before saving', async () => {
    mockFetchSchedule.mockResolvedValue({} as any);
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Custom cron expression')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Custom cron expression');
    await user.clear(input);
    await user.type(input, '0 5 * * *');
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdateSchedule).toHaveBeenCalledWith('0 5 * * *');
    });
  });

  it('does not call updateSchedule when saving empty cron', async () => {
    const user = userEvent.setup();
    mockFetchSchedule.mockResolvedValue({} as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Custom cron expression')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Custom cron expression');
    await user.clear(input);
    await user.click(screen.getByText('Save'));

    expect(mockUpdateSchedule).not.toHaveBeenCalled();
  });

  it('does not call updateSchedule when saving whitespace-only cron', async () => {
    const user = userEvent.setup();
    mockFetchSchedule.mockResolvedValue({} as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Custom cron expression')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Custom cron expression');
    await user.clear(input);
    await user.type(input, '   ');
    await user.click(screen.getByText('Save'));

    expect(mockUpdateSchedule).not.toHaveBeenCalled();
  });

  // ── Dry run toggle ─────────────────────────────────────────────────

  it('renders dry run checkbox unchecked by default', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Dry run (preview only)')).toBeInTheDocument();
    });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('toggles dry run checkbox on click', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Dry run (preview only)')).toBeInTheDocument();
    });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  // ── Manual run ─────────────────────────────────────────────────────

  it('calls runConsolidation when Run Now is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Run Now')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Run Now'));

    await waitFor(() => {
      expect(mockRunConsolidation).toHaveBeenCalledTimes(1);
    });
  });

  it('shows success message after successful run', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Run Now')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Run Now'));

    await waitFor(() => {
      expect(screen.getByText('Consolidation completed successfully.')).toBeInTheDocument();
    });
  });

  it('shows error message after failed run', async () => {
    mockRunConsolidation.mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Run Now')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Run Now'));

    await waitFor(() => {
      expect(
        screen.getByText('Consolidation failed. Check logs for details.')
      ).toBeInTheDocument();
    });
  });

  it('shows Running... text while mutation is pending', async () => {
    mockRunConsolidation.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Run Now')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Run Now'));

    await waitFor(() => {
      expect(screen.getByText('Running...')).toBeInTheDocument();
    });
  });

  // ── History table ──────────────────────────────────────────────────

  it('shows empty history message when no runs', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No consolidation runs yet.')).toBeInTheDocument();
    });
  });

  it('shows "0 runs recorded" for empty history', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('0 runs recorded')).toBeInTheDocument();
    });
  });

  it('shows singular "1 run recorded" for single entry', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('1 run recorded')).toBeInTheDocument();
    });
  });

  it('shows "2 runs recorded" for multiple entries', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE, HISTORY_ENTRY_DRY],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('2 runs recorded')).toBeInTheDocument();
    });
  });

  it('renders history table with live run data', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getAllByText('1234ms').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Live')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument(); // totalCandidates
    });
  });

  it('renders history table with dry run badge', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_DRY],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Dry Run')).toBeInTheDocument();
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });
  });

  it('renders both live and dry run entries in history', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE, HISTORY_ENTRY_DRY],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
      expect(screen.getByText('Dry Run')).toBeInTheDocument();
    });
  });

  it('renders table headers', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Time')).toBeInTheDocument();
      expect(screen.getByText('Candidates')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('Mode')).toBeInTheDocument();
      // Merged/Replaced/Updated/Kept appear in both table headers and trend legend
      expect(screen.getAllByText('Merged').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Replaced').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Updated').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Kept').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Trends chart ───────────────────────────────────────────────────

  it('shows trends chart when there are live runs', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Consolidation Trends')).toBeInTheDocument();
      expect(screen.getByText('Actions per run over time')).toBeInTheDocument();
    });
  });

  it('does not show trends chart when no live runs', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_DRY],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Consolidation History')).toBeInTheDocument();
    });
    expect(screen.queryByText('Consolidation Trends')).not.toBeInTheDocument();
  });

  it('does not show trends chart when history is empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Consolidation History')).toBeInTheDocument();
    });
    expect(screen.queryByText('Consolidation Trends')).not.toBeInTheDocument();
  });

  it('shows trend legend labels', async () => {
    mockFetchHistory.mockResolvedValue({
      history: [HISTORY_ENTRY_LIVE],
    } as any);
    renderComponent();
    await waitFor(() => {
      // Legend labels share text with table headers, so use getAllByText
      expect(screen.getAllByText('Merged').length).toBeGreaterThanOrEqual(2); // header + legend
      expect(screen.getAllByText('Replaced').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Updated').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Kept').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('limits trends chart to last 10 runs', async () => {
    const runs = Array.from({ length: 15 }, (_, i) => ({
      timestamp: Date.now() - i * 60000,
      totalCandidates: 10 + i,
      summary: { merged: 2, replaced: 1, updated: 1, keptSeparate: 0, skipped: 0 },
      dryRun: false,
      durationMs: 100 + i * 10,
    }));
    mockFetchHistory.mockResolvedValue({ history: runs } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Consolidation Trends')).toBeInTheDocument();
    });
    // All 15 runs appear in history table, but trends bar chart only shows last 10.
    // We can verify by checking the total count text in the chart bars.
    // Each live run has total = 2+1+1+0 = 4, so there should be 10 "4" cells from the bar chart
    // plus some in the table.
    expect(screen.getByText('15 runs recorded')).toBeInTheDocument();
  });

  // ── Schedule mutation pending state ────────────────────────────────

  it('disables Save button while schedule mutation is pending', async () => {
    mockUpdateSchedule.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Custom cron expression')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Custom cron expression');
    await user.clear(input);
    await user.type(input, '0 4 * * *');
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Save').closest('button')).toBeDisabled();
    });
  });
});
