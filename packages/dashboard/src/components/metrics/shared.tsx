/* eslint-disable react-refresh/only-export-components */
/**
 * Shared types, constants, and small components used across the metrics module.
 */

import type React from 'react';
import { CheckCircle, XCircle, Loader2, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';
import type { CostBreakdownResponse } from '../../api/client';
import type {
  MetricsSnapshot,
  HealthStatus,
  McpServerConfig,
  Personality,
  HeartbeatStatus,
} from '../../types';
import type { useNavigate } from 'react-router-dom';

// ── Interfaces / Types ────────────────────────────────────────────────

export interface HistoryPoint {
  time: string;
  cpu: number;
  memory: number;
}

export type Tab = 'control' | 'costs' | 'full' | 'analytics';

export interface SectionCommonProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
  history: HistoryPoint[];
  heartbeatStatus: HeartbeatStatus | undefined;
  mcpServers: McpServerConfig[];
  enabledMcp: number;
  enabledHb: number;
  totalHbTasks: number;
  activeDelegations: { delegations?: { depth: number }[] } | undefined;
  activePersonalities: Personality[];
  defaultPersonality: Personality | undefined;
  navigate: ReturnType<typeof useNavigate>;
  onViewCosts: () => void;
  // activeTasks, securityEvents, auditEntries, workflows, costByProvider removed —
  // those sections now self-fetch to avoid unnecessary polling when hidden
  heartbeatRunning: boolean;
  worldViewMode: 'grid' | 'map' | 'large';
  setAndPersistWorldView: (m: 'grid' | 'map' | 'large') => void;
  worldZoom: number;
  adjustZoom: (delta: number) => void;
  setIsFullscreen: (v: boolean) => void;
}

// ── Constants ─────────────────────────────────────────────────────────

export const MAX_HISTORY = 30;

export const C = {
  primary: '#0ea5e9',
  success: '#22c55e',
  warning: '#f59e0b',
  destructive: '#ef4444',
  purple: '#8b5cf6',
  orange: '#f97316',
  muted: '#6b7280',
} as const;

export const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
} as const;

export const SEV_DOT: Record<string, string> = {
  critical: 'bg-destructive',
  error: 'bg-orange-500',
  warn: 'bg-warning',
  info: 'bg-primary',
};

export const LEVEL_DOT: Record<string, string> = {
  error: 'bg-destructive',
  critical: 'bg-destructive',
  security: 'bg-orange-500',
  warn: 'bg-warning',
};

// ── Helpers ───────────────────────────────────────────────────────────

export function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function fmtMs(ms: number): string {
  if (ms < 1_000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1_000).toFixed(2)}s`;
}

export function safePct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(Math.round((numerator / denominator) * 100), 100);
}

// ── Small shared components ───────────────────────────────────────────

export function StatCard({
  title,
  value,
  icon,
  trend,
  trendUp,
  subtitle,
  onClick,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`card p-3 sm:p-4${onClick ? ' cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
          <p className="text-lg sm:text-xl lg:text-2xl font-bold mt-0.5 sm:mt-1 truncate">
            {value}
          </p>
          {subtitle && (
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              {subtitle}
            </p>
          )}
          {trend && (
            <p
              className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 flex items-center gap-1 ${
                trendUp === true
                  ? 'text-success'
                  : trendUp === false
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }`}
            >
              {trendUp === true && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
              {trendUp === false && <XCircle className="w-3 h-3 flex-shrink-0" />}
              <span className="truncate">{trend}</span>
            </p>
          )}
        </div>
        <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg text-primary flex-shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

export function ServiceStatusRow({
  label,
  ok,
  detail,
  icon,
  onClick,
}: {
  label: string;
  ok: boolean;
  detail: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 border-b last:border-0${
        onClick ? ' cursor-pointer hover:bg-muted/20 rounded px-1 -mx-1 transition-colors' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className={ok ? 'text-success' : 'text-destructive'}>{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-xs font-medium ${ok ? 'text-success' : 'text-destructive'}`}>
        {detail}
      </span>
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ── CostSummaryCard ───────────────────────────────────────────────────

export interface CostSummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
  onReset?: () => void;
  resetting?: boolean;
}

export function CostSummaryCard({
  icon,
  label,
  value,
  loading,
  onReset,
  resetting,
}: CostSummaryCardProps) {
  return (
    <div className="p-4 rounded-lg bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        {onReset && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
            disabled={resetting}
            onClick={onReset}
            title={`Reset ${label}`}
          >
            {resetting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            Reset
          </button>
        )}
      </div>
      <p className="text-2xl font-bold">
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : value}
      </p>
    </div>
  );
}

// ── RecommendationCard ────────────────────────────────────────────────

export interface RecommendationCardProps {
  recommendation: CostBreakdownResponse['recommendations'][number];
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const priorityStyles: Record<string, string> = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-success/10 text-success',
  };

  return (
    <div className="p-4 rounded-lg border border-border/50 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium truncate">{recommendation.title}</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityStyles[recommendation.priority] ?? priorityStyles.low}`}
            >
              {recommendation.priority}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{recommendation.description}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Category:{' '}
              <span className="font-medium text-foreground">{recommendation.category}</span>
            </span>
            <span>
              Current cost:{' '}
              <span className="font-mono font-medium text-foreground">
                ${recommendation.currentCostUsd.toFixed(4)}
              </span>
            </span>
            <span>
              Est. savings:{' '}
              <span className="font-mono font-medium text-success">
                ${recommendation.estimatedSavingsUsd.toFixed(4)}
              </span>
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-1 text-xs text-primary">
            <span>{recommendation.suggestedAction}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
