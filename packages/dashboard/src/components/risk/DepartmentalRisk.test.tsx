/**
 * Departmental Risk Components Tests — Phase 111-F
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock all API functions
vi.mock('../../api/client', () => ({
  fetchDepartments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchDepartmentScorecard: vi.fn().mockResolvedValue(null),
  fetchHeatmap: vi.fn().mockResolvedValue({ cells: [] }),
  fetchRiskSummary: vi.fn().mockResolvedValue({ summary: null }),
  fetchRegisterEntries: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchRiskTrend: vi.fn().mockResolvedValue([]),
  fetchExecutiveReport: vi.fn().mockResolvedValue(''),
  createDepartment: vi.fn().mockResolvedValue({}),
  updateDepartment: vi.fn().mockResolvedValue({}),
  createRegisterEntry: vi.fn().mockResolvedValue({}),
  updateRegisterEntry: vi.fn().mockResolvedValue({}),
  deleteRegisterEntry: vi.fn().mockResolvedValue({}),
  snapshotDepartment: vi.fn().mockResolvedValue({}),
  fetchDepartmentReport: vi.fn().mockResolvedValue(''),
  fetchRegisterReport: vi.fn().mockResolvedValue(''),
}));

// Mock recharts to avoid SVG rendering issues in tests
vi.mock('recharts', () => ({
  RadarChart: ({ children }: any) => <div data-testid="radar-chart">{children}</div>,
  Radar: () => <div data-testid="radar" />,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ReferenceLine: () => <div />,
  Legend: () => <div />,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div />,
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ── AppetiteRadarChart ──────────────────────────────────────

describe('AppetiteRadarChart', () => {
  let AppetiteRadarChart: any;

  beforeEach(async () => {
    const mod = await import('./AppetiteRadarChart');
    AppetiteRadarChart = mod.AppetiteRadarChart ?? mod.default;
  });

  it('renders radar chart with department data', () => {
    const dept = { riskAppetite: { security: 50, operational: 40, financial: 60, compliance: 45, reputational: 55 } };
    const score = { domainScores: { security: 30, operational: 20, financial: 40, compliance: 50, reputational: 35 } };
    render(<AppetiteRadarChart department={dept} latestScore={score} />);
    expect(screen.getByTestId('radar-chart')).toBeTruthy();
  });

  it('renders preset buttons', () => {
    const dept = { riskAppetite: { security: 50 } };
    render(<AppetiteRadarChart department={dept} latestScore={null} onAppetiteChange={vi.fn()} />);
    expect(screen.getByText(/conservative/i)).toBeTruthy();
    expect(screen.getByText(/moderate/i)).toBeTruthy();
    expect(screen.getByText(/aggressive/i)).toBeTruthy();
  });

  it('calls onAppetiteChange when preset clicked', () => {
    const onChange = vi.fn();
    const dept = { riskAppetite: {} };
    render(<AppetiteRadarChart department={dept} latestScore={null} onAppetiteChange={onChange} />);
    fireEvent.click(screen.getByText(/conservative/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ security: 30 }));
  });
});

// ── MitigationPlansPanel ────────────────────────────────────

describe('MitigationPlansPanel', () => {
  let MitigationPlansPanel: any;

  beforeEach(async () => {
    const mod = await import('./MitigationPlansPanel');
    MitigationPlansPanel = mod.MitigationPlansPanel ?? mod.default;
  });

  it('renders empty state', () => {
    render(<MitigationPlansPanel mitigations={[]} />);
    expect(screen.getByText(/no mitigation/i)).toBeTruthy();
  });

  it('groups mitigations by status', () => {
    const mits = [
      { id: '1', description: 'Plan A', status: 'planned', owner: 'alice' },
      { id: '2', description: 'Plan B', status: 'implemented', owner: 'bob' },
    ];
    render(<MitigationPlansPanel mitigations={mits} />);
    expect(screen.getByText('Plan A')).toBeTruthy();
    expect(screen.getByText('Plan B')).toBeTruthy();
  });

  it('shows progress bar', () => {
    const mits = [
      { id: '1', description: 'A', status: 'implemented' },
      { id: '2', description: 'B', status: 'planned' },
    ];
    render(<MitigationPlansPanel mitigations={mits} />);
    // 50% complete (1 of 2 implemented/verified)
    expect(screen.getByText(/50%/)).toBeTruthy();
  });
});

// ── ObjectivesEditor ────────────────────────────────────────

describe('ObjectivesEditor', () => {
  let ObjectivesEditor: any;

  beforeEach(async () => {
    const mod = await import('./ObjectivesEditor');
    ObjectivesEditor = mod.ObjectivesEditor ?? mod.default;
  });

  it('renders objectives list', () => {
    const objs = [
      { title: 'Reduce risk', description: 'Lower exposure', priority: 'high' as const },
      { title: 'Train staff', description: '', priority: 'medium' as const },
    ];
    render(<ObjectivesEditor objectives={objs} onChange={vi.fn()} />);
    expect(screen.getByText('Reduce risk')).toBeTruthy();
    expect(screen.getByText('Train staff')).toBeTruthy();
  });

  it('shows add button', () => {
    render(<ObjectivesEditor objectives={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add/i })).toBeTruthy();
  });
});

// ── DepartmentScorecardPanel ────────────────────────────────

describe('DepartmentScorecardPanel', () => {
  let DepartmentScorecardPanel: any;

  beforeEach(async () => {
    const mod = await import('./DepartmentScorecardPanel');
    DepartmentScorecardPanel = mod.DepartmentScorecardPanel ?? mod.default;
  });

  it('renders bar chart with domain scores', () => {
    const scorecard = {
      latestScore: { overallScore: 45, domainScores: { security: 60, operational: 30 } },
      department: { riskAppetite: { security: 50, operational: 50 } },
    };
    render(<DepartmentScorecardPanel scorecard={scorecard} />);
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
  });

  it('shows empty state when no score', () => {
    const scorecard = { latestScore: null, department: { riskAppetite: {} } };
    render(<DepartmentScorecardPanel scorecard={scorecard} />);
    expect(screen.getByText(/no score/i)).toBeTruthy();
  });
});

// ── RiskRegisterTable ───────────────────────────────────────

describe('RiskRegisterTable', () => {
  let RiskRegisterTable: any;

  beforeEach(async () => {
    const mod = await import('./RiskRegisterTable');
    RiskRegisterTable = mod.RiskRegisterTable ?? mod.default;
  });

  it('renders entries in table', () => {
    const entries = [
      { id: 'r1', title: 'SQL Injection', category: 'security', severity: 'high', likelihood: 4, impact: 5, riskScore: 20, status: 'open', owner: 'alice', dueDate: null, mitigations: [], createdAt: Date.now(), updatedAt: Date.now() },
    ];
    render(<RiskRegisterTable entries={entries} onStatusChange={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText('SQL Injection')).toBeTruthy();
  });

  it('shows add risk button', () => {
    render(<RiskRegisterTable entries={[]} onStatusChange={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText(/add risk/i)).toBeTruthy();
  });

  it('shows empty state when no entries', () => {
    render(<RiskRegisterTable entries={[]} onStatusChange={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText(/no.*entries/i)).toBeTruthy();
  });
});

// ── RiskTrendChart ──────────────────────────────────────────

describe('RiskTrendChart', () => {
  let RiskTrendChart: any;

  beforeEach(async () => {
    const mod = await import('./RiskTrendChart');
    RiskTrendChart = mod.RiskTrendChart ?? mod.default;
  });

  it('renders with time range buttons', () => {
    render(<RiskTrendChart departmentId="d1" />, { wrapper: createWrapper() });
    expect(screen.getByText('30d')).toBeTruthy();
    expect(screen.getByText('90d')).toBeTruthy();
    expect(screen.getByText('180d')).toBeTruthy();
    expect(screen.getByText('365d')).toBeTruthy();
  });
});

// ── EnhancedHeatmap ─────────────────────────────────────────

describe('EnhancedHeatmap', () => {
  let EnhancedHeatmap: any;

  beforeEach(async () => {
    const mod = await import('./EnhancedHeatmap');
    EnhancedHeatmap = mod.EnhancedHeatmap ?? mod.default;
  });

  it('renders dept x domain grid', () => {
    const cells = [
      { departmentId: 'd1', departmentName: 'Engineering', domain: 'security', score: 60, threshold: 50, breached: true },
      { departmentId: 'd1', departmentName: 'Engineering', domain: 'operational', score: 20, threshold: 50, breached: false },
    ];
    render(<EnhancedHeatmap cells={cells} />);
    expect(screen.getByText('Engineering')).toBeTruthy();
  });

  it('renders empty state', () => {
    render(<EnhancedHeatmap cells={[]} />);
    expect(screen.getByText(/no.*data/i)).toBeTruthy();
  });

  it('calls onCellClick', () => {
    const onClick = vi.fn();
    const cells = [
      { departmentId: 'd1', departmentName: 'Eng', domain: 'security', score: 60, threshold: 50, breached: true },
    ];
    render(<EnhancedHeatmap cells={cells} onCellClick={onClick} />);
    const cell = screen.getByText('60');
    fireEvent.click(cell);
    expect(onClick).toHaveBeenCalled();
  });
});

// ── ExecutiveSummaryPanel ───────────────────────────────────

describe('ExecutiveSummaryPanel', () => {
  let ExecutiveSummaryPanel: any;

  beforeEach(async () => {
    const mod = await import('./ExecutiveSummaryPanel');
    ExecutiveSummaryPanel = mod.ExecutiveSummaryPanel ?? mod.default;
  });

  it('renders KPI cards', () => {
    const summary = {
      totalDepartments: 3,
      totalOpenRisks: 12,
      totalOverdueRisks: 2,
      totalCriticalRisks: 4,
      appetiteBreaches: 1,
      averageScore: 38,
      departments: [
        { id: 'd1', name: 'Eng', score: 42, openRisks: 5, criticalRisks: 2, appetiteBreaches: 1 },
      ],
    };
    render(<ExecutiveSummaryPanel summary={summary} />);
    expect(screen.getByText('3')).toBeTruthy(); // departments
    expect(screen.getByText('12')).toBeTruthy(); // open risks
  });

  it('shows department breakdown', () => {
    const summary = {
      totalDepartments: 1,
      totalOpenRisks: 5,
      totalOverdueRisks: 0,
      totalCriticalRisks: 0,
      appetiteBreaches: 0,
      averageScore: 42,
      departments: [
        { id: 'd1', name: 'Engineering', score: 42, openRisks: 5, criticalRisks: 0, appetiteBreaches: 0 },
      ],
    };
    render(<ExecutiveSummaryPanel summary={summary} />);
    expect(screen.getByText('Engineering')).toBeTruthy();
  });
});

// ── DepartmentFormModal ─────────────────────────────────────

describe('DepartmentFormModal', () => {
  let DepartmentFormModal: any;

  beforeEach(async () => {
    const mod = await import('./DepartmentFormModal');
    DepartmentFormModal = mod.DepartmentFormModal ?? mod.default;
  });

  it('renders create form when open', () => {
    render(<DepartmentFormModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /create department/i })).toBeTruthy();
  });

  it('renders edit form with pre-filled data', () => {
    const dept = { id: 'd1', name: 'Engineering', description: 'Dev team', mission: 'Build stuff' };
    render(<DepartmentFormModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} department={dept} />);
    const nameInput = screen.getByDisplayValue('Engineering');
    expect(nameInput).toBeTruthy();
  });

  it('does not render when closed', () => {
    const { container } = render(<DepartmentFormModal open={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows appetite sliders', () => {
    render(<DepartmentFormModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText(/risk appetite/i)).toBeTruthy();
  });

  it('shows preset buttons', () => {
    render(<DepartmentFormModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText(/conservative/i)).toBeTruthy();
    expect(screen.getByText(/moderate/i)).toBeTruthy();
    expect(screen.getByText(/aggressive/i)).toBeTruthy();
  });
});
