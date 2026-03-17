import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Palette,
  UserCircle,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Trash2,
  Settings,
} from 'lucide-react';
import {
  fetchSkills,
  fetchPersonalities,
  fetchWorkflows,
  fetchSwarmTemplates,
  fetchMarketplaceSkills,
  uninstallMarketplaceSkill,
  enableSkill,
  disableSkill,
  deleteSkill,
} from '../../api/client';
import type { WorkflowDefinition, SwarmTemplate } from '../../api/client';
import type { Skill } from '../../types';
import type { CatalogSkill } from '../../types';
import { sanitizeText } from '../../utils/sanitize';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { type TabType, type ContentType, ContentTypeSelector, categoryLabel } from './shared';

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

/** Detect system items (themes/personalities installed from marketplace). */
function isSystemSkill(s: Skill): boolean {
  if (s.source !== 'marketplace' && s.source !== 'community') return false;
  try {
    const parsed = JSON.parse(s.instructions);
    if (parsed.themeId) return true;
  } catch {
    /* not theme JSON */
  }
  if (s.instructions?.startsWith('---\nname:')) return true;
  return false;
}

/** Determine the system category of a brain skill. */
function getSystemCategory(s: Skill): 'theme' | 'personality' {
  try {
    const parsed = JSON.parse(s.instructions);
    if (parsed.themeId) return 'theme';
  } catch {
    /* ignore */
  }
  return 'personality';
}

// ContentType and CONTENT_TYPES imported from ./shared for consistency

// ── Installed Workflows view ──────────────────────────────────────────────────

