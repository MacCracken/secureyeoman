// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DepartmentalRiskTab } from './DepartmentalRiskTab';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchDepartments: vi.fn(),
    fetchDepartmentScorecard: vi.fn(),
    fetchHeatmap: vi.fn(),
    fetchRiskSummary: vi.fn(),
    fetchRegisterEntries: vi.fn(),
    createDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    createRegisterEntry: vi.fn(),
    updateRegisterEntry: vi.fn(),
    deleteRegisterEntry: vi.fn(),
    snapshotDepartment: vi.fn(),
    fetchExecutiveReport: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchDepartments = vi.mocked(api.fetchDepartments);
const mockFetchHeatmap = vi.mocked(api.fetchHeatmap);
const mockFetchRiskSummary = vi.mocked(api.fetchRiskSummary);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DepartmentalRiskTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DepartmentalRiskTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchDepartments.mockResolvedValue({ items: [] } as any);
    mockFetchHeatmap.mockResolvedValue({ cells: [] } as any);
    mockFetchRiskSummary.mockResolvedValue(null as any);
  });

  // ── Sub-tab navigation ──────────────────────────────────────────

  it('renders Business Risks and Department Risks sub-tabs', () => {
    renderComponent();
    expect(screen.getByText('Business Risks')).toBeInTheDocument();
    expect(screen.getByText('Department Risks')).toBeInTheDocument();
  });

  it('defaults to Business Risks view', () => {
    renderComponent();
    expect(screen.getByText('No risk summary data available yet.')).toBeInTheDocument();
  });

  it('switches to Department Risks view on click', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Department Risks'));
    await waitFor(() => {
      expect(screen.getByText('Departments')).toBeInTheDocument();
    });
  });

  // ── Business Risks (C-Suite) ────────────────────────────────────

  it('shows empty state when no risk summary', () => {
    renderComponent();
    expect(screen.getByText('No risk summary data available yet.')).toBeInTheDocument();
  });

  // ── Department Risks ────────────────────────────────────────────

  it('renders departments header on Department Risks tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Department Risks'));
    await waitFor(() => {
      expect(screen.getByText('Departments')).toBeInTheDocument();
    });
  });

  it('renders New department button on Department Risks tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Department Risks'));
    await waitFor(() => {
      expect(screen.getByText('New')).toBeInTheDocument();
    });
  });

  it('shows empty state when no departments', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Department Risks'));
    await waitFor(() => {
      expect(screen.getByText('No departments configured.')).toBeInTheDocument();
    });
  });

  it('shows "Select a department" prompt when none selected', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText('Department Risks'));
    await waitFor(() => {
      expect(screen.getByText('Select a department to view details')).toBeInTheDocument();
    });
  });

  it('renders department list', async () => {
    const user = userEvent.setup();
    mockFetchDepartments.mockResolvedValue({
      items: [
        { id: 'd1', name: 'Engineering' },
        { id: 'd2', name: 'Finance' },
      ],
    } as any);
    renderComponent();
    await user.click(screen.getByText('Department Risks'));
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
      expect(screen.getByText('Finance')).toBeInTheDocument();
    });
  });

  it('shows department detail when department is selected', async () => {
    const user = userEvent.setup();
    mockFetchDepartments.mockResolvedValue({
      items: [{ id: 'd1', name: 'Engineering' }],
    } as any);
    vi.mocked(api.fetchDepartmentScorecard).mockResolvedValue({
      scorecard: { department: { name: 'Engineering' }, latestScore: 50, topRisks: [] },
    } as any);
    vi.mocked(api.fetchRegisterEntries).mockResolvedValue({ items: [] } as any);
    renderComponent();
    await user.click(screen.getByText('Department Risks'));
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Engineering'));
    await waitFor(() => {
      expect(screen.getByText('Risk')).toBeInTheDocument();
      expect(screen.getByText('Intent')).toBeInTheDocument();
    });
  });
});
