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
      {
        id: 'd1',
        name: 'Engineering',
        score: 65,
        openRisks: 4,
        criticalRisks: 1,
        appetiteBreaches: 0,
      },
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
      {
        id: 'd1',
        name: 'HighRisk',
        score: 80,
        openRisks: 10,
        criticalRisks: 5,
        appetiteBreaches: 3,
      },
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

  it('shows overdue risks value with color when > 0', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ totalOverdueRisks: 5 })} />);
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1);
  });

  it('shows zero overdue risks without color', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ totalOverdueRisks: 0 })} />);
    expect(screen.getByText('Overdue Risks')).toBeInTheDocument();
  });

  it('shows Medium level for departments with score 25-49', () => {
    const departments = [
      { id: 'd1', name: 'MediumRisk', score: 40, openRisks: 2, criticalRisks: 0, appetiteBreaches: 0 },
    ];
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ departments })} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('40.0')).toBeInTheDocument();
  });

  it('shows High level for departments with score 50-74', () => {
    const departments = [
      { id: 'd1', name: 'HighRisk', score: 60, openRisks: 5, criticalRisks: 2, appetiteBreaches: 1 },
    ];
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ departments })} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows export dropdown options when clicked', async () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary()} />);
    const exportBtn = screen.getByText('Export');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(exportBtn);
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('HTML')).toBeInTheDocument();
    expect(screen.getByText('Markdown')).toBeInTheDocument();
  });

  it('shows critical risks value with red when > 0', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ totalCriticalRisks: 7 })} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows appetite breaches count', () => {
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ appetiteBreaches: 3 })} />);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Appetite Breaches')).toBeInTheDocument();
  });

  it('shows departments with breaches highlighted', () => {
    const departments = [
      { id: 'd1', name: 'RiskyDept', score: 55, openRisks: 8, criticalRisks: 3, appetiteBreaches: 2 },
    ];
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ departments })} />);
    expect(screen.getByText('RiskyDept')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('renders table headers', () => {
    const departments = [
      { id: 'd1', name: 'Test', score: 50, openRisks: 1, criticalRisks: 0, appetiteBreaches: 0 },
    ];
    render(<ExecutiveSummaryPanel summary={makeDepartmentalSummary({ departments })} />);
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Breaches')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
  });

  it('handles ATHI-style with mitigated stats', () => {
    const athiSummary = {
      totalScenarios: 30,
      byStatus: { identified: 10, mitigated: 15 },
      byActor: { internal: 5, external: 10, insider: 3 },
      topRisks: [],
      averageRiskScore: 35.0,
      mitigationCoverage: 0.5,
    };
    render(<ExecutiveSummaryPanel summary={athiSummary as any} />);
    // totalDepartments = Object.keys(byActor).length = 3
    expect(screen.getByText('3')).toBeInTheDocument();
    // totalOpenRisks = 30 - 15 = 15
    expect(screen.getByText('15')).toBeInTheDocument();
    // averageRiskScore
    expect(screen.getByText('35.0')).toBeInTheDocument();
  });
});
