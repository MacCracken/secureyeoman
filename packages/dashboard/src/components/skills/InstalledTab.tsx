import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Store,
  Loader2,
  Sparkles,
  Pencil,
  GitBranch,
  ArrowRight,
  User,
  GitMerge,
  Network,
} from 'lucide-react';
import { fetchSkills, fetchPersonalities, fetchWorkflows, fetchSwarmTemplates } from '../../api/client';
import type { WorkflowDefinition, SwarmTemplate } from '../../api/client';
import type { Skill } from '../../types';
import { sanitizeText } from '../../utils/sanitize';
import { type TabType } from './shared';

const SOURCE_LABELS: Record<string, string> = {
  user: 'User',
  ai_proposed: 'AI Proposed',
  ai_learned: 'AI Learned',
  marketplace: 'Marketplace',
  community: 'Community',
};

/** Metadata for each skill source shown in the Installed tab. */
const SOURCE_SECTIONS: {
  key: string[];
  label: string;
  icon: React.ReactNode;
  tabTarget?: string;
  description: string;
}[] = [
  {
    key: ['ai_learned', 'ai_proposed'],
    label: 'AI Created',
    icon: <Sparkles className="w-4 h-4 text-primary" />,
    description: 'Skills learned or proposed by a personality during conversation.',
  },
  {
    key: ['user'],
    label: 'User Created',
    icon: <Pencil className="w-4 h-4 text-muted-foreground" />,
    description: 'Skills you created manually in the Personal tab.',
  },
  {
    key: ['marketplace'],
    label: 'Marketplace',
    icon: <Store className="w-4 h-4 text-primary" />,
    tabTarget: 'marketplace',
    description: 'Skills installed from the built-in marketplace.',
  },
  {
    key: ['community'],
    label: 'Community',
    icon: <GitBranch className="w-4 h-4 text-muted-foreground" />,
    tabTarget: 'community',
    description: 'Skills synced from the community repository.',
  },
];

type ContentType = 'skills' | 'workflows' | 'swarms';

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'skills', label: 'Skills' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'swarms', label: 'Swarm Templates' },
];

// ── Installed Workflows view ──────────────────────────────────────────────────

