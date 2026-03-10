// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsTab } from './SecurityReportsTab';

vi.mock('../../api/client', () => ({
  fetchReports: vi.fn(),
  generateReport: vi.fn(),
  downloadReport: vi.fn(),
  exportAuditLog: vi.fn(),
  fetchDepartments: vi.fn(),
  fetchDepartmentReport: vi.fn(),
  fetchExecutiveReport: vi.fn(),
  fetchRegisterReport: vi.fn(),
}));

import * as api from '../../api/client';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ReportsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchReports).mockResolvedValue({ reports: [] } as never);
    vi.mocked(api.fetchDepartments).mockResolvedValue({ departments: [] } as never);
  });

  it('should render report type selector', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });
  });

  it('should show all report type options', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByText('Audit Report')).toBeInTheDocument();
    });
  });

  it('should change report type', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('Audit Report');
    fireEvent.change(select, { target: { value: 'executive-summary' } });

    expect(screen.getByDisplayValue('Executive Summary')).toBeInTheDocument();
  });

  it('should render format selector', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByDisplayValue(/json/i)).toBeInTheDocument();
    });
  });

  it('should show generate button', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getAllByText(/generate/i).length).toBeGreaterThan(0);
    });
  });

  it('should render with reviewed prop', async () => {
    renderWithProviders(
      <ReportsTab reviewed={new Set(['a1'])} onMarkReviewed={vi.fn()} onMarkAllReviewed={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });
  });

  it('should show existing reports list', async () => {
    vi.mocked(api.fetchReports).mockResolvedValue({
      reports: [
        {
          id: 'rpt1',
          title: 'Test Report',
          type: 'audit-report',
          format: 'json',
          generatedAt: Date.now(),
          entryCount: 42,
          status: 'complete',
        },
      ],
    } as never);

    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByText('Test Report')).toBeInTheDocument();
    });
    expect(screen.getByText(/42 entries/)).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('should show no reports message when empty', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByText('No reports generated yet')).toBeInTheDocument();
    });
  });

  it('should change to department-scorecard and show department selector', async () => {
    vi.mocked(api.fetchDepartments).mockResolvedValue({
      items: [
        { id: 'dept1', name: 'Engineering' },
        { id: 'dept2', name: 'Finance' },
      ],
    } as never);

    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });

    const typeSelect = screen.getByTestId('report-type-select');
    fireEvent.change(typeSelect, { target: { value: 'department-scorecard' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Department Scorecard')).toBeInTheDocument();
    });
    // Department selector should now be visible
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Select department...')).toBeInTheDocument();
  });

  it('should update format options when changing report type', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });

    // Default type is audit-report with json, html, csv
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('HTML')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();

    // Switch to audit-export which has jsonl, csv, syslog
    const typeSelect = screen.getByTestId('report-type-select');
    fireEvent.change(typeSelect, { target: { value: 'audit-export' } });

    expect(screen.getByText('JSONL')).toBeInTheDocument();
    expect(screen.getByText('SYSLOG')).toBeInTheDocument();
  });

  it('should change to register-report and show optional department', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });

    const typeSelect = screen.getByTestId('report-type-select');
    fireEvent.change(typeSelect, { target: { value: 'register-report' } });

    expect(screen.getByText(/optional/i)).toBeInTheDocument();
  });

  it('should change format', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });

    const formatSelect = screen.getByTestId('report-format-select');
    fireEvent.change(formatSelect, { target: { value: 'csv' } });

    expect(screen.getByDisplayValue('CSV')).toBeInTheDocument();
  });

  it('should click generate button for audit report', async () => {
    vi.mocked(api.generateReport).mockResolvedValue({} as never);

    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByText('Generate')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(api.generateReport).toHaveBeenCalled();
    });
  });

  it('should trigger generate for audit-export type', async () => {
    vi.mocked(api.exportAuditLog).mockResolvedValue(new Blob(['data']) as never);

    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('report-type-select')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('report-type-select'), {
      target: { value: 'audit-export' },
    });
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(api.exportAuditLog).toHaveBeenCalled();
    });
  });

  it('should trigger generate for executive-summary type', async () => {
    vi.mocked(api.fetchExecutiveReport).mockResolvedValue('report content' as never);

    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('report-type-select')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('report-type-select'), {
      target: { value: 'executive-summary' },
    });
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(api.fetchExecutiveReport).toHaveBeenCalled();
    });
  });

  it('should click download on existing report', async () => {
    vi.mocked(api.fetchReports).mockResolvedValue({
      reports: [
        {
          id: 'rpt1',
          title: 'Test Report',
          type: 'audit-report',
          format: 'json',
          generatedAt: Date.now(),
          entryCount: 10,
          status: 'complete',
        },
      ],
    } as never);
    vi.mocked(api.downloadReport).mockResolvedValue(new Blob(['{}']) as never);

    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByText('Test Report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(api.downloadReport).toHaveBeenCalledWith('rpt1');
    });
  });

  it('should show Generate Report heading', async () => {
    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      expect(screen.getByText('Generate Report')).toBeInTheDocument();
    });
    expect(screen.getByText('Generated Reports')).toBeInTheDocument();
  });
});
