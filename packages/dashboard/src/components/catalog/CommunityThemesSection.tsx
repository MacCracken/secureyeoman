/**
 * CommunityThemesSection — themes content type for CommunityTab.
 * Extracted from inline IIFE block in CommunityTab.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, RefreshCw, Palette } from 'lucide-react';
import { fetchMarketplaceSkills } from '../../api/client';
import type { CatalogSkill } from '../../types';
import { SkillCard, CategoryFilter } from './shared';
import type { useCatalogInstall, useCommunitySync } from './hooks';

interface CommunityThemesSectionProps {
  selectedPersonalityId: string;
  catalog: ReturnType<typeof useCatalogInstall>;
  sync: ReturnType<typeof useCommunitySync>;
  onPreview: (skill: CatalogSkill) => void;
}

export function CommunityThemesSection({
  selectedPersonalityId,
  catalog,
  sync,
  onPreview,
}: CommunityThemesSectionProps) {
  const [themeQuery, setThemeQuery] = useState('');
  const [selectedThemeCategory, setSelectedThemeCategory] = useState('');

  const canInstall = !!selectedPersonalityId;

  const { data: themesData, isLoading: themesLoading } = useQuery({
    queryKey: ['marketplace-community-themes', themeQuery],
    queryFn: () =>
      fetchMarketplaceSkills(
        themeQuery || undefined,
        'community',
        undefined,
        undefined,
        500,
        0,
        'theme'
      ),
  });

  const allThemes = themesData?.skills ?? [];

  const getThemeSubCategory = (s: CatalogSkill) => {
    const tag = s.tags?.find((t: string) => t.startsWith('theme:'));
    return tag ? tag.replace('theme:', '') : 'general';
  };

  const themeCategoryCounts = allThemes.reduce<Record<string, number>>((acc, s) => {
    const cat = getThemeSubCategory(s);
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  const filteredThemes = selectedThemeCategory
    ? allThemes.filter((s) => getThemeSubCategory(s) === selectedThemeCategory)
    : allThemes;

  return (
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
            }}
          />
        </div>
        <button
          onClick={sync.triggerSync}
          disabled={sync.syncMut.isPending}
          className="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${sync.syncMut.isPending ? 'animate-spin' : ''}`} />
          {sync.syncMut.isPending ? 'Syncing…' : 'Sync'}
        </button>
      </div>
      {themesLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : allThemes.length === 0 ? (
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
            <span className="text-xs text-muted-foreground">({allThemes.length})</span>
          </div>
          {Object.keys(themeCategoryCounts).length > 1 && (
            <CategoryFilter
              value={selectedThemeCategory}
              onChange={setSelectedThemeCategory}
              counts={themeCategoryCounts}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredThemes.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                badge={
                  <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    <Palette className="w-2.5 h-2.5" />
                    Theme
                  </span>
                }
                installing={catalog.isInstalling(skill.id)}
                uninstalling={catalog.isUninstalling(skill.id)}
                onPreview={() => { onPreview(skill); }}
                onInstall={() => {
                  if (!canInstall) return;
                  catalog.setInstallingId(skill.id);
                  catalog.installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId });
                }}
                onUninstall={() => {
                  catalog.setUninstallingId(skill.id);
                  catalog.uninstallMut.mutate({
                    id: skill.id,
                    personalityId: selectedPersonalityId || undefined,
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
