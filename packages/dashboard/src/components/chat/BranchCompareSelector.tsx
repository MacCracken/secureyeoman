/**
 * BranchCompareSelector — Pick any two branches for side-by-side diff.
 *
 * Renders a compact selector with two dropdowns populated from the
 * branch tree. Selecting both triggers the diff view.
 */

import { useState, useMemo, useCallback } from 'react';
import { GitCompare, ArrowRight } from 'lucide-react';
import type { BranchTreeNode } from '../../types';

interface BranchCompareSelectorProps {
  tree: BranchTreeNode | null;
  onCompare: (sourceId: string, targetId: string) => void;
}

interface FlatBranch {
  id: string;
  title: string;
  depth: number;
  qualityScore: number | null;
  model: string | null;
}

function flattenBranches(
  node: BranchTreeNode,
  depth: number,
  result: FlatBranch[]
): void {
  result.push({
    id: node.conversationId,
    title: node.title,
    depth,
    qualityScore: node.qualityScore,
    model: node.model,
  });
  for (const child of node.children) {
    flattenBranches(child, depth + 1, result);
  }
}

export function BranchCompareSelector({ tree, onCompare }: BranchCompareSelectorProps) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  const branches = useMemo(() => {
    if (!tree) return [];
    const result: FlatBranch[] = [];
    flattenBranches(tree, 0, result);
    return result;
  }, [tree]);

  const handleCompare = useCallback(() => {
    if (sourceId && targetId && sourceId !== targetId) {
      onCompare(sourceId, targetId);
    }
  }, [sourceId, targetId, onCompare]);

  if (branches.length < 2) {
    return null;
  }

  return (
    <div className="border rounded-lg p-3 space-y-2" data-testid="branch-compare-selector">
      <div className="flex items-center gap-2 text-xs font-medium">
        <GitCompare className="w-3.5 h-3.5" />
        Compare Branches
      </div>

      <div className="flex items-center gap-2">
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="flex-1 border rounded px-2 py-1.5 text-xs bg-background truncate"
          data-testid="compare-source-select"
        >
          <option value="">Select source...</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id} disabled={b.id === targetId}>
              {'  '.repeat(b.depth)}{b.title}
              {b.qualityScore != null ? ` (${b.qualityScore.toFixed(2)})` : ''}
            </option>
          ))}
        </select>

        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="flex-1 border rounded px-2 py-1.5 text-xs bg-background truncate"
          data-testid="compare-target-select"
        >
          <option value="">Select target...</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id} disabled={b.id === sourceId}>
              {'  '.repeat(b.depth)}{b.title}
              {b.qualityScore != null ? ` (${b.qualityScore.toFixed(2)})` : ''}
            </option>
          ))}
        </select>

        <button
          onClick={handleCompare}
          disabled={!sourceId || !targetId || sourceId === targetId}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 shrink-0"
          data-testid="compare-button"
        >
          Compare
        </button>
      </div>
    </div>
  );
}
