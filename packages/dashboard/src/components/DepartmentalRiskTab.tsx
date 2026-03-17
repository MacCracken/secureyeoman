/**
 * DepartmentalRiskTab — Extracted from RiskAssessmentTab (Phase 111)
 *
 * Two sub-views switchable via tabs:
 *   - Business Risks (C-Suite): Executive summary + org-wide heatmap
 *   - Department Risks: Per-department scorecard, register, appetite, objectives
 */

import { useState, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Loader2, RefreshCw, Building, Briefcase, Building2 } from 'lucide-react';
import {
  fetchDepartments,
  fetchDepartmentScorecard,
  fetchHeatmap,
  fetchRiskSummary,
  fetchRegisterEntries,
  createDepartment,
  updateDepartment,
  createRegisterEntry,
  updateRegisterEntry,
  deleteRegisterEntry,
  snapshotDepartment,
} from '../api/client';

// Lazy-loaded departmental risk components
const AppetiteRadarChart = lazy(() =>
  import('./risk/AppetiteRadarChart').then((m) => ({
    default: m.AppetiteRadarChart ?? (m as any).default,
  }))
);
const MitigationPlansPanel = lazy(() =>
  import('./risk/MitigationPlansPanel').then((m) => ({
    default: m.MitigationPlansPanel ?? (m as any).default,
  }))
);
const ObjectivesEditor = lazy(() =>
  import('./risk/ObjectivesEditor').then((m) => ({
    default: m.ObjectivesEditor ?? (m as any).default,
  }))
);
const DepartmentScorecardPanel = lazy(() =>
  import('./risk/DepartmentScorecardPanel').then((m) => ({
    default: m.DepartmentScorecardPanel ?? (m as any).default,
  }))
);
const RiskRegisterTable = lazy(() =>
  import('./risk/RiskRegisterTable').then((m) => ({
    default: m.RiskRegisterTable ?? (m as any).default,
  }))
);
const RiskTrendChart = lazy(() =>
  import('./risk/RiskTrendChart').then((m) => ({ default: m.RiskTrendChart ?? (m as any).default }))
);
const EnhancedHeatmap = lazy(() =>
  import('./risk/EnhancedHeatmap').then((m) => ({
    default: m.EnhancedHeatmap ?? (m as any).default,
  }))
);
const ExecutiveSummaryPanel = lazy(() =>
  import('./risk/ExecutiveSummaryPanel').then((m) => ({
    default: m.ExecutiveSummaryPanel ?? (m as any).default,
  }))
);
const DepartmentFormModal = lazy(() =>
  import('./risk/DepartmentFormModal').then((m) => ({
    default: m.DepartmentFormModal ?? (m as any).default,
  }))
);
const RegisterEntryFormModal = lazy(() =>
  import('./risk/RegisterEntryFormModal').then((m) => ({
    default: m.RegisterEntryFormModal ?? (m as any).default,
  }))
);

type RiskView = 'business' | 'departments';
type DeptView = 'intent' | 'risk';

