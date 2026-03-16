/**
 * WorkflowsTab — Workflow browsing, export, and import (Marketplace + Community).
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Download, Upload, GitBranch, Shield, Loader2, Search } from 'lucide-react';
import { fetchCommunityWorkflows, exportWorkflow, importWorkflow } from '../../api/client';
import type { WorkflowDefinition } from '../../api/client';

const AUTONOMY_COLORS: Record<string, string> = {
  L1: 'bg-green-500/10 text-green-600 border-green-500/20',
  L2: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  L3: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  L4: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  L5: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function WorkflowsTab({
  source,
  query: externalQuery,
}: { source?: string; query?: string } = {}) {
  const [toast, setToast] = useState<string | null>(null);
  const [internalQuery, setInternalQuery] = useState('');
  // When query is controlled externally (community tab), skip the internal search bar
  const isControlled = externalQuery !== undefined;
  const query = isControlled ? externalQuery : internalQuery;

  const { data, isLoading } = useQuery({
    queryKey: ['community-workflows', source],
    queryFn: () => fetchCommunityWorkflows(source),
  });

  const importMut = useMutation({
    mutationFn: async (wf: WorkflowDefinition) => {
      const exported = await exportWorkflow(wf.id);
      return importWorkflow(exported);
    },
    onSuccess: ({ compatibility }) => {
      const msg = compatibility.compatible
        ? 'Workflow imported successfully'
        : `Imported with warnings: ${Object.values(compatibility.gaps).flat().join(', ')}`;
      setToast(msg);
      setTimeout(() => {
        setToast(null);
      }, 4000);
    },
    onError: (err) => {
      setToast(err instanceof Error ? err.message : 'Import failed');
      setTimeout(() => {
        setToast(null);
      }, 4000);
    },
  });

  const exportMut = useMutation({
    mutationFn: (id: string) => exportWorkflow(id),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${payload.workflow.name.replace(/\s+/g, '-').toLowerCase()}.workflow.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const sourceFiltered = (data?.definitions ?? []).filter((wf: WorkflowDefinition) => {
    if (source === 'builtin') return wf.createdBy === 'system';
    if (source === 'community') return wf.createdBy === 'community';
    return true;
  });

  const workflows = sourceFiltered.filter((wf: WorkflowDefinition) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      wf.name.toLowerCase().includes(q) || ((wf as any).description ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {toast && (
        <div className="bg-green-500/10 text-green-600 border border-green-500/20 rounded-lg px-4 py-2 text-sm">
          {toast}
        </div>
      )}

      {/* Search — hidden when controlled externally by community tab */}
      {!isControlled && (
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={
              source === 'community' ? 'Search community workflows…' : 'Search workflows…'
            }
            value={internalQuery}
            onChange={(e) => {
              setInternalQuery(e.target.value);
            }}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !sourceFiltered.length ? (
        <div className="card p-12 text-center space-y-3">
          <GitBranch className="w-12 h-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground font-medium">
            {source === 'community' ? 'No community workflows found' : 'No workflows available'}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {source === 'community' ? (
              <>
                Click <strong>Sync</strong> to import workflows from the community repo.
              </>
            ) : (
              'No workflow definitions found'
            )}
          </p>
        </div>
      ) : !workflows.length ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted-foreground">No workflows match &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {source === 'community' ? (
              <GitBranch className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Shield className="w-4 h-4 text-primary" />
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {source === 'community' ? 'Community Workflows' : 'YEOMAN Workflows'}
            </h3>
            <span className="text-xs text-muted-foreground">({workflows.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((wf: WorkflowDefinition) => (
              <div key={wf.id} className="card p-4 flex flex-col">
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-sm truncate">{wf.name}</h3>
                    {wf.autonomyLevel && (
                      <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded border ${AUTONOMY_COLORS[wf.autonomyLevel] ?? ''}`}
                      >
                        {wf.autonomyLevel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {(wf as any).description || 'No description'}
                  </p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {Array.isArray(wf.steps) && <span>{wf.steps.length} steps</span>}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex gap-2">
                  <button
                    className="btn btn-ghost btn-sm flex-1 flex items-center gap-1 justify-center"
                    onClick={() => {
                      exportMut.mutate(wf.id);
                    }}
                    disabled={exportMut.isPending}
                    title="Export as JSON"
                  >
                    <Upload className="w-3.5 h-3.5" /> Export
                  </button>
                  <button
                    className="btn btn-ghost btn-sm flex-1 flex items-center gap-1 justify-center"
                    onClick={() => {
                      importMut.mutate(wf);
                    }}
                    disabled={importMut.isPending}
                    title="Install workflow"
                  >
                    {importMut.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Install
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
