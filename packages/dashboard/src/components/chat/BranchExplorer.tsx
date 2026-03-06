/**
 * BranchExplorer — Tabbed panel combining tree view, timeline, stats, and compare.
 *
 * Wraps all conversation branching visualization into a single side panel
 * with a tab bar for switching between views.
 */

import { useState, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, GitBranch, Clock, BarChart3, GitCompare } from 'lucide-react';
import { fetchBranchTree } from '../../api/client';
import { BranchStatsPanel } from './BranchStatsPanel';
import { BranchCompareSelector } from './BranchCompareSelector';
import { BranchTimeline } from './BranchTimeline';
import type { BranchTreeNode } from '../../types';

const BranchTreeView = lazy(() =>
  import('./BranchTreeView').then((m) => ({ default: m.BranchTreeView }))
);

type BranchTab = 'tree' | 'timeline' | 'stats' | 'compare';

interface BranchExplorerProps {
  conversationId: string;
  activeConversationId: string | null;
  onNavigate: (conversationId: string) => void;
  onCompare: (sourceId: string, targetId: string) => void;
  onClose: () => void;
}

const TABS: { id: BranchTab; label: string; icon: React.ReactNode }[] = [
  { id: 'tree', label: 'Tree', icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'compare', label: 'Compare', icon: <GitCompare className="w-3.5 h-3.5" /> },
];

export function BranchExplorer({
  conversationId,
  activeConversationId,
  onNavigate,
  onCompare,
  onClose,
}: BranchExplorerProps) {
  const [activeTab, setActiveTab] = useState<BranchTab>('tree');

  const { data: tree } = useQuery<BranchTreeNode>({
    queryKey: ['branch-tree', conversationId],
    queryFn: () => fetchBranchTree(conversationId),
  });

  return (
    <div className="flex flex-col h-full border-l bg-card" data-testid="branch-explorer">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="w-4 h-4" />
          Branch Explorer
        </div>
        <button
          onClick={onClose}
          className="btn-ghost p-1 rounded"
          data-testid="branch-explorer-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b" data-testid="branch-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid={`tab-${tab.id}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'tree' && (
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
            <BranchTreeView
              conversationId={conversationId}
              activeConversationId={activeConversationId}
              onNavigate={onNavigate}
              onClose={onClose}
            />
          </Suspense>
        )}
        {activeTab === 'timeline' && (
          <BranchTimeline
            tree={tree ?? null}
            activeConversationId={activeConversationId}
            onNavigate={onNavigate}
          />
        )}
        {activeTab === 'stats' && <BranchStatsPanel tree={tree ?? null} />}
        {activeTab === 'compare' && (
          <div className="p-4">
            <BranchCompareSelector tree={tree ?? null} onCompare={onCompare} />
          </div>
        )}
      </div>
    </div>
  );
}
