/**
 * ForgePanel — Code forge dashboard panel.
 *
 * Shows configured forge connections and lets users browse repos, PRs, and pipelines.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchForgeConnections,
  addForgeConnection,
  removeForgeConnection,
  fetchForgeRepos,
  fetchForgePulls,
  fetchForgePipelines,
} from '../api/client';
import type {
  ForgeConnection,
  ForgeRepo,
  ForgePullRequest,
  ForgePipeline,
} from '../api/client';

const PROVIDER_LABELS: Record<string, string> = {
  delta: 'Delta',
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  gitea: 'Gitea',
};

const STATUS_COLORS: Record<string, string> = {
  queued: '#64748b',
  running: '#3b82f6',
  passed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#f59e0b',
  unknown: '#64748b',
};

const PR_STATE_COLORS: Record<string, string> = {
  open: '#22c55e',
  closed: '#ef4444',
  merged: '#a855f7',
};

export function ForgePanel() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ provider: 'github', baseUrl: '', token: '' });
  const [selectedForge, setSelectedForge] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<{ owner: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'pulls' | 'pipelines'>('pulls');

  const connectionsQuery = useQuery({
    queryKey: ['forgeConnections'],
    queryFn: fetchForgeConnections,
    refetchInterval: 60_000,
  });

  const addMut = useMutation({
    mutationFn: (data: { provider: string; baseUrl: string; token?: string }) =>
      addForgeConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forgeConnections'] });
      setShowAddForm(false);
      setAddForm({ provider: 'github', baseUrl: '', token: '' });
    },
  });

  const removeMut = useMutation({
    mutationFn: removeForgeConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forgeConnections'] });
      if (selectedForge) setSelectedForge(null);
    },
  });

  const reposQuery = useQuery({
    queryKey: ['forgeRepos', selectedForge],
    queryFn: () => fetchForgeRepos(selectedForge!),
    enabled: !!selectedForge,
  });

  const pullsQuery = useQuery({
    queryKey: ['forgePulls', selectedForge, selectedRepo?.owner, selectedRepo?.name],
    queryFn: () => fetchForgePulls(selectedForge!, selectedRepo!.owner, selectedRepo!.name),
    enabled: !!selectedForge && !!selectedRepo && activeTab === 'pulls',
  });

  const pipelinesQuery = useQuery({
    queryKey: ['forgePipelines', selectedForge, selectedRepo?.owner, selectedRepo?.name],
    queryFn: () => fetchForgePipelines(selectedForge!, selectedRepo!.owner, selectedRepo!.name),
    enabled: !!selectedForge && !!selectedRepo && activeTab === 'pipelines',
  });

  const connections = connectionsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Code Forges
        </h3>
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add Forge'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="card p-3 space-y-2">
          <select
            className="w-full text-xs p-1.5 rounded border border-border bg-background"
            value={addForm.provider}
            onChange={(e) => setAddForm({ ...addForm, provider: e.target.value })}
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="delta">Delta</option>
            <option value="gitea">Gitea</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
          <input
            className="w-full text-xs p-1.5 rounded border border-border bg-background"
            placeholder="Base URL (e.g. https://github.com)"
            value={addForm.baseUrl}
            onChange={(e) => setAddForm({ ...addForm, baseUrl: e.target.value })}
          />
          <input
            className="w-full text-xs p-1.5 rounded border border-border bg-background"
            placeholder="Token (optional)"
            type="password"
            value={addForm.token}
            onChange={(e) => setAddForm({ ...addForm, token: e.target.value })}
          />
          <button
            className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={!addForm.baseUrl || addMut.isPending}
            onClick={() =>
              addMut.mutate({
                provider: addForm.provider,
                baseUrl: addForm.baseUrl,
                token: addForm.token || undefined,
              })
            }
          >
            {addMut.isPending ? 'Adding...' : 'Add Connection'}
          </button>
          {addMut.error && (
            <p className="text-xs text-red-500">{(addMut.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Connection cards */}
      {connections.length === 0 && !showAddForm && (
        <p className="text-xs text-muted-foreground">No forge connections configured</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {connections.map((conn: ForgeConnection) => (
          <div
            key={conn.key}
            className={`card p-3 cursor-pointer transition-colors ${
              selectedForge === conn.key ? 'ring-1 ring-primary' : ''
            }`}
            onClick={() => {
              setSelectedForge(selectedForge === conn.key ? null : conn.key);
              setSelectedRepo(null);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {PROVIDER_LABELS[conn.provider] ?? conn.provider}
                </span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">{conn.key}</span>
              </div>
              <button
                className="text-[10px] text-red-500 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMut.mutate(conn.key);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Repos list */}
      {selectedForge && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Repositories</h4>
          {reposQuery.isLoading && (
            <p className="text-xs text-muted-foreground">Loading repos...</p>
          )}
          {reposQuery.error && (
            <p className="text-xs text-red-500">{(reposQuery.error as Error).message}</p>
          )}
          {reposQuery.data && reposQuery.data.length === 0 && (
            <p className="text-xs text-muted-foreground">No repositories found</p>
          )}
          <div className="space-y-1">
            {(reposQuery.data ?? []).map((repo: ForgeRepo) => (
              <div
                key={repo.id}
                className={`card p-2 cursor-pointer text-xs ${
                  selectedRepo?.owner === repo.owner && selectedRepo?.name === repo.name
                    ? 'ring-1 ring-primary'
                    : ''
                }`}
                onClick={() =>
                  setSelectedRepo(
                    selectedRepo?.owner === repo.owner && selectedRepo?.name === repo.name
                      ? null
                      : { owner: repo.owner, name: repo.name }
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{repo.fullName}</span>
                  <span className="text-muted-foreground/60">{repo.visibility}</span>
                </div>
                {repo.description && (
                  <p className="text-muted-foreground mt-0.5 truncate">{repo.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PR / Pipeline tabs */}
      {selectedForge && selectedRepo && (
        <div>
          <div className="flex gap-2 mb-2">
            <button
              className={`text-xs px-2 py-1 rounded ${
                activeTab === 'pulls' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => setActiveTab('pulls')}
            >
              Pull Requests
            </button>
            <button
              className={`text-xs px-2 py-1 rounded ${
                activeTab === 'pipelines' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => setActiveTab('pipelines')}
            >
              Pipelines
            </button>
          </div>

          {activeTab === 'pulls' && (
            <PullsList pulls={pullsQuery.data} isLoading={pullsQuery.isLoading} error={pullsQuery.error} />
          )}
          {activeTab === 'pipelines' && (
            <PipelinesList
              pipelines={pipelinesQuery.data}
              isLoading={pipelinesQuery.isLoading}
              error={pipelinesQuery.error}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PullsList({
  pulls,
  isLoading,
  error,
}: {
  pulls: ForgePullRequest[] | undefined;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading PRs...</p>;
  if (error) return <p className="text-xs text-red-500">{error.message}</p>;
  if (!pulls || pulls.length === 0)
    return <p className="text-xs text-muted-foreground">No pull requests</p>;

  return (
    <div className="space-y-1">
      {pulls.map((pr: ForgePullRequest) => (
        <div key={pr.id} className="card p-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: PR_STATE_COLORS[pr.state] ?? '#64748b' }}
              />
              <span className="font-medium">
                #{pr.number} {pr.title}
              </span>
            </div>
            <span className="text-muted-foreground/60">{pr.state}</span>
          </div>
          <p className="text-muted-foreground mt-0.5">
            {pr.sourceBranch} → {pr.targetBranch} by {pr.author}
          </p>
        </div>
      ))}
    </div>
  );
}

function PipelinesList({
  pipelines,
  isLoading,
  error,
}: {
  pipelines: ForgePipeline[] | undefined;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading pipelines...</p>;
  if (error) return <p className="text-xs text-red-500">{error.message}</p>;
  if (!pipelines || pipelines.length === 0)
    return <p className="text-xs text-muted-foreground">No pipelines</p>;

  return (
    <div className="space-y-1">
      {pipelines.map((pl: ForgePipeline) => (
        <div key={pl.id} className="card p-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: STATUS_COLORS[pl.status] ?? '#64748b' }}
              />
              <span className="font-medium">{pl.name}</span>
            </div>
            <span className="text-muted-foreground/60">{pl.status}</span>
          </div>
          <p className="text-muted-foreground mt-0.5">
            {pl.ref} @ {pl.sha.slice(0, 7)}
          </p>
        </div>
      ))}
    </div>
  );
}