export function DepartmentalRiskTab() {
  const qc = useQueryClient();
  const [riskView, setRiskView] = useState<RiskView>('business');
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [deptDetailView, setDeptDetailView] = useState<DeptView>('risk');
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);

  const { data: deptsData, isLoading: deptsLoading } = useQuery({
    queryKey: ['risk-departments'],
    queryFn: () => fetchDepartments(),
    refetchInterval: 15_000,
  });

  const { data: scorecardData, isLoading: scorecardLoading } = useQuery({
    queryKey: ['risk-department-scorecard', selectedDept],
    queryFn: () => (selectedDept ? fetchDepartmentScorecard(selectedDept) : null),
    enabled: !!selectedDept,
  });

  const { data: heatmapData } = useQuery({
    queryKey: ['risk-heatmap'],
    queryFn: () => fetchHeatmap(),
    refetchInterval: 30_000,
  });

  const { data: summaryData } = useQuery({
    queryKey: ['risk-summary'],
    queryFn: () => fetchRiskSummary(),
    refetchInterval: 30_000,
  });

  const { data: registerData } = useQuery({
    queryKey: ['risk-register', selectedDept],
    queryFn: () =>
      selectedDept ? fetchRegisterEntries({ departmentId: selectedDept, limit: 100 }) : null,
    enabled: !!selectedDept,
  });

  const departments = deptsData?.items ?? [];
  const scorecard = scorecardData?.scorecard;
  const heatmap = heatmapData?.cells ?? [];
  const summary = summaryData?.summary ?? summaryData;
  const registerEntries = (registerData as any)?.items ?? [];

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['risk-departments'] });
    void qc.invalidateQueries({ queryKey: ['risk-department-scorecard'] });
    void qc.invalidateQueries({ queryKey: ['risk-heatmap'] });
    void qc.invalidateQueries({ queryKey: ['risk-summary'] });
    void qc.invalidateQueries({ queryKey: ['risk-register'] });
  };

  const handleDeptSubmit = async (data: any) => {
    if (editingDept?.id) {
      await updateDepartment(editingDept.id, data);
    } else {
      await createDepartment(data);
    }
    setShowDeptModal(false);
    setEditingDept(null);
    invalidateAll();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await updateRegisterEntry(id, { status: newStatus });
    invalidateAll();
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteRegisterEntry(id);
    invalidateAll();
  };

  const handleAddEntry = () => {
    setShowEntryModal(true);
  };

  const handleEntrySubmit = (data: {
    title: string;
    category: string;
    severity: string;
    likelihood: number;
    impact: number;
    owner?: string;
    dueDate?: string;
    description?: string;
  }) => {
    if (!selectedDept) return;
    void createRegisterEntry({
      departmentId: selectedDept,
      title: data.title,
      category: data.category as any,
      severity: data.severity as any,
      likelihood: data.likelihood,
      impact: data.impact,
      owner: data.owner,
      description: data.description,
    }).then(() => {
      setShowEntryModal(false);
      invalidateAll();
    });
  };

  const handleAppetiteChange = async (appetite: any) => {
    if (!selectedDept) return;
    await updateDepartment(selectedDept, { riskAppetite: appetite });
    invalidateAll();
  };

  const handleObjectivesChange = async (objectives: any[]) => {
    if (!selectedDept) return;
    await updateDepartment(selectedDept, { objectives });
    invalidateAll();
  };

  const SUB_TABS: { id: RiskView; label: string; icon: React.ReactNode }[] = [
    { id: 'business', label: 'Business Risks', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'departments', label: 'Department Risks', icon: <Building2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      <div className="flex gap-1 border-b border-border">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setRiskView(tab.id);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              riskView === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Business Risks (C-Suite) ── */}
      {riskView === 'business' && (
        <div className="space-y-4">
          {/* Executive Summary */}
          {summary ? (
            <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin" />}>
              <ExecutiveSummaryPanel summary={summary as any} />
            </Suspense>
          ) : (
            <div className="card p-6 text-center text-muted-foreground">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No risk summary data available yet.</p>
            </div>
          )}

          {/* Org-wide Heatmap */}
          {heatmap.length > 0 && (
            <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin" />}>
              <EnhancedHeatmap
                cells={heatmap}
                onCellClick={(cell: any) => {
                  setSelectedDept(cell.departmentId);
                  setRiskView('departments');
                }}
              />
            </Suspense>
          )}
        </div>
      )}

      {/* ── Department Risks ── */}
      {riskView === 'departments' && (
        <div className="space-y-4">
          <div className="flex gap-4">
            {/* Department list */}
            <div className="w-64 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Departments
                </h3>
                <button
                  className="btn btn-ghost text-xs flex items-center gap-1"
                  onClick={() => {
                    setEditingDept(null);
                    setShowDeptModal(true);
                  }}
                >
                  <Plus className="w-3 h-3 inline -mt-0.5" /> New
                </button>
              </div>
              {deptsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {departments.map((d: any) => (
                <div key={d.id} className="flex items-center gap-1">
                  <button
                    className={`flex-1 text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedDept === d.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-base-200 text-foreground'
                    }`}
                    onClick={() => {
                      setSelectedDept(d.id);
                    }}
                  >
                    {d.name}
                  </button>
                  <button
                    className="p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingDept(d);
                      setShowDeptModal(true);
                    }}
                    title="Edit"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {!deptsLoading && departments.length === 0 && (
                <p className="text-xs text-muted-foreground">No departments configured.</p>
              )}
            </div>

            {/* Detail pane */}
            <div className="flex-1 min-w-0">
              {!selectedDept && (
                <div className="text-center py-12 text-muted-foreground">
                  <Building className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Select a department to view details</p>
                </div>
              )}

              {selectedDept && (
                <div className="space-y-4">
                  {/* View toggle + snapshot button */}
                  <div className="flex items-center gap-2">
                    <button
                      className={`px-3 py-1 text-sm rounded ${deptDetailView === 'intent' ? 'bg-primary text-primary-content' : 'bg-base-200'}`}
                      onClick={() => {
                        setDeptDetailView('intent');
                      }}
                    >
                      Intent
                    </button>
                    <button
                      className={`px-3 py-1 text-sm rounded ${deptDetailView === 'risk' ? 'bg-primary text-primary-content' : 'bg-base-200'}`}
                      onClick={() => {
                        setDeptDetailView('risk');
                      }}
                    >
                      Risk
                    </button>
                    <button
                      className="ml-auto text-xs px-2 py-1 border border-border rounded hover:bg-base-200"
                      onClick={() => {
                        void snapshotDepartment(selectedDept).then(() => {
                          invalidateAll();
                        });
                      }}
                    >
                      <RefreshCw className="w-3 h-3 inline -mt-0.5 mr-1" />
                      Snapshot
                    </button>
                  </div>

                  {scorecardLoading && <Loader2 className="w-5 h-5 animate-spin" />}

                  {/* Intent view */}
                  {scorecard && deptDetailView === 'intent' && (
                    <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin" />}>
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">{scorecard.department?.name}</h3>
                        {scorecard.department?.mission && (
                          <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase">
                              Mission
                            </span>
                            <p className="text-sm mt-1">{scorecard.department.mission}</p>
                          </div>
                        )}

                        <AppetiteRadarChart
                          department={scorecard.department}
                          latestScore={scorecard.latestScore}
                          onAppetiteChange={(appetite) => void handleAppetiteChange(appetite)}
                        />

                        <ObjectivesEditor
                          objectives={scorecard.department?.objectives ?? []}
                          onChange={(objectives) => void handleObjectivesChange(objectives)}
                        />

                        <MitigationPlansPanel
                          mitigations={
                            scorecard.topRisks?.flatMap((r: any) => r.mitigations ?? []) ?? []
                          }
                        />
                      </div>
                    </Suspense>
                  )}

                  {/* Risk view */}
                  {scorecard && deptDetailView === 'risk' && (
                    <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin" />}>
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">{scorecard.department?.name}</h3>

                        <DepartmentScorecardPanel scorecard={scorecard} />

                        <RiskTrendChart departmentId={selectedDept} />

                        <RiskRegisterTable
                          entries={registerEntries}
                          onStatusChange={(id, status) => void handleStatusChange(id, status)}
                          onDelete={(id) => void handleDeleteEntry(id)}
                          onAdd={handleAddEntry}
                        />
                      </div>
                    </Suspense>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Department Form Modal */}
      {showDeptModal && (
        <Suspense fallback={null}>
          <DepartmentFormModal
            open={showDeptModal}
            onClose={() => {
              setShowDeptModal(false);
              setEditingDept(null);
            }}
            onSubmit={(data) => void handleDeptSubmit(data)}
            department={editingDept}
          />
        </Suspense>
      )}

      {/* Register Entry Form Modal */}
      {showEntryModal && (
        <Suspense fallback={null}>
          <RegisterEntryFormModal
            open={showEntryModal}
            onClose={() => {
              setShowEntryModal(false);
            }}
            onSubmit={handleEntrySubmit}
          />
        </Suspense>
      )}
    </div>
  );
}
