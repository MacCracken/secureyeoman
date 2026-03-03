/**
 * ExecutiveSummaryPanel -- KPI cards showing aggregate risk stats plus a
 * department breakdown table and an export dropdown (JSON/CSV/HTML/Markdown).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Shield,
  AlertTriangle,
  Download,
  Building2,
  AlertCircle,
  Clock,
  ShieldAlert,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import { fetchExecutiveReport } from '../../api/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DepartmentSummary {
  id: string;
  name: string;
  score: number;
  openRisks: number;
  criticalRisks: number;
  appetiteBreaches: number;
}

interface ExecutiveSummary {
  totalDepartments: number;
  totalOpenRisks: number;
  totalOverdueRisks: number;
  totalCriticalRisks: number;
  appetiteBreaches: number;
  averageScore: number;
  departments: DepartmentSummary[];
}

interface ExecutiveSummaryPanelProps {
  summary: ExecutiveSummary;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EXPORT_FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreLevel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'Critical', color: 'text-red-600' };
  if (score >= 50) return { label: 'High', color: 'text-orange-600' };
  if (score >= 25) return { label: 'Medium', color: 'text-yellow-600' };
  return { label: 'Low', color: 'text-green-600' };
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color = 'text-foreground',
  valueColor,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-background border border-border rounded-lg p-4 flex items-start gap-3">
      <div className={`shrink-0 mt-0.5 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className={`text-2xl font-bold ${valueColor ?? ''}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Export Dropdown ─────────────────────────────────────────────────────────

function ExportDropdown() {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
    };
  }, [open]);

  const handleExport = useCallback(async (format: string) => {
    setExporting(true);
    setOpen(false);
    try {
      const result = await fetchExecutiveReport(format);
      // Trigger a download
      const contentType =
        format === 'json'
          ? 'application/json'
          : format === 'csv'
            ? 'text/csv'
            : format === 'html'
              ? 'text/html'
              : 'text/markdown';
      const extension =
        format === 'json' ? 'json' : format === 'csv' ? 'csv' : format === 'html' ? 'html' : 'md';
      const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `executive-risk-report.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently handle -- in a real app we would surface a toast
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div ref={dropRef} className="relative">
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded hover:bg-muted transition-colors disabled:opacity-50"
        onClick={() => {
          setOpen((o) => !o);
        }}
        disabled={exporting}
      >
        <Download className="w-4 h-4" />
        {exporting ? 'Exporting...' : 'Export'}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-background border border-border rounded-md shadow-lg z-20 py-1">
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.value}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              onClick={() => handleExport(fmt.value)}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ExecutiveSummaryPanel({ summary }: ExecutiveSummaryPanelProps) {
  const avgLevel = scoreLevel(summary.averageScore);

  return (
    <div className="space-y-6" data-testid="executive-summary-panel">
      {/* Header + Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Executive Risk Summary</h3>
        </div>
        <ExportDropdown />
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Departments"
          value={summary.totalDepartments}
          icon={Building2}
          color="text-blue-500"
        />
        <KpiCard
          label="Open Risks"
          value={summary.totalOpenRisks}
          icon={AlertCircle}
          color="text-yellow-500"
        />
        <KpiCard
          label="Overdue Risks"
          value={summary.totalOverdueRisks}
          icon={Clock}
          color="text-orange-500"
          valueColor={summary.totalOverdueRisks > 0 ? 'text-orange-600' : undefined}
        />
        <KpiCard
          label="Critical Risks"
          value={summary.totalCriticalRisks}
          icon={ShieldAlert}
          color="text-red-500"
          valueColor={summary.totalCriticalRisks > 0 ? 'text-red-600' : undefined}
        />
        <KpiCard
          label="Appetite Breaches"
          value={summary.appetiteBreaches}
          icon={AlertTriangle}
          color="text-red-600"
          valueColor={summary.appetiteBreaches > 0 ? 'text-red-600' : undefined}
        />
        <KpiCard
          label="Average Score"
          value={summary.averageScore.toFixed(1)}
          icon={BarChart3}
          color={avgLevel.color}
          valueColor={avgLevel.color}
        />
      </div>

      {/* Department Breakdown */}
      {summary.departments.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Department Breakdown
          </h4>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Department
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Score
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Open
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Critical
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Breaches
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Level
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.departments.map((dept) => {
                  const level = scoreLevel(dept.score);
                  return (
                    <tr key={dept.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium">{dept.name}</td>
                      <td className="py-2 px-3 text-right font-semibold">
                        {dept.score.toFixed(1)}
                      </td>
                      <td className="py-2 px-3 text-right">{dept.openRisks}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={dept.criticalRisks > 0 ? 'text-red-600 font-medium' : ''}>
                          {dept.criticalRisks}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span
                          className={dept.appetiteBreaches > 0 ? 'text-red-600 font-medium' : ''}
                        >
                          {dept.appetiteBreaches}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`text-xs font-medium ${level.color}`}>{level.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary.departments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No department data available.
        </div>
      )}
    </div>
  );
}
