import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Store, Search, Loader2, Palette, UserCircle } from 'lucide-react';
import {
  fetchMarketplaceSkills,
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
  type ContentType,
} from './shared';

export function MarketplaceTab({
  workflowsEnabled = false,
  subAgentsEnabled = false,
  initialContentType,
}: {
  workflowsEnabled?: boolean;
  subAgentsEnabled?: boolean;
  initialContentType?: ContentType;
} = {}) {
  const queryClient = useQueryClient();
  const hiddenTypes: ContentType[] = [
    ...(!workflowsEnabled ? ['workflows' as const] : []),
    ...(!subAgentsEnabled ? ['swarms' as const] : []),
  ];
  const [contentType, setContentType] = useState<ContentType>(initialContentType ?? 'skills');

  // Sync from parent when navigating with a specific content type
  useEffect(() => {
    if (initialContentType) setContentType(initialContentType);
  }, [initialContentType]);

  const [query, setQuery] = useState('');
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [previewSkill, setPreviewSkill] = useState<CatalogSkill | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const personalityInitialized = useRef(false);

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonality = personalities.find((p) => p.isActive);

  // Pre-select the active personality once — user can then switch to Global or any other
  useEffect(() => {
    if (activePersonality && !personalityInitialized.current) {
      personalityInitialized.current = true;
      setSelectedPersonalityId(activePersonality.id);
    }
  }, [activePersonality]);

  // Fetch marketplace (builtin + published) skills — exclude community via origin filter
  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', query, selectedPersonalityId],
    queryFn: () =>
      fetchMarketplaceSkills(
        query || undefined,
        undefined,
        selectedPersonalityId,
        'marketplace',
        200,
        undefined,
        undefined
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
  };

  const installMut = useMutation({
    mutationFn: ({ id, personalityId }: { id: string; personalityId?: string }) =>
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

  // Separate builtin and published, exclude community
  const allRaw = (data?.skills ?? []).filter((s: CatalogSkill) => s.source !== 'community');
  // Split out theme and personality items for their dedicated tabs
  const themeSkills = allRaw.filter((s: CatalogSkill) => s.category === 'theme');
  const personalitySkills = allRaw.filter((s: CatalogSkill) => s.category === 'personality');
  const allSkills =
    contentType === 'skills'
      ? allRaw.filter((s: CatalogSkill) => s.category !== 'theme' && s.category !== 'personality')
      : allRaw;
  // Build category counts from full set (before client-side category filter)
  const categoryCounts = allSkills.reduce<Record<string, number>>((acc, s) => {
    const cat = s.category || 'general';
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  // Apply client-side category filter
  const filteredSkills = selectedCategory
    ? allSkills.filter((s: CatalogSkill) => (s.category || 'general') === selectedCategory)
    : allSkills;
  const builtinSkills = filteredSkills.filter((s: CatalogSkill) => s.source === 'builtin');
  const publishedSkills = filteredSkills.filter((s: CatalogSkill) => s.source === 'published');

  const renderCard = (skill: CatalogSkill, badgeFn?: (s: CatalogSkill) => React.ReactNode) => (
    <SkillCard
      key={skill.id}
      skill={skill}
      badge={badgeFn?.(skill)}
      installing={installingId === skill.id && installMut.isPending}
      uninstalling={uninstallingId === skill.id && uninstallMut.isPending}
      onPreview={() => {
        setPreviewSkill(skill);
      }}
      onInstall={() => {
        setInstallingId(skill.id);
        installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId || undefined });
      }}
      onUninstall={() => {
        setUninstallingId(skill.id);
        uninstallMut.mutate({
          id: skill.id,
          personalityId: selectedPersonalityId || undefined,
        });
      }}
    />
  );

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
            setInstallingId(previewSkill.id);
            installMut.mutate({
              id: previewSkill.id,
              personalityId: selectedPersonalityId || undefined,
            });
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
          }}
          hiddenTypes={hiddenTypes}
        />

        {/* Workflows / Swarms passthrough */}
        {contentType === 'workflows' && (
          <ContentSuspense>
            <LazyWorkflowsTab source="builtin" />
          </ContentSuspense>
        )}
        {contentType === 'swarms' && (
          <ContentSuspense>
            <LazySwarmTemplatesTab />
          </ContentSuspense>
        )}

        {/* Themes view */}
        {contentType === 'themes' && (
          <>
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="Search themes…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
              />
            </div>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : themeSkills.length === 0 ? (
              <div className="card p-12 text-center">
                <Palette className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No themes found</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Themes</h3>
                  <span className="text-xs text-muted-foreground">({themeSkills.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {themeSkills.map((s) =>
                    renderCard(s, () => (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        <Palette className="w-2.5 h-2.5" />
                        Theme
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Personalities view */}
        {contentType === 'personalities' && (
          <>
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="Search personalities…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
              />
            </div>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : personalitySkills.length === 0 ? (
              <div className="card p-12 text-center">
                <UserCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No personalities found</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Personalities</h3>
                  <span className="text-xs text-muted-foreground">
                    ({personalitySkills.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {personalitySkills.map((s) =>
                    renderCard(s, () => (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        <UserCircle className="w-2.5 h-2.5" />
                        Personality
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Skills toolbar + grid */}
        {contentType === 'skills' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search skills…"
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
            </div>

            {/* Category filter */}
            <CategoryFilter
              value={selectedCategory}
              onChange={setSelectedCategory}
              counts={categoryCounts}
            />

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="card p-12 text-center">
                <Store className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {query ? 'No skills found' : 'Marketplace is empty'}
                </p>
              </div>
            ) : (
              /* When showing all categories, group by category within each source section */
              <div className="space-y-8">
                {builtinSkills.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">YEOMAN Skills</h3>
                      <span className="text-xs text-muted-foreground">
                        ({builtinSkills.length})
                      </span>
                    </div>
                    <CategoryGroupedGrid skills={builtinSkills} renderCard={(s) => renderCard(s)} />
                  </section>
                )}

                {publishedSkills.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Store className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">Published</h3>
                      <span className="text-xs text-muted-foreground">
                        ({publishedSkills.length})
                      </span>
                    </div>
                    <CategoryGroupedGrid
                      skills={publishedSkills}
                      renderCard={(s) => renderCard(s)}
                    />
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
