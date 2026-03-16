/**
 * SwarmTemplatesTab — Swarm template browsing, export, and import (Marketplace + Community).
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Download, Upload, Users, Shield, GitBranch, Loader2, Search } from 'lucide-react';
import {
  fetchCommunitySwarmTemplates,
  exportSwarmTemplate,
  importSwarmTemplate,
} from '../../api/client';
import type { SwarmTemplate } from '../../api/client';

const STRATEGY_COLORS: Record<string, string> = {
  sequential: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  parallel: 'bg-green-500/10 text-green-600 border-green-500/20',
  dynamic: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

export function SwarmTemplatesTab({
  source,
  query: externalQuery,
}: { source?: string; query?: string } = {}) {
  const [toast, setToast] = useState<string | null>(null);
  const [internalQuery, setInternalQuery] = useState('');
  const isControlled = externalQuery !== undefined;
  const query = isControlled ? externalQuery : internalQuery;

  const { data, isLoading } = useQuery({
    queryKey: ['community-swarm-templates', source],
    queryFn: () => fetchCommunitySwarmTemplates(),
  });

  const exportMut = useMutation({
    mutationFn: (id: string) => exportSwarmTemplate(id),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(payload.template as SwarmTemplate).name.replace(/\s+/g, '-').toLowerCase()}.swarm.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const importMut = useMutation({
    mutationFn: async (tmpl: SwarmTemplate) => {
      const exported = await exportSwarmTemplate(tmpl.id);
      return importSwarmTemplate(exported);
    },
    onSuccess: ({ compatibility }) => {
      const msg = compatibility.compatible
        ? 'Swarm template imported successfully'
        : `Imported — missing profiles: ${(compatibility.gaps.profileRoles ?? []).join(', ')}`;
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

  const sourceFiltered = ((data?.templates ?? []) as SwarmTemplate[]).filter((t) => {
    if (source === 'community') return !t.isBuiltin;
    if (source === 'builtin') return t.isBuiltin;
    return true;
  });

  const templates = sourceFiltered.filter((t) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.roles.some((r) => r.role.toLowerCase().includes(q))
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
              source === 'community'
                ? 'Search community swarm templates…'
                : 'Search swarm templates…'
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
          <Users className="w-12 h-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground font-medium">
            {source === 'community'
              ? 'No community swarm templates found'
              : 'No swarm templates available'}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {source === 'community' ? (
              <>
                Click <strong>Sync</strong> to import swarm templates from the community repo.
              </>
            ) : (
              'No swarm template definitions found'
            )}
          </p>
        </div>
      ) : !templates.length ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted-foreground">No templates match &ldquo;{query}&rdquo;</p>
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
              {source === 'community' ? 'Community Swarm Templates' : 'YEOMAN Swarm Templates'}
            </h3>
            <span className="text-xs text-muted-foreground">({templates.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tmpl: SwarmTemplate) => (
              <div key={tmpl.id} className="card p-4 flex flex-col">
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-sm truncate">{tmpl.name}</h3>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded border ${STRATEGY_COLORS[tmpl.strategy] ?? ''}`}
                    >
                      {tmpl.strategy}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {tmpl.description || 'No description'}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tmpl.roles.map((r) => (
                      <span
                        key={r.role}
                        className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                      >
                        {r.role}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex gap-2">
                  <button
                    className="btn btn-ghost btn-sm flex-1 flex items-center gap-1 justify-center"
                    onClick={() => {
                      exportMut.mutate(tmpl.id);
                    }}
                    disabled={exportMut.isPending}
                    title="Export as JSON"
                  >
                    <Upload className="w-3.5 h-3.5" /> Export
                  </button>
                  <button
                    className="btn btn-ghost btn-sm flex-1 flex items-center gap-1 justify-center"
                    onClick={() => {
                      importMut.mutate(tmpl);
                    }}
                    disabled={importMut.isPending}
                    title="Install swarm template"
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