function InstalledWorkflows({ onNavigateTab }: { onNavigateTab?: (tab: TabType) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['installed-workflows'],
    queryFn: () => fetchWorkflows({ limit: 200 }),
  });

  // Exclude builtin seeded templates — user-installed workflows have createdBy !== 'system'
  const installed = (data?.definitions ?? []).filter(
    (wf: WorkflowDefinition) => wf.createdBy !== 'system'
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (installed.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No workflows installed yet. Browse the Marketplace or sync the Community repo to find workflows to install.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className="card p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onNavigateTab?.('marketplace')}
          >
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Marketplace</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              Browse and install built-in workflow templates.
            </p>
          </div>
          <div
            className="card p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onNavigateTab?.('community')}
          >
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Community</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              Sync and install workflows from the community repo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {installed.map((wf: WorkflowDefinition) => (
        <div key={wf.id} className="card p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <GitMerge className="w-4 h-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium">{wf.name}</h3>
            {wf.createdBy === 'community' && (
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                <GitBranch className="w-2.5 h-2.5" /> Community
              </span>
            )}
            {wf.autonomyLevel && (
              <span className="text-xs font-mono bg-card border border-border px-1.5 py-0.5 rounded">
                {wf.autonomyLevel}
              </span>
            )}
          </div>
          {wf.description && (
            <p className="text-sm text-muted-foreground mt-1">{sanitizeText(wf.description)}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Installed Swarms view ─────────────────────────────────────────────────────

function InstalledSwarms({ onNavigateTab }: { onNavigateTab?: (tab: TabType) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['installed-swarm-templates'],
    queryFn: fetchSwarmTemplates,
  });

  // Exclude builtin seeded templates — user-installed swarms have isBuiltin === false
  const installed = (data?.templates ?? []).filter((t: SwarmTemplate) => !t.isBuiltin);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (installed.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No swarm templates installed yet. Browse the Marketplace or sync the Community repo to find templates to install.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className="card p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onNavigateTab?.('marketplace')}
          >
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Marketplace</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              Browse and install built-in swarm templates.
            </p>
          </div>
          <div
            className="card p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onNavigateTab?.('community')}
          >
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Community</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              Sync and install swarm templates from the community repo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {installed.map((t: SwarmTemplate) => (
        <div key={t.id} className="card p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Network className="w-4 h-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium">{t.name}</h3>
            <span
              className={`text-xs px-1.5 py-0.5 rounded border ${
                t.strategy === 'parallel'
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : t.strategy === 'dynamic'
                  ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                  : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
              }`}
            >
              {t.strategy}
            </span>
          </div>
          {t.description && (
            <p className="text-sm text-muted-foreground mt-1">{sanitizeText(t.description)}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {t.roles.map((r) => (
              <span
                key={r.role}
                className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
              >
                {r.role}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main InstalledTab ─────────────────────────────────────────────────────────

export function InstalledTab({ onNavigateTab, workflowsEnabled = false, subAgentsEnabled = false }: { onNavigateTab?: (tab: TabType) => void; workflowsEnabled?: boolean; subAgentsEnabled?: boolean }) {
  const [filterPersonalityId, setFilterPersonalityId] = useState<string>('');
  const visibleOptions = CONTENT_TYPE_OPTIONS.filter((o) => {
    if (o.value === 'workflows' && !workflowsEnabled) return false;
    if (o.value === 'swarms' && !subAgentsEnabled) return false;
    return true;
  });
  const [contentType, setContentType] = useState<ContentType>('skills');

  const { data, isLoading } = useQuery({
    queryKey: ['skills', '', ''],
    queryFn: () => fetchSkills(),
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const personalities = personalitiesData?.personalities ?? [];
  const personalityMap = new Map<string, string>(personalities.map((p) => [p.id, p.name]));

  // All skills from every source are shown in Installed — not just marketplace/community.
  const allSkills = data?.skills ?? [];

  const filteredSkills = filterPersonalityId
    ? allSkills.filter((s: Skill) => s.personalityId === filterPersonalityId)
    : allSkills;

  // Group a skill list by name to avoid duplicate cards when the same skill is
  // installed for multiple personalities.
  const groupSkillsByName = (skills: Skill[]): Skill[][] => {
    const map = new Map<string, Skill[]>();
    for (const s of skills) {
      const existing = map.get(s.name);
      if (existing) existing.push(s);
      else map.set(s.name, [s]);
    }
    return Array.from(map.values());
  };

  const renderSkillGroup = (group: Skill[]) => {
    const primary = group[0];
    const agentLabel = (s: Skill) =>
      s.personalityName ??
      (s.personalityId ? (personalityMap.get(s.personalityId) ?? s.personalityId) : null) ??
      'Global';

    return (
      <div key={primary.name} className="card p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium">{primary.name}</h3>
          <span className="text-xs text-muted-foreground">
            {SOURCE_LABELS[primary.source] || primary.source}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{sanitizeText(primary.description)}</p>
        <div className="flex items-center flex-wrap gap-1.5 mt-2">
          <span className="text-xs text-muted-foreground">Personalities:</span>
          {group.map((s) => (
            <span
              key={s.id}
              className={`text-xs px-2 py-0.5 rounded ${
                s.personalityId ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}
            >
              {agentLabel(s)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Content type dropdown — hidden when only skills available */}
        {visibleOptions.length > 1 && (
          <div className="relative">
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              className="bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
            >
              {visibleOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        )}

        {/* Personality filter — only relevant for skills */}
        {contentType === 'skills' && (
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select
              value={filterPersonalityId}
              onChange={(e) => {
                setFilterPersonalityId(e.target.value);
              }}
              className="bg-card border border-border rounded-lg pl-10 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
            >
              <option value="">All Personalities</option>
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isActive ? '(Active)' : ''}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg
                className="w-4 h-4 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        )}

        {contentType === 'skills' && allSkills.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {filteredSkills.length} of {allSkills.length} skills
          </span>
        )}
      </div>

      {/* ── Workflows ──────────────────────────────────────────────────── */}
      {contentType === 'workflows' && <InstalledWorkflows onNavigateTab={onNavigateTab} />}

      {/* ── Swarm Templates ────────────────────────────────────────────── */}
      {contentType === 'swarms' && <InstalledSwarms onNavigateTab={onNavigateTab} />}

      {/* ── Skills ─────────────────────────────────────────────────────── */}
      {contentType === 'skills' && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : allSkills.length === 0 ? (
            /* ── Empty state: show available source cards ──────────────────── */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No skills installed yet. Skills can come from any of these sources:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SOURCE_SECTIONS.map((section) => (
                  <div
                    key={section.key[0]}
                    className={`card p-4 space-y-2 ${section.tabTarget ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''}`}
                    onClick={
                      section.tabTarget && onNavigateTab
                        ? () => {
                            onNavigateTab(section.tabTarget as TabType);
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      {section.icon}
                      <span className="font-medium text-sm">{section.label}</span>
                      {section.tabTarget && (
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-muted-foreground">No skills for the selected filter.</p>
            </div>
          ) : (
            /* ── Grouped by source ─────────────────────────────────────────── */
            <div className="space-y-8">
              {SOURCE_SECTIONS.map((section) => {
                const sectionSkills = filteredSkills.filter((s: Skill) =>
                  section.key.includes(s.source)
                );
                const groupedSectionSkills = groupSkillsByName(sectionSkills);
                if (groupedSectionSkills.length === 0) return null;
                return (
                  <section key={section.key[0]}>
                    <div className="flex items-center gap-2 mb-3">
                      {section.icon}
                      <h3 className="text-sm font-semibold">{section.label}</h3>
                      <span className="text-xs text-muted-foreground">
                        ({groupedSectionSkills.length})
                      </span>
                    </div>
                    <div className="space-y-2">{groupedSectionSkills.map(renderSkillGroup)}</div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
