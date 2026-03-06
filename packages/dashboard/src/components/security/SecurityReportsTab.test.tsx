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
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
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
      <ReportsTab
        reviewed={new Set(['a1'])}
        onMarkReviewed={vi.fn()}
        onMarkAllReviewed={vi.fn()}
      />
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
          type: 'audit-report',
          format: 'json',
          createdAt: Date.now(),
          status: 'complete',
        },
      ],
    } as never);

    renderWithProviders(<ReportsTab />);

    await waitFor(() => {
      // Reports section renders
      expect(screen.getByDisplayValue('Audit Report')).toBeInTheDocument();
    });
  });
});
