import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Store, Search, Loader2 } from 'lucide-react';
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
  type ContentType,
} from './shared';

export function MarketplaceTab({ workflowsEnabled = false, subAgentsEnabled = false }: { workflowsEnabled?: boolean; subAgentsEnabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const hiddenTypes: ContentType[] = [
    ...(!workflowsEnabled ? ['workflows' as const] : []),
    ...(!subAgentsEnabled ? ['swarms' as const] : []),
  ];
  const [contentType, setContentType] = useState<ContentType>('skills');
  const [query, setQuery] = useState('');
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [previewSkill, setPreviewSkill] = useState<CatalogSkill | null>(null);
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
        200
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
  const allSkills = (data?.skills ?? []).filter((s: CatalogSkill) => s.source !== 'community');
  const builtinSkills = allSkills.filter((s: CatalogSkill) => s.source === 'builtin');
  const publishedSkills = allSkills.filter((s: CatalogSkill) => s.source === 'published');

  const renderGrid = (skills: CatalogSkill[], badgeFn?: (s: CatalogSkill) => React.ReactNode) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {skills.map((skill) => (
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
      ))}
    </div>
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
        <ContentTypeSelector value={contentType} onChange={(v) => { setContentType(v); }} hiddenTypes={hiddenTypes} />

        {/* Workflows / Swarms passthrough */}
        {contentType === 'workflows' && (
          <ContentSuspense><LazyWorkflowsTab source="builtin" /></ContentSuspense>
        )}
        {contentType === 'swarms' && (
          <ContentSuspense><LazySwarmTemplatesTab /></ContentSuspense>
        )}

        {/* Skills toolbar + grid */}
        {contentType === 'skills' && <>
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

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : allSkills.length === 0 ? (
          <div className="card p-12 text-center">
            <Store className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {query ? 'No skills found' : 'Marketplace is empty'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* YEOMAN Built-ins */}
            {builtinSkills.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">YEOMAN Skills</h3>
                  <span className="text-xs text-muted-foreground">({builtinSkills.length})</span>
                </div>
                {renderGrid(builtinSkills, () => (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    <Shield className="w-2.5 h-2.5" />
                    YEOMAN
                  </span>
                ))}
              </section>
            )}

            {/* Published */}
            {publishedSkills.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Store className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Published</h3>
                  <span className="text-xs text-muted-foreground">({publishedSkills.length})</span>
                </div>
                {renderGrid(publishedSkills)}
              </section>
            )}
          </div>
        )}
        </>}
      </div>
    </>
  );
}
