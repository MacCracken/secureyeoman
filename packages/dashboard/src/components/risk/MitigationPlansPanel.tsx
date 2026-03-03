/**
 * MitigationPlansPanel — Displays mitigations grouped by status with progress
 * tracking, count badges, and overdue highlighting.
 */

import { useMemo } from 'react';
import { CheckCircle, Clock, AlertTriangle, ShieldCheck, ListChecks } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type MitigationStatus = 'planned' | 'in_progress' | 'implemented' | 'verified';

interface MitigationItem {
  id: string;
  description: string;
  status: MitigationStatus;
  owner?: string;
  dueDate?: string;
  effectiveness?: 'high' | 'medium' | 'low';
}

interface MitigationPlansPanelProps {
  mitigations: MitigationItem[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_ORDER: MitigationStatus[] = ['planned', 'in_progress', 'implemented', 'verified'];

const STATUS_META: Record<
  MitigationStatus,
  { label: string; icon: React.ReactNode; color: string; badgeColor: string }
> = {
  planned: {
    label: 'Planned',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-gray-600',
    badgeColor: 'bg-gray-100 text-gray-700',
  },
  in_progress: {
    label: 'In Progress',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  implemented: {
    label: 'Implemented',
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-600',
    badgeColor: 'bg-green-100 text-green-700',
  },
  verified: {
    label: 'Verified',
    icon: <ShieldCheck className="w-4 h-4" />,
    color: 'text-emerald-600',
    badgeColor: 'bg-emerald-100 text-emerald-700',
  },
};

const EFFECTIVENESS_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-red-100 text-red-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(dueDate: string | undefined): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MitigationPlansPanel({ mitigations }: MitigationPlansPanelProps) {
  const grouped = useMemo(() => {
    const map: Record<MitigationStatus, MitigationItem[]> = {
      planned: [],
      in_progress: [],
      implemented: [],
      verified: [],
    };
    for (const m of mitigations) {
      if (map[m.status]) {
        map[m.status].push(m);
      }
    }
    return map;
  }, [mitigations]);

  const total = mitigations.length;
  const completedCount = grouped.implemented.length + grouped.verified.length;
  const completionPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  if (total === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-muted-foreground"
        data-testid="mitigation-plans-panel"
      >
        <ListChecks className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No mitigations defined</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="mitigation-plans-panel">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">
            Completion: {completedCount}/{total}
          </span>
          <span className="font-semibold">{completionPct}%</span>
        </div>
        <div className="w-full h-2 bg-base-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Status groups */}
      {STATUS_ORDER.map((status) => {
        const items = grouped[status];
        const meta = STATUS_META[status];
        if (items.length === 0) return null;

        return (
          <div key={status} className="space-y-2">
            {/* Group header */}
            <div className="flex items-center gap-2">
              <span className={meta.color}>{meta.icon}</span>
              <span className="text-sm font-semibold">{meta.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${meta.badgeColor}`}>
                {items.length}
              </span>
            </div>

            {/* Items */}
            <div className="space-y-1 pl-6">
              {items.map((item) => {
                const overdue =
                  isOverdue(item.dueDate) && status !== 'implemented' && status !== 'verified';

                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2 text-sm border rounded px-3 py-2 ${
                      overdue ? 'border-red-300 bg-red-50' : 'border-border bg-base-100'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={overdue ? 'text-red-700' : 'text-foreground'}>
                        {item.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {item.owner && <span>Owner: {item.owner}</span>}
                        {item.dueDate && (
                          <span className={overdue ? 'text-red-600 font-medium' : ''}>
                            Due: {formatDate(item.dueDate)}
                            {overdue && ' (overdue)'}
                          </span>
                        )}
                        {item.effectiveness && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              EFFECTIVENESS_COLORS[item.effectiveness] ?? ''
                            }`}
                          >
                            {item.effectiveness} effectiveness
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
