import { useState } from 'react';
import {
  ListChecks,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Loader2,
  AlertCircle,
  FileText,
  Brain,
  Sparkles,
  Play,
  Pause,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────

export type PlanStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'awaiting_approval';

export interface PlanStep {
  id: string;
  description: string;
  status: PlanStepStatus;
  toolName?: string;
  detail?: string;
  /** File paths referenced by this step */
  files?: string[];
  /** Memory/knowledge refs */
  memoryRefs?: string[];
  /** Duration in ms (filled after completion) */
  durationMs?: number;
  /** Child steps for nested plans */
  children?: PlanStep[];
}

export interface AiPlan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  createdAt: number;
  /** Total tokens consumed so far */
  tokensUsed?: number;
}

// ── Context Badge ─────────────────────────────────────────────────

interface ContextBadgeProps {
  type: 'file' | 'memory' | 'tool';
  label: string;
  onClick?: () => void;
}

export function ContextBadge({ type, label, onClick }: ContextBadgeProps) {
  const icons = {
    file: <FileText className="w-2.5 h-2.5" />,
    memory: <Brain className="w-2.5 h-2.5" />,
    tool: <Sparkles className="w-2.5 h-2.5" />,
  };
  const colors = {
    file: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    memory: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    tool: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${colors[type]} ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      data-testid={`context-badge-${type}`}
    >
      {icons[type]}
      <span className="max-w-[100px] truncate">{label}</span>
    </button>
  );
}

// ── Step Row ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<PlanStepStatus, React.ReactNode> = {
  pending: <div className="w-3 h-3 rounded-full border border-muted-foreground/40" />,
  running: <Loader2 className="w-3 h-3 text-primary animate-spin" />,
  completed: <Check className="w-3 h-3 text-green-500" />,
  failed: <X className="w-3 h-3 text-red-500" />,
  skipped: <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />,
  awaiting_approval: <AlertCircle className="w-3 h-3 text-yellow-500 animate-pulse" />,
};

interface StepRowProps {
  step: PlanStep;
  depth?: number;
  onApprove?: (stepId: string) => void;
  onReject?: (stepId: string) => void;
  onFileClick?: (path: string) => void;
}

function StepRow({ step, depth = 0, onApprove, onReject, onFileClick }: StepRowProps) {
  const [expanded, setExpanded] = useState(
    step.status === 'running' || step.status === 'awaiting_approval'
  );
  const hasChildren = step.children && step.children.length > 0;
  const hasBadges =
    (step.files?.length ?? 0) > 0 || (step.memoryRefs?.length ?? 0) > 0 || step.toolName;

  return (
    <div data-testid={`plan-step-${step.id}`}>
      <div
        className={`flex items-start gap-2 py-1.5 px-2 rounded transition-colors ${
          step.status === 'awaiting_approval'
            ? 'bg-yellow-500/5 border border-yellow-500/20'
            : step.status === 'running'
              ? 'bg-primary/5'
              : 'hover:bg-muted/30'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {/* Expand toggle for nested steps */}
        {hasChildren ? (
          <button
            onClick={() => {
              setExpanded((v) => !v);
            }}
            className="flex-shrink-0 mt-0.5"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        {/* Status icon */}
        <span className="flex-shrink-0 mt-0.5">{STATUS_ICONS[step.status]}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <span
            className={`text-xs ${step.status === 'skipped' ? 'text-muted-foreground line-through' : ''}`}
          >
            {step.description}
          </span>

          {/* Context badges */}
          {hasBadges && (
            <div className="flex flex-wrap gap-1 mt-1">
              {step.toolName && <ContextBadge type="tool" label={step.toolName} />}
              {step.files?.map((f) => (
                <ContextBadge
                  key={f}
                  type="file"
                  label={f.split('/').pop() ?? f}
                  onClick={
                    onFileClick
                      ? () => {
                          onFileClick(f);
                        }
                      : undefined
                  }
                />
              ))}
              {step.memoryRefs?.map((m) => (
                <ContextBadge key={m} type="memory" label={m} />
              ))}
            </div>
          )}

          {/* Detail (collapsed by default) */}
          {step.detail && expanded && (
            <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1.5 mt-1 whitespace-pre-wrap font-mono max-h-24 overflow-y-auto">
              {step.detail}
            </pre>
          )}

          {/* Approval buttons */}
          {step.status === 'awaiting_approval' && (
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => onApprove?.(step.id)}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-600 border border-green-500/20 hover:bg-green-500/20"
                data-testid={`approve-${step.id}`}
              >
                <Check className="w-3 h-3" />
                Approve
              </button>
              <button
                onClick={() => onReject?.(step.id)}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20"
                data-testid={`reject-${step.id}`}
              >
                <X className="w-3 h-3" />
                Skip
              </button>
            </div>
          )}
        </div>

        {/* Duration */}
        {step.durationMs != null && (
          <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
            {step.durationMs < 1000
              ? `${step.durationMs}ms`
              : `${(step.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {step.children!.map((child) => (
            <StepRow
              key={child.id}
              step={child}
              depth={depth + 1}
              onApprove={onApprove}
              onReject={onReject}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────

interface AiPlanPanelProps {
  plan: AiPlan | null;
  onApproveStep?: (stepId: string) => void;
  onRejectStep?: (stepId: string) => void;
  onPauseResume?: () => void;
  onFileClick?: (path: string) => void;
}

export function AiPlanPanel({
  plan,
  onApproveStep,
  onRejectStep,
  onPauseResume,
  onFileClick,
}: AiPlanPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!plan) return null;

  const completedCount = plan.steps.filter((s) => s.status === 'completed').length;
  const totalCount = plan.steps.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const awaitingCount = plan.steps.filter((s) => s.status === 'awaiting_approval').length;

  return (
    <div className="border rounded-lg bg-card overflow-hidden" data-testid="ai-plan-panel">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b cursor-pointer select-none"
        onClick={() => {
          setCollapsed((v) => !v);
        }}
      >
        <ListChecks className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold flex-1 truncate">{plan.title}</span>

        {/* Awaiting badge */}
        {awaitingCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600 border border-yellow-500/20 animate-pulse">
            <AlertCircle className="w-2.5 h-2.5" />
            {awaitingCount} awaiting
          </span>
        )}

        {/* Progress */}
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {completedCount}/{totalCount}
        </span>

        {/* Pause / Resume */}
        {onPauseResume && (plan.status === 'executing' || plan.status === 'paused') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPauseResume();
            }}
            className="p-0.5 rounded hover:bg-muted"
            title={plan.status === 'paused' ? 'Resume' : 'Pause'}
            data-testid="pause-resume"
          >
            {plan.status === 'paused' ? (
              <Play className="w-3 h-3 text-primary" />
            ) : (
              <Pause className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}

        {/* Tokens */}
        {plan.tokensUsed != null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {plan.tokensUsed.toLocaleString()} tok
          </span>
        )}

        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-muted">
        <div
          className={`h-full transition-all duration-300 ${
            plan.status === 'failed'
              ? 'bg-red-500'
              : plan.status === 'completed'
                ? 'bg-green-500'
                : 'bg-primary'
          }`}
          style={{ width: `${progress}%` }}
          data-testid="progress-bar"
        />
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="py-1 max-h-[300px] overflow-y-auto" data-testid="plan-steps">
          {plan.steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              onApprove={onApproveStep}
              onReject={onRejectStep}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
