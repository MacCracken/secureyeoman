/**
 * BranchStatsPanel — Aggregate statistics across a conversation branch tree.
 *
 * Displays tree depth, total branches, quality distribution, model usage
 * breakdown, and a mini quality histogram.
 */

import { useMemo } from 'react';
import { GitBranch, Layers, BarChart3, Award, GitFork } from 'lucide-react';
import type { BranchTreeNode } from '../../types';

interface BranchStatsPanelProps {
  tree: BranchTreeNode | null;
}

interface TreeStats {
  totalBranches: number;
  maxDepth: number;
  avgQuality: number | null;
  minQuality: number | null;
  maxQuality: number | null;
  qualityBuckets: number[];
  modelCounts: Record<string, number>;
  branchesWithScores: number;
  leafCount: number;
}

function collectStats(node: BranchTreeNode, depth: number, stats: TreeStats): void {
  stats.totalBranches++;
  if (depth > stats.maxDepth) stats.maxDepth = depth;
  if (node.children.length === 0) stats.leafCount++;

  if (node.qualityScore != null) {
    stats.branchesWithScores++;
    const bucket = Math.min(4, Math.floor(node.qualityScore * 5));
    stats.qualityBuckets[bucket]++;

    if (stats.minQuality === null || node.qualityScore < stats.minQuality) {
      stats.minQuality = node.qualityScore;
    }
    if (stats.maxQuality === null || node.qualityScore > stats.maxQuality) {
      stats.maxQuality = node.qualityScore;
    }
  }

  if (node.model) {
    stats.modelCounts[node.model] = (stats.modelCounts[node.model] ?? 0) + 1;
  }

  for (const child of node.children) {
    collectStats(child, depth + 1, stats);
  }
}

function computeStats(tree: BranchTreeNode): TreeStats {
  const stats: TreeStats = {
    totalBranches: 0,
    maxDepth: 0,
    avgQuality: null,
    minQuality: null,
    maxQuality: null,
    qualityBuckets: [0, 0, 0, 0, 0],
    modelCounts: {},
    branchesWithScores: 0,
    leafCount: 0,
  };

  collectStats(tree, 0, stats);

  if (stats.branchesWithScores > 0) {
    const totalQuality = stats.qualityBuckets.reduce(
      (sum, count, i) => sum + count * ((i + 0.5) / 5),
      0
    );
    stats.avgQuality = totalQuality / stats.branchesWithScores;
  }

  return stats;
}

const BUCKET_LABELS = ['0–0.2', '0.2–0.4', '0.4–0.6', '0.6–0.8', '0.8–1.0'];
const BUCKET_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-blue-500',
  'bg-green-500',
];

export function BranchStatsPanel({ tree }: BranchStatsPanelProps) {
  const stats = useMemo(() => (tree ? computeStats(tree) : null), [tree]);

  if (!stats) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="branch-stats-empty">
        No branch data available
      </div>
    );
  }

  const modelEntries = Object.entries(stats.modelCounts).sort(([, a], [, b]) => b - a);
  const maxBucket = Math.max(...stats.qualityBuckets, 1);

  return (
    <div className="space-y-4 p-4" data-testid="branch-stats-panel">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<GitBranch className="w-4 h-4 text-blue-400" />}
          label="Total Branches"
          value={stats.totalBranches}
        />
        <StatCard
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          label="Max Depth"
          value={stats.maxDepth}
        />
        <StatCard
          icon={<GitFork className="w-4 h-4 text-cyan-400" />}
          label="Leaf Branches"
          value={stats.leafCount}
        />
        <StatCard
          icon={<Award className="w-4 h-4 text-amber-400" />}
          label="Avg Quality"
          value={stats.avgQuality != null ? stats.avgQuality.toFixed(3) : '—'}
        />
      </div>

      {/* Quality histogram */}
      {stats.branchesWithScores > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <BarChart3 className="w-3.5 h-3.5" />
            Quality Distribution
          </div>
          <div className="flex items-end gap-1 h-16" data-testid="quality-histogram">
            {stats.qualityBuckets.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className={`w-full rounded-t ${BUCKET_COLORS[i]} transition-all`}
                  style={{ height: `${(count / maxBucket) * 100}%`, minHeight: count > 0 ? 4 : 0 }}
                  data-testid={`bucket-${i}`}
                />
                <span className="text-[9px] text-muted-foreground">{BUCKET_LABELS[i]}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Min: {stats.minQuality?.toFixed(3) ?? '—'}</span>
            <span>Max: {stats.maxQuality?.toFixed(3) ?? '—'}</span>
          </div>
        </div>
      )}

      {/* Model breakdown */}
      {modelEntries.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <div className="text-xs font-medium">Models Used</div>
          <div className="space-y-1" data-testid="model-breakdown">
            {modelEntries.map(([model, count]) => (
              <div key={model} className="flex items-center justify-between text-xs">
                <span className="font-mono truncate max-w-[160px]">{model}</span>
                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border rounded-lg p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className="text-lg font-bold"
        data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {value}
      </div>
    </div>
  );
}
