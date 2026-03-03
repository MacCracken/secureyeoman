/**
 * RiskRegisterTable -- Sortable, filterable table of risk register entries with
 * expandable rows, inline status updates, and a filter bar.
 */

import { useState, useMemo, useCallback, Fragment } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  User,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MitigationItem {
  id?: string;
  description: string;
  status: string;
  owner?: string;
  dueDate?: string;
  effectiveness?: string;
}

interface RegisterEntry {
  id: string;
  departmentId: string;
  title: string;
  description?: string | null;
  category: string;
  severity: string;
  likelihood: number;
  impact: number;
  riskScore?: number;
  status: string;
  owner?: string | null;
  dueDate?: string | null;
  mitigations?: MitigationItem[];
  source?: string | null;
  createdAt: number;
  updatedAt: number;
}

type SortField = 'title' | 'category' | 'severity' | 'likelihood' | 'impact' | 'riskScore' | 'status' | 'owner' | 'dueDate';
type SortDir = 'asc' | 'desc';

interface RiskRegisterTableProps {
  entries: RegisterEntry[];
  onStatusChange: (id: string, newStatus: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUSES = ['open', 'in_progress', 'mitigated', 'accepted', 'closed', 'transferred'] as const;
const CATEGORIES = ['security', 'operational', 'financial', 'compliance', 'reputational', 'strategic', 'technology', 'third_party', 'environmental', 'other'] as const;
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  info: 'bg-gray-100 text-gray-600 border-gray-200',
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const MITIGATION_STATUS_COLORS: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  implemented: 'bg-green-100 text-green-700',
  verified: 'bg-emerald-100 text-emerald-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  try {
    return new Date(dueDate).getTime() < Date.now();
  } catch {
    return false;
  }
}

function compareField(a: RegisterEntry, b: RegisterEntry, field: SortField, dir: SortDir): number {
  let cmp = 0;
  switch (field) {
    case 'title':
      cmp = a.title.localeCompare(b.title);
      break;
    case 'category':
      cmp = a.category.localeCompare(b.category);
      break;
    case 'severity':
      cmp = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      break;
    case 'likelihood':
      cmp = a.likelihood - b.likelihood;
      break;
    case 'impact':
      cmp = a.impact - b.impact;
      break;
    case 'riskScore':
      cmp = (a.riskScore ?? 0) - (b.riskScore ?? 0);
      break;
    case 'status':
      cmp = a.status.localeCompare(b.status);
      break;
    case 'owner':
      cmp = (a.owner ?? '').localeCompare(b.owner ?? '');
      break;
    case 'dueDate':
      cmp = (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
      break;
  }
  return dir === 'asc' ? cmp : -cmp;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const cls = SEVERITY_COLORS[severity] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {formatLabel(severity)}
    </span>
  );
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th
      className="py-2 px-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active && (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </div>
    </th>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RiskRegisterTable({ entries, onStatusChange, onDelete, onAdd }: RiskRegisterTableProps) {
  const [sortField, setSortField] = useState<SortField>('riskScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = entries;
    if (filterStatus) result = result.filter((e) => e.status === filterStatus);
    if (filterCategory) result = result.filter((e) => e.category === filterCategory);
    if (filterSeverity) result = result.filter((e) => e.severity === filterSeverity);
    return result;
  }, [entries, filterStatus, filterCategory, filterSeverity]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareField(a, b, sortField, sortDir)),
    [filtered, sortField, sortDir],
  );

  return (
    <div className="space-y-4" data-testid="risk-register-table">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {formatLabel(s)}
            </option>
          ))}
        </select>

        <select
          className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {formatLabel(c)}
            </option>
          ))}
        </select>

        <select
          className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground"
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          aria-label="Filter by severity"
        >
          <option value="">All Severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {formatLabel(s)}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground">
          {sorted.length} of {entries.length} entries
        </span>

        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded hover:bg-primary/90 transition-colors"
          onClick={onAdd}
        >
          <Plus className="w-4 h-4" />
          Add Risk
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8" />
              <SortHeader label="Title" field="title" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Category" field="category" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Severity" field="severity" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Likelihood" field="likelihood" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Impact" field="impact" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Score" field="riskScore" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Owner" field="owner" current={sortField} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Due Date" field="dueDate" current={sortField} dir={sortDir} onSort={handleSort} />
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((entry) => {
              const expanded = expandedIds.has(entry.id);
              const overdue = isOverdue(entry.dueDate) && entry.status !== 'closed' && entry.status !== 'mitigated';
              return (
                <Fragment key={entry.id}>
                  <tr
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <td className="pl-3 py-2">
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="py-2 px-3 font-medium max-w-[200px] truncate">{entry.title}</td>
                    <td className="py-2 px-3 text-muted-foreground">{formatLabel(entry.category)}</td>
                    <td className="py-2 px-3">
                      <SeverityBadge severity={entry.severity} />
                    </td>
                    <td className="py-2 px-3 text-center">{entry.likelihood}</td>
                    <td className="py-2 px-3 text-center">{entry.impact}</td>
                    <td className="py-2 px-3 text-center font-semibold">{entry.riskScore ?? '--'}</td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="text-xs border border-border rounded px-1.5 py-1 bg-background text-foreground"
                        value={entry.status}
                        onChange={(e) => onStatusChange(entry.id, e.target.value)}
                        aria-label={`Status for ${entry.title}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {formatLabel(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {entry.owner ? (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {entry.owner}
                        </span>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span className={overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                        {overdue && <Clock className="w-3 h-3 inline mr-1" />}
                        {formatDate(entry.dueDate)}
                      </span>
                    </td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-muted-foreground hover:text-red-600 transition-colors"
                        onClick={() => onDelete(entry.id)}
                        title="Delete entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expanded && (
                    <tr className="bg-muted/20">
                      <td colSpan={11} className="px-6 py-4">
                        <div className="space-y-3">
                          {/* Description */}
                          {entry.description && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Description
                              </span>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{entry.description}</p>
                            </div>
                          )}

                          {/* Mitigations */}
                          {entry.mitigations && entry.mitigations.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Mitigations ({entry.mitigations.length})
                              </span>
                              <div className="mt-1 space-y-2">
                                {entry.mitigations.map((m, idx) => (
                                  <div
                                    key={m.id ?? idx}
                                    className="flex items-start gap-3 bg-background border border-border rounded p-2 text-sm"
                                  >
                                    <span
                                      className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                                        MITIGATION_STATUS_COLORS[m.status] ?? 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {formatLabel(m.status)}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p>{m.description}</p>
                                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                        {m.owner && <span>Owner: {m.owner}</span>}
                                        {m.dueDate && <span>Due: {formatDate(m.dueDate)}</span>}
                                        {m.effectiveness && <span>Effectiveness: {m.effectiveness}</span>}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {entry.mitigations?.length === 0 && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              No mitigations defined for this risk.
                            </div>
                          )}

                          {/* Metadata */}
                          <div className="flex gap-6 text-xs text-muted-foreground">
                            {entry.source && <span>Source: {formatLabel(entry.source)}</span>}
                            <span>Created: {new Date(entry.createdAt).toLocaleString()}</span>
                            <span>Updated: {new Date(entry.updatedAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-muted-foreground text-sm">
                  No risk entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

