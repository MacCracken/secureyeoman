// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutiveSummaryPanel } from './ExecutiveSummaryPanel';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchExecutiveReport: vi.fn(),
  };
});

const makeDepartmentalSummary = (overrides = {}) => ({
  totalDepartments: 5,
  totalOpenRisks: 12,
  totalOverdueRisks: 3,
  totalCriticalRisks: 2,
  appetiteBreaches: 1,
  averageScore: 42.5,
  departments: [],
  ...overrides,
});

describe('ExecutiveSummaryPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the executive summary header', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary()} />);
    expect(screen.getByText('Executive Risk Summary')).toBeInTheDocument();
  });

  it('renders KPI cards with departmental summary data', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary()} />);
    expect(screen.getByText('Departments')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Open Risks')).toBeInTheDocument();
    expect(screen.getByText('Overdue Risks')).toBeInTheDocument();
    expect(screen.getByText('Critical Risks')).toBeInTheDocument();
    expect(screen.getByText('Appetite Breaches')).toBeInTheDocument();
    expect(screen.getByText('Average Score')).toBeInTheDocument();
    expect(screen.getByText('42.5')).toBeInTheDocument();
  });

  it('renders export button', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary()} />);
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('shows "No department data available" when departments empty', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ departments: [] })} />);
    expect(screen.getByText('No department data available.')).toBeInTheDocument();
  });

  it('renders department breakdown table when departments exist', () => {
    const departments = [
      { id: 'd1', name: 'Engineering', score: 65, openRisks: 4, criticalRisks: 1, appetiteBreaches: 0 },
      { id: 'd2', name: 'Finance', score: 30, openRisks: 2, criticalRisks: 0, appetiteBreaches: 1 },
    ];
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ departments })} />);
    expect(screen.getByText('Department Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('65.0')).toBeInTheDocument();
    expect(screen.getByText('30.0')).toBeInTheDocument();
  });

  it('shows score level labels for departments', () => {
    const departments = [
      { id: 'd1', name: 'HighRisk', score: 80, openRisks: 10, criticalRisks: 5, appetiteBreaches: 3 },
      { id: 'd2', name: 'LowRisk', score: 10, openRisks: 0, criticalRisks: 0, appetiteBreaches: 0 },
    ];
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ departments })} />);
    // "Critical" appears both as table header and level label
    expect(screen.getAllByText('Critical').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('handles ATHI-style summary', () => {
    const athiSummary = {
      totalScenarios: 20,
      byStatus: { identified: 5, mitigated: 10 },
      byActor: { internal: 8, external: 12 },
      topRisks: [],
      averageRiskScore: 55.0,
      mitigationCoverage: 0.75,
    };
    render(<ExecutiveSummaryPanel summary={athiSummary as any} />);
    expect(screen.getByText('Executive Risk Summary')).toBeInTheDocument();
    expect(screen.getByText('55.0')).toBeInTheDocument();
  });

  it('renders with data-testid', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary()} />);
    expect(screen.getByTestId('executive-summary-panel')).toBeInTheDocument();
  });
});
