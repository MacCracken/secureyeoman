import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, GitBranch, Search, Loader2, AlertCircle, CheckCircle, Users } from 'lucide-react';
import {
  fetchMarketplaceSkills,
  syncCommunitySkills,
  fetchCommunityStatus,
  installMarketplaceSkill,
  uninstallMarketplaceSkill,
  fetchPersonalities,
} from '../../api/client';
import type { CatalogSkill } from '../../types';
import {
  SkillCard,
  SkillPreviewModal,
  PersonalitySelector,
  ContentTypeSelector,
  ContentSuspense,
  LazyWorkflowsTab,
  LazySwarmTemplatesTab,
  COMMUNITY_PAGE_SIZE,
  type ContentType,
} from './shared';

type SyncResult = {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
  errors: string[];
  workflowsAdded?: number;
  workflowsUpdated?: number;
  swarmsAdded?: number;
  swarmsUpdated?: number;
};

export function CommunityTab({ workflowsEnabled = false, subAgentsEnabled = false }: { workflowsEnabled?: boolean; subAgentsEnabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const hiddenTypes: ContentType[] = [
    ...(!workflowsEnabled ? ['workflows' as const] : []),
    ...(!subAgentsEnabled ? ['swarms' as const] : []),
  ];
  const [contentType, setContentType] = useState<ContentType>('skills');
  const [query, setQuery] = useState('');
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('');
  const personalityInitialized = useRef(false);
  const [page, setPage] = useState(0);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [previewSkill, setPreviewSkill] = useState<CatalogSkill | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [swarmQuery, setSwarmQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace-community', query, selectedPersonalityId, page],
    queryFn: () =>
      fetchMarketplaceSkills(
        query || undefined,
        'community',
        selectedPersonalityId,
        undefined,
        COMMUNITY_PAGE_SIZE,
        page * COMMUNITY_PAGE_SIZE
      ),
  });

  const { data: statusData } = useQuery({
    queryKey: ['community-status'],
    queryFn: fetchCommunityStatus,
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonality = personalities.find((p) => p.isActive);

  useEffect(() => {
    if (activePersonality && !personalityInitialized.current) {
      personalityInitialized.current = true;
      setSelectedPersonalityId(activePersonality.id);
    }
  }, [activePersonality]);

  useEffect(() => {
    setPage(0);
  }, [query, selectedPersonalityId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['marketplace-community'] });
    void queryClient.invalidateQueries({ queryKey: ['community-status'] });
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
    void queryClient.invalidateQueries({ queryKey: ['community-workflows'] });
    void queryClient.invalidateQueries({ queryKey: ['community-swarm-templates'] });
  };

  const syncMut = useMutation({
    mutationFn: syncCommunitySkills,
    onSuccess: (result) => {
      setSyncResult(result);
      invalidate();
    },
  });

  const installMut = useMutation({
    mutationFn: ({ id, personalityId }: { id: string; personalityId: string }) =>
      installMarketplaceSkill(id, personalityId),
    onSuccess: () => {
      invalidate();
      setInstallingId(null);
    },
    onError: () => {
      setInstallingId(null);
    },
  });

  const uninstallMut = useMutation({
    mutationFn: ({ id, personalityId }: { id: string; personalityId?: string }) =>
      uninstallMarketplaceSkill(id, personalityId),
    onSuccess: () => {
      invalidate();
      setUninstallingId(null);
    },
    onError: () => {
      setUninstallingId(null);
    },
  });

  const skills: CatalogSkill[] = data?.skills ?? [];
  const canInstall = !!selectedPersonalityId;

  const lastSynced = statusData?.lastSyncedAt
    ? new Date(statusData.lastSyncedAt).toLocaleString()
    : null;

  return (
    <>
      {previewSkill && (
        <SkillPreviewModal
          skill={previewSkill}
          onClose={() => {
            setPreviewSkill(null);
          }}
          installing={installingId === previewSkill.id && installMut.isPending}
          uninstalling={uninstallingId === previewSkill.id && uninstallMut.isPending}
          onInstall={() => {
            if (!canInstall) return;
            setInstallingId(previewSkill.id);
            installMut.mutate({ id: previewSkill.id, personalityId: selectedPersonalityId });
            setPreviewSkill(null);
          }}
          onUninstall={() => {
            setUninstallingId(previewSkill.id);
            uninstallMut.mutate({
              id: previewSkill.id,
              personalityId: selectedPersonalityId || undefined,
            });
            setPreviewSkill(null);
          }}
        />
      )}

      <div className="space-y-6">
        {/* Type selector */}
        <ContentTypeSelector
          value={contentType}
          onChange={(v) => {
            setContentType(v);
            setPage(0);
          }}
          hiddenTypes={hiddenTypes}
        />

        {/* Workflows — community-only */}
        {contentType === 'workflows' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search community workflows…"
                  value={workflowQuery}
                  onChange={(e) => setWorkflowQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => { setSyncResult(null); syncMut.mutate(); }}
                disabled={syncMut.isPending}
                className="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
                title={statusData?.communityRepoPath ? `Sync from ${statusData.communityRepoPath}` : 'Sync from community repo'}
              >
                <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                {syncMut.isPending ? 'Syncing…' : 'Sync'}
              </button>
            </div>
            {statusData && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono truncate">{statusData.communityRepoPath ?? 'No path configured'}</span>
                {lastSynced && <span className="shrink-0">· Last synced {lastSynced}</span>}
              </div>
            )}
            {syncResult && (
              <div className={`p-3 rounded-lg border text-xs space-y-1 ${syncResult.errors.length > 0 ? 'bg-warning/10 border-warning/20' : 'bg-success/10 border-success/20'}`}>
                <div className="flex items-center gap-2 font-medium">
                  {syncResult.errors.length > 0 ? <AlertCircle className="w-4 h-4 text-warning" /> : <CheckCircle className="w-4 h-4 text-success" />}
                  Sync complete
                </div>
                <div className="text-muted-foreground space-y-0.5">
                  {(syncResult.workflowsAdded !== undefined || syncResult.workflowsUpdated !== undefined) && (
                    <p>Workflows: {syncResult.workflowsAdded ?? 0} added, {syncResult.workflowsUpdated ?? 0} updated</p>
                  )}
                  {syncResult.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {syncResult.errors.map((e, i) => <li key={i} className="truncate">· {e}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
            <ContentSuspense>
              <LazyWorkflowsTab source="community" query={workflowQuery} />
            </ContentSuspense>
          </>
        )}

        {/* Swarm templates — community-only */}
        {contentType === 'swarms' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search community swarm templates…"
                  value={swarmQuery}
                  onChange={(e) => setSwarmQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => { setSyncResult(null); syncMut.mutate(); }}
                disabled={syncMut.isPending}
                className="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
                title={statusData?.communityRepoPath ? `Sync from ${statusData.communityRepoPath}` : 'Sync from community repo'}
              >
                <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                {syncMut.isPending ? 'Syncing…' : 'Sync'}
              </button>
            </div>
            {statusData && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono truncate">{statusData.communityRepoPath ?? 'No path configured'}</span>
                {lastSynced && <span className="shrink-0">· Last synced {lastSynced}</span>}
              </div>
            )}
            {syncResult && (
              <div className={`p-3 rounded-lg border text-xs space-y-1 ${syncResult.errors.length > 0 ? 'bg-warning/10 border-warning/20' : 'bg-success/10 border-success/20'}`}>
                <div className="flex items-center gap-2 font-medium">
                  {syncResult.errors.length > 0 ? <AlertCircle className="w-4 h-4 text-warning" /> : <CheckCircle className="w-4 h-4 text-success" />}
                  Sync complete
                </div>
                <div className="text-muted-foreground space-y-0.5">
                  {(syncResult.swarmsAdded !== undefined || syncResult.swarmsUpdated !== undefined) && (
                    <p>Swarm templates: {syncResult.swarmsAdded ?? 0} added, {syncResult.swarmsUpdated ?? 0} updated</p>
                  )}
                  {syncResult.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {syncResult.errors.map((e, i) => <li key={i} className="truncate">· {e}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
            <ContentSuspense>
              <LazySwarmTemplatesTab source="community" query={swarmQuery} />
            </ContentSuspense>
          </>
        )}

        {/* Skills content */}
        {contentType === 'skills' && (
          <>
            {/* Search + personality selector + sync button */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search community skills…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                />
              </div>

              <PersonalitySelector
                personalities={personalities}
                value={selectedPersonalityId}
                onChange={setSelectedPersonalityId}
              />

              <button
                onClick={() => {
                  setSyncResult(null);
                  syncMut.mutate();
                }}
                disabled={syncMut.isPending}
                className="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
                title={
                  statusData?.communityRepoPath
                    ? `Sync from ${statusData.communityRepoPath}`
                    : 'Sync from community repo'
                }
              >
                <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                {syncMut.isPending ? 'Syncing…' : 'Sync'}
              </button>
            </div>

            {/* Repo path + last synced */}
            {statusData && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono truncate">
                  {statusData.communityRepoPath ?? 'No path configured'}
                </span>
                {lastSynced && <span className="shrink-0">· Last synced {lastSynced}</span>}
              </div>
            )}

            {/* Per-personality notice */}
            {!canInstall && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning-foreground">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Select a personality above — community skills must be installed per-personality.
              </div>
            )}

            {/* Sync result */}
            {syncResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-1 ${
                  syncResult.errors.length > 0
                    ? 'bg-warning/10 border-warning/20'
                    : 'bg-success/10 border-success/20'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {syncResult.errors.length > 0 ? (
                    <AlertCircle className="w-4 h-4 text-warning" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-success" />
                  )}
                  Sync complete
                </div>
                <div className="text-muted-foreground space-y-0.5">
                  <p>
                    Skills: {syncResult.added} added, {syncResult.updated} updated,{' '}
                    {syncResult.skipped} skipped
                    {syncResult.removed > 0 && `, ${syncResult.removed} removed`}
                    {syncResult.errors.length > 0 && `, ${syncResult.errors.length} error(s)`}
                  </p>
                  {(syncResult.workflowsAdded !== undefined ||
                    syncResult.workflowsUpdated !== undefined) && (
                    <p>
                      Workflows: {syncResult.workflowsAdded ?? 0} added,{' '}
                      {syncResult.workflowsUpdated ?? 0} updated
                    </p>
                  )}
                  {(syncResult.swarmsAdded !== undefined ||
                    syncResult.swarmsUpdated !== undefined) && (
                    <p>
                      Swarm templates: {syncResult.swarmsAdded ?? 0} added,{' '}
                      {syncResult.swarmsUpdated ?? 0} updated
                    </p>
                  )}
                  {syncResult.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {syncResult.errors.map((e, i) => (
                        <li key={i} className="truncate">· {e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Skills grid */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : skills.length === 0 ? (
              <div className="card p-12 text-center space-y-3">
                <Users className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground font-medium">No community skills found</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Click <strong>Sync</strong> to import skills from the community repo — git fetch
                  runs automatically when{' '}
                  <span className="font-mono">allowCommunityGitFetch</span> is enabled.
                </p>
                {statusData?.communityRepoPath && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {statusData.communityRepoPath}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Community Skills</h3>
                  <span className="text-xs text-muted-foreground">
                    ({data?.total ?? skills.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {skills.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      badge={
                        <span className="inline-flex items-center gap-1 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          <GitBranch className="w-2.5 h-2.5" />
                          Community
                        </span>
                      }
                      installing={installingId === skill.id && installMut.isPending}
                      uninstalling={uninstallingId === skill.id && uninstallMut.isPending}
                      onPreview={() => {
                        setPreviewSkill(skill);
                      }}
                      onInstall={() => {
                        if (!canInstall) return;
                        setInstallingId(skill.id);
                        installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId });
                      }}
                      onUninstall={() => {
                        setUninstallingId(skill.id);
                        uninstallMut.mutate({
                          id: skill.id,
                          personalityId: selectedPersonalityId || undefined,
                        });
                      }}
                    />
                  ))}
                </div>
                {(data?.total ?? 0) > COMMUNITY_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      Showing {page * COMMUNITY_PAGE_SIZE + 1}–
                      {Math.min((page + 1) * COMMUNITY_PAGE_SIZE, data?.total ?? 0)} of{' '}
                      {data?.total ?? 0}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={page === 0}
                        onClick={() => {
                          setPage((p) => p - 1);
                        }}
                      >
                        ← Prev
                      </button>
                      <span className="text-xs text-muted-foreground">
                        Page {page + 1} of {Math.ceil((data?.total ?? 0) / COMMUNITY_PAGE_SIZE)}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={(page + 1) * COMMUNITY_PAGE_SIZE >= (data?.total ?? 0)}
                        onClick={() => {
                          setPage((p) => p + 1);
                        }}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
