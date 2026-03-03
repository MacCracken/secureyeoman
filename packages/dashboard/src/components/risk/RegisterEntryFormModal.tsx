/**
 * RegisterEntryFormModal — Create a risk register entry with full form fields.
 * Follows the DepartmentFormModal pattern.
 */

import { useState, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'operational',
  'security',
  'financial',
  'compliance',
  'reputational',
  'strategic',
  'technology',
] as const;

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

function formatLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterEntryFormData {
  title: string;
  category: string;
  severity: string;
  likelihood: number;
  impact: number;
  owner?: string;
  dueDate?: string;
  description?: string;
}

interface RegisterEntryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: RegisterEntryFormData) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RegisterEntryFormModal({ open, onClose, onSubmit }: RegisterEntryFormModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('operational');
  const [severity, setSeverity] = useState<string>('medium');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  const riskScore = likelihood * impact;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;
      onSubmit({
        title: title.trim(),
        category,
        severity,
        likelihood,
        impact,
        owner: owner.trim() || undefined,
        dueDate: dueDate || undefined,
        description: description.trim() || undefined,
      });
      // Reset form
      setTitle('');
      setCategory('operational');
      setSeverity('medium');
      setLikelihood(3);
      setImpact(3);
      setOwner('');
      setDueDate('');
      setDescription('');
    },
    [title, category, severity, likelihood, impact, owner, dueDate, description, onSubmit]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="register-entry-form-modal"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Add Risk Entry</h2>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unauthorized API access"
              required
              maxLength={300}
            />
          </div>

          {/* Category + Severity row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {formatLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Severity</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {formatLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Likelihood + Impact + Score */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Likelihood (1-5)</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
                value={likelihood}
                onChange={(e) => setLikelihood(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Impact (1-5)</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground"
                value={impact}
                onChange={(e) => setImpact(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Risk Score</label>
              <div
                className={`flex items-center justify-center h-[38px] rounded text-sm font-bold ${
                  riskScore >= 20
                    ? 'bg-red-100 text-red-700'
                    : riskScore >= 10
                      ? 'bg-orange-100 text-orange-700'
                      : riskScore >= 5
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                }`}
              >
                {riskScore}
              </div>
            </div>
          </div>

          {/* Owner + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Owner</label>
              <input
                type="text"
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Responsible person"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <input
                type="date"
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="w-full border border-border rounded px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the risk scenario and context"
              rows={3}
            />
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
              disabled={!title.trim()}
            >
              Add Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
