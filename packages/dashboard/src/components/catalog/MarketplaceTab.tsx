import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Store, Search, Loader2, Palette, UserCircle } from 'lucide-react';
import { fetchMarketplaceSkills, fetchPersonalities } from '../../api/client';
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
import { useCatalogInstall, usePersonalityInit } from './hooks';

const MARKETPLACE_INVALIDATE_KEYS = [['marketplace'], ['skills']];

export function MarketplaceTab({
  workflowsEnabled = false,
  subAgentsEnabled = false,
  initialContentType,
}: {
  workflowsEnabled?: boolean;
  subAgentsEnabled?: boolean;
  initialContentType?: ContentType;
} = {}) {
  const hiddenTypes: ContentType[] = [
    ...(!workflowsEnabled ? ['workflows' as const] : []),
    ...(!subAgentsEnabled ? ['swarms' as const] : []),
  ];
  const [contentType, setContentType] = useState<ContentType>(initialContentType ?? 'skills');

  useEffect(() => {
    if (initialContentType) setContentType(initialContentType);
  }, [initialContentType]);

  const [query, setQuery] = useState('');
  const [previewSkill, setPreviewSkill] = useState<CatalogSkill | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');

  const catalog = useCatalogInstall(MARKETPLACE_INVALIDATE_KEYS);

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalities = personalitiesData?.personalities ?? [];
  const [selectedPersonalityId, setSelectedPersonalityId] = usePersonalityInit(personalities);

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

  // Separate builtin and published, exclude community
  const allRaw = (data?.skills ?? []).filter((s: CatalogSkill) => s.source !== 'community');
  const themeSkills = allRaw.filter((s: CatalogSkill) => s.category === 'theme');
  const personalitySkills = allRaw.filter((s: CatalogSkill) => s.category === 'personality');
  const allSkills =
    contentType === 'skills'
      ? allRaw.filter((s: CatalogSkill) => s.category !== 'theme' && s.category !== 'personality')
      : allRaw;

  const categoryCounts = allSkills.reduce<Record<string, number>>((acc, s) => {
    const cat = s.category || 'general';
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

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
      installing={catalog.isInstalling(skill.id)}
      uninstalling={catalog.isUninstalling(skill.id)}
      onPreview={() => { setPreviewSkill(skill); }}
      onInstall={() => {
        catalog.setInstallingId(skill.id);
        catalog.installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId || undefined });
      }}
      onUninstall={() => {
        catalog.setUninstallingId(skill.id);
        catalog.uninstallMut.mutate({
          id: skill.id,
          personalityId: selectedPersonalityId || undefined,
        });
      }}
    />
  );

  /** Reusable grid for theme/personality item sections */
  const renderCatalogItemGrid = (
    items: CatalogSkill[],
    icon: React.ReactNode,
    label: string,
    badgeFn: (s: CatalogSkill) => React.ReactNode
  ) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((s) => renderCard(s, badgeFn))}
      </div>
    </div>
  );

  return (
    <>
      {previewSkill && (
        <SkillPreviewModal
          skill={previewSkill}
          onClose={() => { setPreviewSkill(null); }}
          installing={catalog.isInstalling(previewSkill.id)}
          uninstalling={catalog.isUninstalling(previewSkill.id)}
          onInstall={() => {
            catalog.setInstallingId(previewSkill.id);
            catalog.installMut.mutate({
              id: previewSkill.id,
              personalityId: selectedPersonalityId || undefined,
            });
            setPreviewSkill(null);
          }}
          onUninstall={() => {
            catalog.setUninstallingId(previewSkill.id);
            catalog.uninstallMut.mutate({
              id: previewSkill.id,
              personalityId: selectedPersonalityId || undefined,
            });
            setPreviewSkill(null);
          }}
        />
      )}
      <div className="space-y-6">
        <ContentTypeSelector
          value={contentType}
          onChange={(v) => { setContentType(v); }}
          hiddenTypes={hiddenTypes}
        />

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
                onChange={(e) => { setQuery(e.target.value); }}
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
              renderCatalogItemGrid(
                themeSkills,
                <Palette className="w-4 h-4 text-primary" />,
                'Themes',
                () => (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    <Palette className="w-2.5 h-2.5" />
                    Theme
                  </span>
                )
              )
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
                onChange={(e) => { setQuery(e.target.value); }}
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
              renderCatalogItemGrid(
                personalitySkills,
                <UserCircle className="w-4 h-4 text-primary" />,
                'Personalities',
                () => (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    <UserCircle className="w-2.5 h-2.5" />
                    Personality
                  </span>
                )
              )
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
                  onChange={(e) => { setQuery(e.target.value); }}
                />
              </div>
              <PersonalitySelector
                personalities={personalities}
                value={selectedPersonalityId}
                onChange={setSelectedPersonalityId}
              />
            </div>

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
