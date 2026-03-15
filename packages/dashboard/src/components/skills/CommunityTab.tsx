import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  GitBranch,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  X,
} from 'lucide-react';
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
  CategoryFilter,
  CategoryGroupedGrid,
  COMMUNITY_PAGE_SIZE,
  type ContentType,
} from './shared';
import { Palette, UserCircle } from 'lucide-react';

interface SyncResult {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
  errors: string[];
  workflowsAdded?: number;
  workflowsUpdated?: number;
  swarmsAdded?: number;
  swarmsUpdated?: number;
  themesAdded?: number;
  themesUpdated?: number;
  personalitiesAdded?: number;
  personalitiesUpdated?: number;
}

export function CommunityTab({
  workflowsEnabled = false,
  subAgentsEnabled = false,
}: { workflowsEnabled?: boolean; subAgentsEnabled?: boolean } = {}) {
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
  const [selectedCategory, setSelectedCategory] = useState('');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [swarmQuery, setSwarmQuery] = useState('');
  const [themeQuery, setThemeQuery] = useState('');
  const [themePage, setThemePage] = useState(0);
  const [personalityQuery, setPersonalityQuery] = useState('');
  const [personalityPage, setPersonalityPage] = useState(0);
  const [selectedPersonalityCategory, setSelectedPersonalityCategory] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace-community', query, selectedPersonalityId, page, selectedCategory],
    queryFn: () =>
      fetchMarketplaceSkills(
        query || undefined,
        'community',
        selectedPersonalityId,
        undefined,
        COMMUNITY_PAGE_SIZE,
        page * COMMUNITY_PAGE_SIZE,
        selectedCategory || undefined
      ),
  });

  const { data: themesData, isLoading: themesLoading } = useQuery({
    queryKey: ['marketplace-community-themes', themeQuery, themePage],
    queryFn: () =>
      fetchMarketplaceSkills(
        themeQuery || undefined,
        'community',
        undefined,
        undefined,
        COMMUNITY_PAGE_SIZE,
        themePage * COMMUNITY_PAGE_SIZE,
        'theme'
      ),
    enabled: contentType === 'themes',
  });

  const { data: personalitiesSkillData, isLoading: personalitiesSkillLoading } = useQuery({
    queryKey: ['marketplace-community-personalities', personalityQuery, personalityPage],
    queryFn: () =>
      fetchMarketplaceSkills(
        personalityQuery || undefined,
        'community',
        undefined,
        undefined,
        COMMUNITY_PAGE_SIZE,
        personalityPage * COMMUNITY_PAGE_SIZE,
        'personality'
      ),
    enabled: contentType === 'personalities',
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
  }, [query, selectedPersonalityId, selectedCategory]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['marketplace-community'] });
    void queryClient.invalidateQueries({ queryKey: ['community-status'] });
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
    void queryClient.invalidateQueries({ queryKey: ['community-workflows'] });
    void queryClient.invalidateQueries({ queryKey: ['community-swarm-templates'] });
    void queryClient.invalidateQueries({ queryKey: ['personalities-community'] });
    void queryClient.invalidateQueries({ queryKey: ['personalities'] });
    void queryClient.invalidateQueries({ queryKey: ['marketplace-community-personalities'] });
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

  // Separate unfiltered query for category counts — so pills stay visible when a category is selected
  const { data: allSkillsData } = useQuery({
    queryKey: ['marketplace-community-counts', query, selectedPersonalityId],
    queryFn: () =>
      fetchMarketplaceSkills(
        query || undefined,
        'community',
        selectedPersonalityId,
        undefined,
        1000,
        0,
        undefined // no category filter
      ),
  });

  // Exclude theme and personality items from the skills view — they have dedicated tabs
  const skills: CatalogSkill[] = (data?.skills ?? []).filter(
    (s) => s.category !== 'theme' && s.category !== 'personality'
  );
  const canInstall = !!selectedPersonalityId;

  // Build category counts from UNFILTERED data so all pills stay visible
  const allSkills = (allSkillsData?.skills ?? []).filter(
    (s) => s.category !== 'theme' && s.category !== 'personality'
  );
  const categoryCounts = allSkills.reduce<Record<string, number>>((acc, s) => {
    const cat = s.category || 'general';
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

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

        {/* Sync result — visible on all tabs until dismissed */}
        {syncResult && (
          <div
            className={`p-3 rounded-lg border text-xs space-y-1 ${
              syncResult.errors.length > 0
                ? 'bg-warning/10 border-warning/20'
                : 'bg-success/10 border-success/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                {syncResult.errors.length > 0 ? (
                  <AlertCircle className="w-4 h-4 text-warning" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-success" />
                )}
                Sync complete
              </div>
              <button
                onClick={() => {
                  setSyncResult(null);
                }}
                className="text-muted-foreground hover:text-foreground p-0.5"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-muted-foreground space-y-0.5">
              <p>
                Skills: {syncResult.added} added, {syncResult.updated} updated, {syncResult.skipped}{' '}
                skipped
                {syncResult.removed > 0 && `, ${syncResult.removed} removed`}
                {syncResult.errors.length > 0 && `, ${syncResult.errors.length} error(s)`}
              </p>
              {(syncResult.themesAdded !== undefined || syncResult.themesUpdated !== undefined) && (
                <p>
                  Themes: {syncResult.themesAdded ?? 0} added, {syncResult.themesUpdated ?? 0}{' '}
                  updated
                </p>
              )}
              {(syncResult.personalitiesAdded !== undefined ||
                syncResult.personalitiesUpdated !== undefined) && (
                <p>
                  Personalities: {syncResult.personalitiesAdded ?? 0} added,{' '}
                  {syncResult.personalitiesUpdated ?? 0} updated
                </p>
              )}
              {workflowsEnabled &&
                (syncResult.workflowsAdded !== undefined ||
                  syncResult.workflowsUpdated !== undefined) && (
                  <p>
                    Workflows: {syncResult.workflowsAdded ?? 0} added,{' '}
                    {syncResult.workflowsUpdated ?? 0} updated
                  </p>
                )}
              {subAgentsEnabled &&
                (syncResult.swarmsAdded !== undefined ||
                  syncResult.swarmsUpdated !== undefined) && (
                  <p>
                    Swarm templates: {syncResult.swarmsAdded ?? 0} added,{' '}
                    {syncResult.swarmsUpdated ?? 0} updated
                  </p>
                )}
              {syncResult.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {syncResult.errors.map((e, i) => (
                    <li key={i} className="truncate">
                      · {e}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

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
                  onChange={(e) => {
                    setWorkflowQuery(e.target.value);
                  }}
                />
              </div>
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
            {statusData && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono truncate">
                  {statusData.communityRepoPath ?? 'No path configured'}
                </span>
                {lastSynced && <span className="shrink-0">· Last synced {lastSynced}</span>}
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
                  onChange={(e) => {
                    setSwarmQuery(e.target.value);
                  }}
                />
              </div>
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
            {statusData && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono truncate">
                  {statusData.communityRepoPath ?? 'No path configured'}
                </span>
                {lastSynced && <span className="shrink-0">· Last synced {lastSynced}</span>}
              </div>
            )}
            <ContentSuspense>
              <LazySwarmTemplatesTab source="community" query={swarmQuery} />
            </ContentSuspense>
          </>
        )}

        {/* Themes content */}
        {contentType === 'themes' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search community themes…"
                  value={themeQuery}
                  onChange={(e) => {
                    setThemeQuery(e.target.value);
                    setThemePage(0);
                  }}
                />
              </div>
              <button
                onClick={() => {
                  setSyncResult(null);
                  syncMut.mutate();
                }}
                disabled={syncMut.isPending}
                className="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
              >
                <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                {syncMut.isPending ? 'Syncing…' : 'Sync'}
              </button>
            </div>
            {themesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (themesData?.skills ?? []).length === 0 ? (
              <div className="card p-12 text-center space-y-3">
                <Palette className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground font-medium">No community themes found</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Click <strong>Sync</strong> to import themes from the community repo.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Community Themes</h3>
                  <span className="text-xs text-muted-foreground">({themesData?.total ?? 0})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {(themesData?.skills ?? []).map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      badge={
                        <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          <Palette className="w-2.5 h-2.5" />
                          Theme
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
                {(themesData?.total ?? 0) > COMMUNITY_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      Showing {themePage * COMMUNITY_PAGE_SIZE + 1}–
                      {Math.min((themePage + 1) * COMMUNITY_PAGE_SIZE, themesData?.total ?? 0)} of{' '}
                      {themesData?.total ?? 0}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={themePage === 0}
                        onClick={() => {
                          setThemePage((p) => p - 1);
                        }}
                      >
                        ← Prev
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={(themePage + 1) * COMMUNITY_PAGE_SIZE >= (themesData?.total ?? 0)}
                        onClick={() => {
                          setThemePage((p) => p + 1);
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

        {/* Personalities content */}
        {contentType === 'personalities' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search community personalities…"
                  value={personalityQuery}
                  onChange={(e) => {
                    setPersonalityQuery(e.target.value);
                    setPersonalityPage(0);
                  }}
                />
              </div>
              <button
                onClick={() => {
                  setSyncResult(null);
                  syncMut.mutate();
                }}
                disabled={syncMut.isPending}
                className="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
              >
                <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                {syncMut.isPending ? 'Syncing…' : 'Sync'}
              </button>
            </div>
            {personalitiesSkillLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (personalitiesSkillData?.skills ?? []).length === 0 ? (
              <div className="card p-12 text-center space-y-3">
                <UserCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground font-medium">
                  No community personalities found
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Click <strong>Sync</strong> to import personalities from the community repo.
                  Personalities are not auto-installed — browse and install the ones you want.
                </p>
              </div>
            ) : (
              (() => {
                const allPersonalities = personalitiesSkillData?.skills ?? [];
                // Extract subcategory from personality:xxx tags
                const getSubCategory = (s: CatalogSkill) => {
                  const tag = s.tags?.find((t) => t.startsWith('personality:'));
                  return tag ? tag.replace('personality:', '') : 'general';
                };
                // Build subcategory counts
                const subCategoryCounts = allPersonalities.reduce<Record<string, number>>(
                  (acc, s) => {
                    const cat = getSubCategory(s);
                    acc[cat] = (acc[cat] ?? 0) + 1;
                    return acc;
                  },
                  {}
                );
                const filtered = selectedPersonalityCategory
                  ? allPersonalities.filter(
                      (s) => getSubCategory(s) === selectedPersonalityCategory
                    )
                  : allPersonalities;

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Community Personalities
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        ({personalitiesSkillData?.total ?? 0})
                      </span>
                    </div>
                    {Object.keys(subCategoryCounts).length > 1 && (
                      <CategoryFilter
                        value={selectedPersonalityCategory}
                        onChange={setSelectedPersonalityCategory}
                        counts={subCategoryCounts}
                      />
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filtered.map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          badge={
                            <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              <UserCircle className="w-2.5 h-2.5" />
                              Personality
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
                            installMut.mutate({
                              id: skill.id,
                              personalityId: selectedPersonalityId,
                            });
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
                    {(personalitiesSkillData?.total ?? 0) > COMMUNITY_PAGE_SIZE && (
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-xs text-muted-foreground">
                          Showing {personalityPage * COMMUNITY_PAGE_SIZE + 1}–
                          {Math.min(
                            (personalityPage + 1) * COMMUNITY_PAGE_SIZE,
                            personalitiesSkillData?.total ?? 0
                          )}{' '}
                          of {personalitiesSkillData?.total ?? 0}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={personalityPage === 0}
                            onClick={() => {
                              setPersonalityPage((p) => p - 1);
                            }}
                          >
                            ← Prev
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={
                              (personalityPage + 1) * COMMUNITY_PAGE_SIZE >=
                              (personalitiesSkillData?.total ?? 0)
                            }
                            onClick={() => {
                              setPersonalityPage((p) => p + 1);
                            }}
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
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

            {/* Category filter */}
            <CategoryFilter
              value={selectedCategory}
              onChange={setSelectedCategory}
              counts={categoryCounts}
            />

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
                  runs automatically when <span className="font-mono">allowCommunityGitFetch</span>{' '}
                  is enabled.
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
                <CategoryGroupedGrid
                  skills={skills}
                  renderCard={(skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
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
                  )}
                />
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
