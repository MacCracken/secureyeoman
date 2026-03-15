/**
 * CommunitySkillsSection — skills content type for CommunityTab.
 * Extracted from CommunityTab. Includes search, personality selector, category filter, paginated grid.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, GitBranch, Loader2, AlertCircle, Users } from 'lucide-react';
import { fetchMarketplaceSkills, fetchPersonalities } from '../../api/client';
import type { CatalogSkill } from '../../types';
import {
  SkillCard,
  PersonalitySelector,
  CategoryFilter,
  CategoryGroupedGrid,
  COMMUNITY_PAGE_SIZE,
} from './shared';
import type { useCatalogInstall, useCommunitySync } from './hooks';

interface CommunitySkillsSectionProps {
  catalog: ReturnType<typeof useCatalogInstall>;
  sync: ReturnType<typeof useCommunitySync>;
  statusData: { communityRepoPath?: string | null; lastSyncedAt?: number | null } | undefined;
  lastSynced: string | null;
  selectedPersonalityId: string;
  setSelectedPersonalityId: (id: string) => void;
  onPreview: (skill: CatalogSkill) => void;
}

export function CommunitySkillsSection({
  catalog,
  sync,
  statusData,
  lastSynced,
  selectedPersonalityId,
  setSelectedPersonalityId,
  onPreview,
}: CommunitySkillsSectionProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('');

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalities = personalitiesData?.personalities ?? [];

  const canInstall = !!selectedPersonalityId;

  useEffect(() => {
    setPage(0);
  }, [query, selectedPersonalityId, selectedCategory]);

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

  // Unfiltered query for category counts
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
        undefined
      ),
  });

  const skills: CatalogSkill[] = (data?.skills ?? []).filter(
    (s) => s.category !== 'theme' && s.category !== 'personality'
  );

  const allSkills = (allSkillsData?.skills ?? []).filter(
    (s) => s.category !== 'theme' && s.category !== 'personality'
  );
  const categoryCounts = allSkills.reduce<Record<string, number>>((acc, s) => {
    const cat = s.category || 'general';
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  return (
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
          onClick={sync.triggerSync}
          disabled={sync.syncMut.isPending}
          className="btn btn-secondary flex items-center gap-2 whitespace-nowrap"
          title={
            statusData?.communityRepoPath
              ? `Sync from ${statusData.communityRepoPath}`
              : 'Sync from community repo'
          }
        >
          <RefreshCw className={`w-4 h-4 ${sync.syncMut.isPending ? 'animate-spin' : ''}`} />
          {sync.syncMut.isPending ? 'Syncing…' : 'Sync'}
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
            Click <strong>Sync</strong> to import skills from the community repo — git fetch runs
            automatically when <span className="font-mono">allowCommunityGitFetch</span> is enabled.
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
  );
}
