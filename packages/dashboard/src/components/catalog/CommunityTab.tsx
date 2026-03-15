import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw,
  GitBranch,
  Search,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';
import { fetchCommunityStatus, fetchPersonalities } from '../../api/client';
import type { CatalogSkill } from '../../types';
import {
  SkillPreviewModal,
  ContentTypeSelector,
  ContentSuspense,
  LazyWorkflowsTab,
  LazySwarmTemplatesTab,
  type ContentType,
} from './shared';
import { useCatalogInstall, usePersonalityInit, useCommunitySync } from './hooks';
import type { SyncResult } from './hooks';
import { CommunityThemesSection } from './CommunityThemesSection';
import { CommunityPersonalitiesSection } from './CommunityPersonalitiesSection';
import { CommunitySkillsSection } from './CommunitySkillsSection';

const COMMUNITY_INVALIDATE_KEYS = [
  ['marketplace-community'],
  ['community-status'],
  ['skills'],
  ['community-workflows'],
  ['community-swarm-templates'],
  ['personalities-community'],
  ['personalities'],
  ['marketplace-community-personalities'],
];

export function CommunityTab({
  workflowsEnabled = false,
  subAgentsEnabled = false,
}: { workflowsEnabled?: boolean; subAgentsEnabled?: boolean } = {}) {
  const hiddenTypes: ContentType[] = [
    ...(!workflowsEnabled ? ['workflows' as const] : []),
    ...(!subAgentsEnabled ? ['swarms' as const] : []),
  ];
  const [contentType, setContentType] = useState<ContentType>('skills');
  const [previewSkill, setPreviewSkill] = useState<CatalogSkill | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [swarmQuery, setSwarmQuery] = useState('');

  const catalog = useCatalogInstall(COMMUNITY_INVALIDATE_KEYS);
  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalities = personalitiesData?.personalities ?? [];
  const [selectedPersonalityId, setSelectedPersonalityId] = usePersonalityInit(personalities);

  const sync = useCommunitySync(() => {
    catalog.invalidate();
  });

  const { data: statusData } = useQuery({
    queryKey: ['community-status'],
    queryFn: fetchCommunityStatus,
  });

  const lastSynced = statusData?.lastSyncedAt
    ? new Date(statusData.lastSyncedAt).toLocaleString()
    : null;

  const canInstall = !!selectedPersonalityId;

  return (
    <>
      {previewSkill && (
        <SkillPreviewModal
          skill={previewSkill}
          onClose={() => {
            setPreviewSkill(null);
          }}
          installing={catalog.isInstalling(previewSkill.id)}
          uninstalling={catalog.isUninstalling(previewSkill.id)}
          onInstall={() => {
            if (!canInstall) return;
            catalog.setInstallingId(previewSkill.id);
            catalog.installMut.mutate({ id: previewSkill.id, personalityId: selectedPersonalityId });
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
          onChange={(v) => {
            setContentType(v);
          }}
          hiddenTypes={hiddenTypes}
        />

        {/* Sync result banner — visible on all tabs until dismissed */}
        <SyncResultBanner
          syncResult={sync.syncResult}
          onDismiss={sync.dismissSync}
          workflowsEnabled={workflowsEnabled}
          subAgentsEnabled={subAgentsEnabled}
        />

        {contentType === 'workflows' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search community workflows…"
                  value={workflowQuery}
                  onChange={(e) => { setWorkflowQuery(e.target.value); }}
                />
              </div>
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

        {contentType === 'swarms' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Search community swarm templates…"
                  value={swarmQuery}
                  onChange={(e) => { setSwarmQuery(e.target.value); }}
                />
              </div>
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

        {contentType === 'themes' && (
          <CommunityThemesSection
            selectedPersonalityId={selectedPersonalityId}
            catalog={catalog}
            sync={sync}
            onPreview={setPreviewSkill}
          />
        )}

        {contentType === 'personalities' && (
          <CommunityPersonalitiesSection
            selectedPersonalityId={selectedPersonalityId}
            catalog={catalog}
            sync={sync}
            onPreview={setPreviewSkill}
          />
        )}

        {contentType === 'skills' && (
          <CommunitySkillsSection
            catalog={catalog}
            sync={sync}
            statusData={statusData}
            lastSynced={lastSynced}
            selectedPersonalityId={selectedPersonalityId}
            setSelectedPersonalityId={setSelectedPersonalityId}
            onPreview={setPreviewSkill}
          />
        )}
      </div>
    </>
  );
}

/** Sync result banner — extracted for readability */
function SyncResultBanner({
  syncResult,
  onDismiss,
  workflowsEnabled,
  subAgentsEnabled,
}: {
  syncResult: SyncResult | null;
  onDismiss: () => void;
  workflowsEnabled: boolean;
  subAgentsEnabled: boolean;
}) {
  if (!syncResult) return null;

  return (
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
          onClick={onDismiss}
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
            Themes: {syncResult.themesAdded ?? 0} added, {syncResult.themesUpdated ?? 0} updated
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
          (syncResult.swarmsAdded !== undefined || syncResult.swarmsUpdated !== undefined) && (
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
  );
}