function InstalledWorkflows({
  onNavigateTab,
}: {
  onNavigateTab?: (tab: TabType, contentType?: ContentType) => void;
}) {
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
          No workflows installed yet. Browse the Marketplace or sync the Community repo to find
          workflows to install.
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

function InstalledSwarms({
  onNavigateTab,
}: {
  onNavigateTab?: (tab: TabType, contentType?: ContentType) => void;
}) {
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
          No swarm templates installed yet. Browse the Marketplace or sync the Community repo to
          find templates to install.
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

// ── Installed System view (themes & personalities) ────────────────────────────

function InstalledSystem({
  onNavigateTab,
  filter,
}: {
  onNavigateTab?: (tab: TabType, contentType?: ContentType) => void;
  filter: 'theme' | 'personality';
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);

  // Brain skills (to get enable/disable state)
  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: ['skills', '', ''],
    queryFn: () => fetchSkills(),
  });

  // Marketplace catalog (to get category metadata)
  const { data: marketplaceData, isLoading: marketplaceLoading } = useQuery({
    queryKey: ['marketplace-system-items'],
    queryFn: () =>
      fetchMarketplaceSkills(undefined, undefined, undefined, undefined, 200, undefined, undefined),
  });

  // Personalities (for assignment labels)
  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalityMap = new Map<string, string>(
    (personalitiesData?.personalities ?? []).map((p) => [p.id, p.name])
  );

  const isLoading = skillsLoading || marketplaceLoading;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
    void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    void queryClient.invalidateQueries({ queryKey: ['marketplace-themes'] });
    void queryClient.invalidateQueries({ queryKey: ['marketplace-system-items'] });
  };

  const enableMut = useMutation({
    mutationFn: (id: string) => enableSkill(id),
    onSuccess: invalidate,
  });
  const disableMut = useMutation({
    mutationFn: (id: string) => disableSkill(id),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: invalidate,
  });
  const uninstallMut = useMutation({
    mutationFn: (id: string) => uninstallMarketplaceSkill(id),
    onSuccess: invalidate,
  });

  // Filter brain skills to only system items (themes + personalities)
  const allSkills = skillsData?.skills ?? [];
  const systemSkills = allSkills.filter(isSystemSkill);

  // Build a catalog lookup by name for category metadata
  const catalogSkills = marketplaceData?.skills ?? [];
  const catalogByName = new Map<string, CatalogSkill>();
  for (const cs of catalogSkills) {
    catalogByName.set(cs.name, cs);
  }

  // Filter to the requested type, then group by name
  const filteredSystemSkills = systemSkills.filter((s) => getSystemCategory(s) === filter);
  const groupedByName = new Map<string, Skill[]>();
  for (const s of filteredSystemSkills) {
    const existing = groupedByName.get(s.name);
    if (existing) existing.push(s);
    else groupedByName.set(s.name, [s]);
  }
  const itemGroups = Array.from(groupedByName.entries());

  // Get marketplace category for a skill (from catalog lookup)
  const getMarketplaceCategory = (s: Skill): string => {
    const cat = catalogByName.get(s.name);
    return cat?.category || getSystemCategory(s);
  };

  // Get marketplace catalog ID for uninstall
  const getCatalogId = (s: Skill): string | null => {
    const cat = catalogByName.get(s.name);
    return cat?.id ?? null;
  };

  const handleEdit = (s: Skill) => {
    const cat = getSystemCategory(s);
    if (cat === 'theme') {
      void navigate('/settings/appearance');
    } else {
      void navigate('/settings/souls');
    }
  };

  const handleDelete = (s: Skill) => {
    // Uninstall from marketplace catalog
    const catalogId = getCatalogId(s);
    if (catalogId) {
      uninstallMut.mutate(catalogId);
    }
    // Delete all brain skill instances (all personalities)
    const group = getGroupForSkill(s);
    for (const skill of group) {
      deleteMut.mutate(skill.id);
    }
  };

  const _agentLabel = (s: Skill) =>
    s.personalityName ??
    (s.personalityId ? (personalityMap.get(s.personalityId) ?? s.personalityId) : null) ??
    'Global';

  const renderSystemGroup = (group: Skill[]) => {
    const primary = group[0];
    const cat = getSystemCategory(primary);
    const marketplaceCat = getMarketplaceCategory(primary);
    const sourceLabel = SOURCE_LABELS[primary.source] || primary.source;
    const allEnabled = group.every((s) => s.enabled);

    // Theme preview
    let themePreview: [string, string, string] | null = null;
    if (cat === 'theme') {
      try {
        const parsed = JSON.parse(primary.instructions);
        themePreview = parsed.preview || null;
      } catch {
        /* ignore */
      }
    }

    return (
      <div key={primary.name} className="card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {cat === 'theme' ? (
                <Palette className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <UserCircle className="w-4 h-4 text-primary shrink-0" />
              )}
              <h3 className="font-medium">{primary.name}</h3>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  allEnabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                }`}
              >
                {allEnabled ? 'Enabled' : 'Disabled'}
              </span>
              <span className="text-xs text-muted-foreground">{sourceLabel}</span>
              {marketplaceCat && marketplaceCat !== cat && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {categoryLabel(marketplaceCat)}
                </span>
              )}
            </div>
            {primary.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {sanitizeText(primary.description)}
              </p>
            )}
            {/* Install scope */}
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-muted-foreground">Installed:</span>
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                System
              </span>
            </div>
            {/* Theme preview strip */}
            {themePreview && (
              <div className="h-6 rounded flex overflow-hidden border border-border mt-2 max-w-[200px]">
                {themePreview.map((color, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Enable/Disable toggle — toggles all instances */}
            <button
              onClick={() => {
                for (const s of group) {
                  if (allEnabled) {
                    disableMut.mutate(s.id);
                  } else {
                    enableMut.mutate(s.id);
                  }
                }
              }}
              className="btn btn-ghost p-2"
              title={allEnabled ? 'Disable' : 'Enable'}
            >
              {allEnabled ? (
                <ToggleRight className="w-5 h-5 text-success" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            {/* Edit — navigate to appropriate settings */}
            <button
              onClick={() => {
                handleEdit(primary);
              }}
              className="btn btn-ghost p-2"
              title={cat === 'theme' ? 'Edit in Appearance' : 'Edit in Souls'}
            >
              {cat === 'theme' ? <Settings className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
            </button>
            {/* Delete — uninstalls all personality instances */}
            <button
              onClick={() => {
                setDeleteTarget(primary);
              }}
              className="btn btn-ghost p-2"
              title="Uninstall"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // For deletion, find all brain skill instances with the same name
  const getGroupForSkill = (s: Skill): Skill[] => groupedByName.get(s.name) ?? [s];

  const filterLabel = filter === 'theme' ? 'themes' : 'personalities';
  const FilterIcon = filter === 'theme' ? Palette : UserCircle;

  if (filteredSystemSkills.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No {filterLabel} installed. Browse the Marketplace to install {filterLabel}.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className="card p-4 space-y-2 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() =>
              onNavigateTab?.('marketplace', filter === 'theme' ? 'themes' : 'personalities')
            }
          >
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Marketplace</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">Browse and install {filterLabel}.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FilterIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold capitalize">{filterLabel}</h3>
          <span className="text-xs text-muted-foreground">({itemGroups.length})</span>
        </div>
        <div className="space-y-2">{itemGroups.map(([, group]) => renderSystemGroup(group))}</div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Uninstall System Item"
        message={`Are you sure you want to uninstall "${deleteTarget?.name}"? This will remove it from all personalities.`}
        confirmLabel="Uninstall"
        destructive
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

// ── Main InstalledTab ─────────────────────────────────────────────────────────

export function InstalledTab({
  onNavigateTab,
  workflowsEnabled = false,
  subAgentsEnabled = false,
}: {
  onNavigateTab?: (tab: TabType, contentType?: ContentType) => void;
  workflowsEnabled?: boolean;
  subAgentsEnabled?: boolean;
}) {
  const [filterPersonalityId, setFilterPersonalityId] = useState<string>('');
  const hiddenTypes: ContentType[] = [
    ...(!workflowsEnabled ? ['workflows' as const] : []),
    ...(!subAgentsEnabled ? ['swarms' as const] : []),
  ];
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

  // All skills from every source — exclude system items from the Skills view
  const allSkills = (data?.skills ?? []).filter((s: Skill) => !isSystemSkill(s));

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
      {/* Content type selector — shared with Marketplace & Community tabs */}
      <ContentTypeSelector
        value={contentType}
        onChange={(v) => {
          setContentType(v);
        }}
        hiddenTypes={hiddenTypes}
      />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
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

      {/* ── Themes ───────────────────────────────────────────────────── */}
      {contentType === 'themes' && <InstalledSystem onNavigateTab={onNavigateTab} filter="theme" />}

      {/* ── Personalities ──────────────────────────────────────────────── */}
      {contentType === 'personalities' && (
        <InstalledSystem onNavigateTab={onNavigateTab} filter="personality" />
      )}

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
