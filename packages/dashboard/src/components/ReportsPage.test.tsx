// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsPage } from './ReportsPage';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchReports: vi.fn(),
    generateReport: vi.fn(),
    downloadReport: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchReports = vi.mocked(api.fetchReports);
const mockGenerateReport = vi.mocked(api.generateReport);
const mockDownloadReport = vi.mocked(api.downloadReport);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

const MOCK_REPORT: api.ReportSummary = {
  id: 'rpt-1',
  title: 'Security Report - 3/6/2026',
  generatedAt: Date.now(),
  format: 'json',
  entryCount: 42,
  sizeBytes: 8192,
};

// ── Tests ────────────────────────────────────────────────────────

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the page header', async () => {
    mockFetchReports.mockResolvedValue({ reports: [], total: 0 });
    renderComponent();
    expect(screen.getByText('Audit Reports')).toBeInTheDocument();
    expect(screen.getByText(/Generate and download/)).toBeInTheDocument();
  });

  it('shows loading spinner while fetching reports', () => {
    mockFetchReports.mockReturnValue(new Promise(() => {})); // never resolves
    renderComponent();
    // The loading Loader2 spinner should be visible (no reports text yet)
    expect(screen.queryByText('No reports generated yet')).not.toBeInTheDocument();
  });

  it('shows empty state when no reports exist', async () => {
    mockFetchReports.mockResolvedValue({ reports: [], total: 0 });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No reports generated yet')).toBeInTheDocument();
    });
  });

  it('renders a list of reports', async () => {
    mockFetchReports.mockResolvedValue({ reports: [MOCK_REPORT], total: 1 });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Security Report - 3/6/2026')).toBeInTheDocument();
    });
    expect(screen.getByText(/42 entries/)).toBeInTheDocument();
    // The report row shows format as uppercase — match the specific report detail line
    expect(screen.getByText(/42 entries.*JSON/)).toBeInTheDocument();
  });

  it('generates a report when Generate button is clicked', async () => {
    const user = userEvent.setup();
    mockFetchReports.mockResolvedValue({ reports: [], total: 0 });
    mockGenerateReport.mockResolvedValue({} as never);

    renderComponent();
    await waitFor(() => screen.getByText('Generate'));

    await user.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalled();
    });
    expect(mockGenerateReport.mock.calls[0][0]).toMatchObject({ format: 'json' });
  });

  it('shows success message after generating a report', async () => {
    const user = userEvent.setup();
    mockFetchReports.mockResolvedValue({ reports: [], total: 0 });
    mockGenerateReport.mockResolvedValue({} as never);

    renderComponent();
    await waitFor(() => screen.getByText('Generate'));

    await user.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByText('Report generated successfully.')).toBeInTheDocument();
    });
  });

  it('shows error message when generation fails', async () => {
    const user = userEvent.setup();
    mockFetchReports.mockResolvedValue({ reports: [], total: 0 });
    mockGenerateReport.mockRejectedValue(new Error('Server error'));

    renderComponent();
    await waitFor(() => screen.getByText('Generate'));

    await user.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to generate report/)).toBeInTheDocument();
    });
  });

  it('allows changing the format dropdown', async () => {
    const user = userEvent.setup();
    mockFetchReports.mockResolvedValue({ reports: [], total: 0 });
    mockGenerateReport.mockResolvedValue({} as never);

    renderComponent();
    await waitFor(() => screen.getByText('Generate'));

    // Find the format select — it's the only <select> on the page
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'html');

    await user.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalled();
    });
    expect(mockGenerateReport.mock.calls[0][0]).toMatchObject({ format: 'html' });
  });

  it('downloads a report when download button is clicked', async () => {
    const user = userEvent.setup();
    mockFetchReports.mockResolvedValue({ reports: [MOCK_REPORT], total: 1 });
    const mockBlob = new Blob(['{}'], { type: 'application/json' });
    mockDownloadReport.mockResolvedValue(mockBlob);

    // Mock URL.createObjectURL / revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();

    renderComponent();
    await waitFor(() => screen.getByText('Security Report - 3/6/2026'));

    const downloadBtn = screen.getByTitle('Download');
    await user.click(downloadBtn);

    await waitFor(() => {
      expect(mockDownloadReport).toHaveBeenCalledWith('rpt-1');
    });
  });
});
