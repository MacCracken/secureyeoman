/* eslint-disable react-hooks/set-state-in-effect */
/**
 * DepartmentFormModal -- Create/edit department modal with form fields for name,
 * description, mission, 5-domain risk appetite sliders with presets, and a dynamic
 * compliance targets list.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Sliders, Shield } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskAppetite {
  security: number;
  operational: number;
  financial: number;
  compliance: number;
  reputational: number;
}

interface ComplianceTarget {
  framework: string;
  requirement?: string;
  targetDate?: string;
  status: 'not_started' | 'in_progress' | 'compliant' | 'non_compliant';
}

interface DepartmentData {
  id?: string;
  name: string;
  description?: string | null;
  mission?: string | null;
  riskAppetite?: RiskAppetite;
  complianceTargets?: ComplianceTarget[];
}

interface DepartmentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    mission?: string;
    riskAppetite: RiskAppetite;
    complianceTargets: ComplianceTarget[];
  }) => void;
  department?: DepartmentData;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const APPETITE_DOMAINS = [
  'security',
  'operational',
  'financial',
  'compliance',
  'reputational',
] as const;
type AppetiteDomain = (typeof APPETITE_DOMAINS)[number];

const DEFAULT_APPETITE: RiskAppetite = {
  security: 50,
  operational: 50,
  financial: 50,
  compliance: 50,
  reputational: 50,
};

const PRESETS: { label: string; value: number; color: string }[] = [
  { label: 'Conservative', value: 30, color: 'bg-green-600 hover:bg-green-700' },
  { label: 'Moderate', value: 50, color: 'bg-yellow-600 hover:bg-yellow-700' },
  { label: 'Aggressive', value: 70, color: 'bg-red-600 hover:bg-red-700' },
];

const COMPLIANCE_STATUSES = ['not_started', 'in_progress', 'compliant', 'non_compliant'] as const;

const _COMPLIANCE_STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  compliant: 'bg-green-100 text-green-700',
  non_compliant: 'bg-red-100 text-red-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function sliderTrackColor(value: number): string {
  if (value >= 70) return 'accent-red-500';
  if (value >= 40) return 'accent-yellow-500';
  return 'accent-green-500';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DepartmentFormModal({
  open,
  onClose,
  onSubmit,
  department,
}: DepartmentFormModalProps) {
  const isEdit = !!department?.id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mission, setMission] = useState('');
  const [appetite, setAppetite] = useState<RiskAppetite>({ ...DEFAULT_APPETITE });
  const [targets, setTargets] = useState<ComplianceTarget[]>([]);

  // Populate form on open or department change
  useEffect(() => {
    if (!open) return;
    if (department) {
      setName(department.name ?? '');
      setDescription(department.description ?? '');
      setMission(department.mission ?? '');
      setAppetite(
        department.riskAppetite ? { ...department.riskAppetite } : { ...DEFAULT_APPETITE }
      );
      setTargets(
        department.complianceTargets ? department.complianceTargets.map((t) => ({ ...t })) : []
      );
    } else {
      setName('');
      setDescription('');
      setMission('');
      setAppetite({ ...DEFAULT_APPETITE });
      setTargets([]);
    }
  }, [open, department]);

  const handleAppetiteChange = useCallback((domain: AppetiteDomain, value: number) => {
    setAppetite((prev) => ({ ...prev, [domain]: value }));
  }, []);

  const applyPreset = useCallback((value: number) => {
    setAppetite({
      security: value,
      operational: value,
      financial: value,
      compliance: value,
      reputational: value,
    });
  }, []);

  const addTarget = useCallback(() => {
    setTargets((prev) => [
      ...prev,
      { framework: '', requirement: '', targetDate: '', status: 'not_started' as const },
    ]);
  }, []);

  const removeTarget = useCallback((index: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateTarget = useCallback(
    (index: number, field: keyof ComplianceTarget, value: string) => {
      setTargets((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
    },
    []
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        mission: mission.trim() || undefined,
        riskAppetite: appetite,
        complianceTargets: targets.filter((t) => t.framework.trim()),
      });
    },
    [name, description, mission, appetite, targets, onSubmit]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="department-form-modal"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {isEdit ? 'Edit Department' : 'Create Department'}
            </h2>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Basic fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder="e.g. Engineering"
                required
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px]"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
                placeholder="Brief description of the department"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Mission</label>
              <textarea
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px]"
                value={mission}
                onChange={(e) => {
                  setMission(e.target.value);
                }}
                placeholder="Department mission statement"
                rows={2}
              />
            </div>
          </div>

          {/* Risk Appetite */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Risk Appetite</h3>
              </div>
              <div className="flex gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`px-2.5 py-1 text-xs text-white rounded transition-colors ${preset.color}`}
                    onClick={() => {
                      applyPreset(preset.value);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 bg-muted/30 border border-border rounded-lg p-4">
              {APPETITE_DOMAINS.map((domain) => (
                <div key={domain} className="flex items-center gap-3">
                  <label className="w-28 text-sm font-medium text-right shrink-0">
                    {capitalize(domain)}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={appetite[domain]}
                    onChange={(e) => {
                      handleAppetiteChange(domain, Number(e.target.value));
                    }}
                    className={`flex-1 h-2 rounded-lg cursor-pointer ${sliderTrackColor(appetite[domain])}`}
                  />
                  <span className="w-10 text-sm text-right font-mono tabular-nums">
                    {appetite[domain]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Targets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Compliance Targets</h3>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                onClick={addTarget}
              >
                <Plus className="w-3 h-3" />
                Add Target
              </button>
            </div>

            {targets.length === 0 && (
              <p className="text-xs text-muted-foreground">No compliance targets defined.</p>
            )}

            <div className="space-y-2">
              {targets.map((target, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-start bg-background border border-border rounded p-3"
                >
                  <div>
                    <label className="text-xs text-muted-foreground">Framework</label>
                    <input
                      type="text"
                      className="w-full border border-border rounded px-2 py-1 text-sm bg-background text-foreground mt-0.5"
                      value={target.framework}
                      onChange={(e) => {
                        updateTarget(idx, 'framework', e.target.value);
                      }}
                      placeholder="e.g. SOC 2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Requirement</label>
                    <input
                      type="text"
                      className="w-full border border-border rounded px-2 py-1 text-sm bg-background text-foreground mt-0.5"
                      value={target.requirement ?? ''}
                      onChange={(e) => {
                        updateTarget(idx, 'requirement', e.target.value);
                      }}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Target Date</label>
                    <input
                      type="date"
                      className="w-full border border-border rounded px-2 py-1 text-sm bg-background text-foreground mt-0.5"
                      value={target.targetDate ?? ''}
                      onChange={(e) => {
                        updateTarget(idx, 'targetDate', e.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <select
                      className="w-full border border-border rounded px-2 py-1 text-sm bg-background text-foreground mt-0.5"
                      value={target.status}
                      onChange={(e) => {
                        updateTarget(idx, 'status', e.target.value);
                      }}
                    >
                      {COMPLIANCE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {formatLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="pt-5">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-red-600 transition-colors"
                      onClick={() => {
                        removeTarget(idx);
                      }}
                      title="Remove target"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              className="px-4 py-2 text-sm border border-border rounded hover:bg-muted transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={!name.trim()}
            >
              {isEdit ? 'Save Changes' : 'Create Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
