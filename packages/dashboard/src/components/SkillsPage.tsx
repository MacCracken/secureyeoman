import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wrench,
  Bot,
  Store,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Search,
  X,
  Download,
  User,
  Users,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Shield,
  GitBranch,
} from 'lucide-react';
import {
  fetchSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  enableSkill,
  disableSkill,
  approveSkill,
  rejectSkill,
  fetchMarketplaceSkills,
  installMarketplaceSkill,
  uninstallMarketplaceSkill,
  syncCommunitySkills,
  fetchCommunityStatus,
  fetchPersonalities,
} from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import type { Skill, SkillCreate, Personality, MarketplaceSkill } from '../types';
import { sanitizeText } from '../utils/sanitize';

type TabType = 'my-skills' | 'marketplace' | 'community' | 'installed';

const SOURCE_LABELS: Record<string, string> = {
  user: 'User',
  ai_proposed: 'AI Proposed',
  ai_learned: 'AI Learned',
  marketplace: 'Marketplace',
  community: 'Community',
};

const STATUS_BADGES: Record<string, string> = {
  active: 'badge-success',
  pending_approval: 'badge-warning',
  disabled: 'badge-error',
};

export function SkillsPage() {
  const location = useLocation();
  const getInitialTab = (): TabType => {
    const path = location.pathname;
    if (path.includes('/community')) return 'community';
    if (path.includes('/marketplace')) return 'marketplace';
    if (path.includes('/installed')) return 'installed';
    return 'my-skills';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-primary flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Skills
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage your skills, browse the marketplace, and sync community skills
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('my-skills')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'my-skills'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bot className="w-4 h-4" />
          Personal
        </button>
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'marketplace'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Store className="w-4 h-4" />
          Marketplace
        </button>
        <button
          onClick={() => setActiveTab('community')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'community'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          Community
        </button>
        <button
          onClick={() => setActiveTab('installed')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'installed'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Download className="w-4 h-4" />
          Installed
        </button>
      </div>

      {activeTab === 'my-skills' && <MySkillsTab />}
      {activeTab === 'marketplace' && <MarketplaceTab />}
      {activeTab === 'community' && <CommunityTab />}
      {activeTab === 'installed' && <InstalledSkillsTab />}
    </div>
  );
}

// ─── Personal Skills Tab ──────────────────────────────────────────────────────

function MySkillsTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [form, setForm] = useState<SkillCreate>({
    name: '',
    description: '',
    instructions: '',
    triggerPatterns: [],
    enabled: true,
    source: 'user',
    personalityId: null,
  });
  const [triggerInput, setTriggerInput] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['skills', filterStatus, filterSource],
    queryFn: () =>
      fetchSkills({
        status: filterStatus || undefined,
        source: filterSource || undefined,
      }),
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonality = personalities.find((p) => p.isActive);

  const skills = data?.skills ?? [];
  const pendingCount = skills.filter((s) => s.status === 'pending_approval').length;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['skills'] });

  const createMut = useMutation({
    mutationFn: (d: SkillCreate) => createSkill(d),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<SkillCreate> }) => updateSkill(id, d),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: invalidate,
  });
  const enableMut = useMutation({
    mutationFn: (id: string) => enableSkill(id),
    onSuccess: invalidate,
  });
  const disableMut = useMutation({
    mutationFn: (id: string) => disableSkill(id),
    onSuccess: invalidate,
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => approveSkill(id),
    onSuccess: invalidate,
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectSkill(id),
    onSuccess: invalidate,
  });

  const handleAddTrigger = () => {
    if (triggerInput.trim()) {
      setForm({ ...form, triggerPatterns: [...(form.triggerPatterns || []), triggerInput.trim()] });
      setTriggerInput('');
    }
  };

  const handleRemoveTrigger = (idx: number) => {
    setForm({ ...form, triggerPatterns: (form.triggerPatterns || []).filter((_, i) => i !== idx) });
  };

  const handleSubmit = () => {
    if (!editing) return;
    const originalSkill = editing !== 'new' ? skills.find((s) => s.id === editing) : null;
    const isNonUserSource = originalSkill && originalSkill.source !== 'user';

    if (editing === 'new' || isNonUserSource) {
      // Always create a fresh user-owned skill — never mutate marketplace/built-in records
      createMut.mutate({ ...form, source: 'user' });
    } else {
      updateMut.mutate({ id: editing, d: { ...form, source: 'user' } });
    }
    setEditing(null);
    setForm({
      name: '',
      description: '',
      instructions: '',
      triggerPatterns: [],
      enabled: true,
      source: 'user',
      personalityId: activePersonality?.id ?? null,
    });
  };

  const startEdit = (s: Skill) => {
    setForm({
      name: s.name,
      description: s.description,
      instructions: s.instructions,
      triggerPatterns: s.triggerPatterns || [],
      enabled: s.enabled,
      source: 'user',
      personalityId: s.personalityId ?? activePersonality?.id ?? null,
    });
    setTriggerInput('');
    setEditing(s.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setEditing('new');
            setForm({
              name: '',
              description: '',
              instructions: '',
              triggerPatterns: [],
              enabled: true,
              source: 'user',
              personalityId: activePersonality?.id ?? null,
            });
          }}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Skill
        </button>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending_approval">Pending</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Sources</option>
          <option value="user">User</option>
          <option value="ai_proposed">AI Proposed</option>
          <option value="ai_learned">AI Learned</option>
          <option value="marketplace">Marketplace</option>
          <option value="community">Community</option>
        </select>
        {pendingCount > 0 && (
          <span className="badge badge-warning">{pendingCount} pending approval</span>
        )}
      </div>

      {editing !== null && (
        <div className="card p-4 space-y-4">
          <h3 className="font-semibold">{editing === 'new' ? 'Create New Skill' : 'Edit Skill'}</h3>
          <div className="grid gap-3">
            <input
              className="bg-background border rounded-lg px-3 py-2 text-sm"
              placeholder="Skill name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="bg-background border rounded-lg px-3 py-2 text-sm"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={form.personalityId ?? ''}
                onChange={(e) => setForm({ ...form, personalityId: e.target.value || null })}
                className="w-full bg-background border rounded-lg pl-10 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
              >
                <option value="">Global (All Personalities)</option>
                {personalities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isActive ? '(Active)' : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <textarea
              className="bg-background border rounded-lg px-3 py-2 text-sm min-h-[80px]"
              placeholder="Instructions (what the skill does)"
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
            <div className="flex gap-2">
              <input
                className="bg-background border rounded-lg px-3 py-2 text-sm flex-1"
                placeholder="Trigger patterns (e.g., /mycommand)"
                value={triggerInput}
                onChange={(e) => setTriggerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTrigger();
                  }
                }}
              />
              <button onClick={handleAddTrigger} className="btn btn-ghost">
                Add
              </button>
            </div>
            {(form.triggerPatterns || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(form.triggerPatterns || []).map((p, i) => (
                  <span key={i} className="badge flex items-center gap-1">
                    {p}
                    <button onClick={() => handleRemoveTrigger(i)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {editing !== 'new' && skills.find((s) => s.id === editing)?.source !== 'user' && (
              <p className="text-xs text-muted-foreground">
                Saving creates a personal copy — the original installed skill is unchanged.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={createMut.isPending || updateMut.isPending}
                className="btn btn-primary"
              >
                {createMut.isPending || updateMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editing === 'new' ? (
                  'Create'
                ) : (
                  'Save'
                )}
              </button>
              <button onClick={() => setEditing(null)} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !skills.length ? (
        <div className="card p-12 text-center">
          <Wrench className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No skills found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{skill.name}</h3>
                    <span className={`badge ${STATUS_BADGES[skill.status] || 'badge'}`}>
                      {skill.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {SOURCE_LABELS[skill.source] || skill.source}
                    </span>
                    {skill.personalityId && skill.personalityName && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {skill.personalityName}
                      </span>
                    )}
                    {!skill.personalityId && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                        Global
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {sanitizeText(skill.description)}
                  </p>
                  {(skill.triggerPatterns || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(skill.triggerPatterns || []).map((p, i) => (
                        <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {skill.status === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => approveMut.mutate(skill.id)}
                        className="btn btn-ghost p-2"
                        title="Approve"
                      >
                        <ThumbsUp className="w-4 h-4 text-success" />
                      </button>
                      <button
                        onClick={() => rejectMut.mutate(skill.id)}
                        className="btn btn-ghost p-2"
                        title="Reject"
                      >
                        <ThumbsDown className="w-4 h-4 text-destructive" />
                      </button>
                    </>
                  )}
                  {skill.status !== 'pending_approval' && (
                    <button
                      onClick={() => {
                        if (skill.enabled) {
                          disableMut.mutate(skill.id);
                        } else {
                          enableMut.mutate(skill.id);
                        }
                      }}
                      className="btn btn-ghost p-2"
                      title={skill.enabled ? 'Disable' : 'Enable'}
                    >
                      {skill.enabled ? (
                        <ToggleRight className="w-5 h-5 text-success" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  )}
                  <button onClick={() => startEdit(skill)} className="btn btn-ghost p-2">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(skill)}
                    className="btn btn-ghost p-2"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Skill"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          deleteMut.mutate(deleteTarget!.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── Installed Skills Tab ─────────────────────────────────────────────────────

function InstalledSkillsTab() {
  const queryClient = useQueryClient();
  const [filterPersonalityId, setFilterPersonalityId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['skills', '', ''],
    queryFn: () => fetchSkills(),
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const personalities = personalitiesData?.personalities ?? [];

  const allSkills = data?.skills ?? [];
  const installedSkills = allSkills.filter(
    (s) => s.source === 'marketplace' || s.source === 'community'
  );

  const filteredSkills =
    filterPersonalityId === '__global__'
      ? installedSkills.filter((s) => !s.personalityId)
      : filterPersonalityId
        ? installedSkills.filter((s) => s.personalityId === filterPersonalityId)
        : installedSkills;

  const marketplaceSkills = filteredSkills.filter((s) => s.source === 'marketplace');
  const communitySkills = filteredSkills.filter((s) => s.source === 'community');

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['skills'] });

  const enableMut = useMutation({ mutationFn: enableSkill, onSuccess: invalidate });
  const disableMut = useMutation({ mutationFn: disableSkill, onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: deleteSkill, onSuccess: invalidate });

  const renderSkill = (skill: Skill) => (
    <div key={skill.id} className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{skill.name}</h3>
            <span className={`badge ${STATUS_BADGES[skill.status] || 'badge'}`}>
              {skill.status}
            </span>
            <span className="text-xs text-muted-foreground">
              {SOURCE_LABELS[skill.source] || skill.source}
            </span>
            {skill.personalityId && skill.personalityName ? (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                {skill.personalityName}
              </span>
            ) : (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                Global
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{sanitizeText(skill.description)}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              skill.enabled ? disableMut.mutate(skill.id) : enableMut.mutate(skill.id)
            }
            className="btn btn-ghost p-2"
            title={skill.enabled ? 'Disable' : 'Enable'}
          >
            {skill.enabled ? (
              <ToggleRight className="w-5 h-5 text-success" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          <button onClick={() => setDeleteTarget(skill)} className="btn btn-ghost p-2">
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Personality filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={filterPersonalityId}
            onChange={(e) => setFilterPersonalityId(e.target.value)}
            className="bg-card border border-border rounded-lg pl-10 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
          >
            <option value="">All Personalities</option>
            <option value="__global__">Global (No Personality)</option>
            {personalities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.isActive ? '(Active)' : ''}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {installedSkills.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {filteredSkills.length} of {installedSkills.length} installed
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : installedSkills.length === 0 ? (
        <div className="card p-12 text-center space-y-2">
          <Download className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground font-medium">No installed skills</p>
          <p className="text-xs text-muted-foreground">
            Browse the Marketplace or Community tab to install skills.
          </p>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted-foreground">No installed skills for the selected personality.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {marketplaceSkills.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Store className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Marketplace</h3>
                <span className="text-xs text-muted-foreground">({marketplaceSkills.length})</span>
              </div>
              <div className="space-y-2">{marketplaceSkills.map(renderSkill)}</div>
            </section>
          )}
          {communitySkills.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Community</h3>
                <span className="text-xs text-muted-foreground">({communitySkills.length})</span>
              </div>
              <div className="space-y-2">{communitySkills.map(renderSkill)}</div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Installed Skill"
        message={`Remove "${deleteTarget?.name}"? This removes it from your active skills. You can reinstall it from the Marketplace or Community tab.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          deleteMut.mutate(deleteTarget!.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── Shared skill card ────────────────────────────────────────────────────────

function SkillCard({
  skill,
  onInstall,
  onUninstall,
  installing,
  uninstalling,
  badge,
}: {
  skill: MarketplaceSkill;
  onInstall: () => void;
  onUninstall: () => void;
  installing: boolean;
  uninstalling: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col h-full hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-medium text-sm line-clamp-1 flex-1">{skill.name}</h3>
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
          v{skill.version}
        </span>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] text-muted-foreground">{skill.category}</span>
        {badge}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-4 line-clamp-3 flex-1">
        {sanitizeText(skill.description)}
      </p>

      {/* Footer */}
      <div className="pt-3 border-t border-border mt-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-foreground">{skill.author}</span>
          <span className="text-[10px] text-muted-foreground">
            {skill.downloadCount.toLocaleString()} installs
          </span>
        </div>

        {skill.installed ? (
          <button
            onClick={onUninstall}
            disabled={uninstalling}
            className="btn btn-ghost text-destructive flex items-center gap-2 w-full justify-center text-xs py-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Uninstall
          </button>
        ) : (
          <button
            onClick={onInstall}
            disabled={installing}
            className="btn btn-primary flex items-center gap-2 w-full justify-center text-xs py-2"
          >
            {installing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Install
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Personality Selector (shared) ───────────────────────────────────────────

function PersonalitySelector({
  personalities,
  value,
  onChange,
  required,
}: {
  personalities: Personality[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Install to:</span>
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-card border border-border rounded-lg pl-10 pr-8 py-2.5 text-sm min-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
        >
          {!required && <option value="">Global (All Personalities)</option>}
          {required && <option value="">— Select a personality —</option>}
          {personalities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.isActive ? '(Active)' : ''}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Marketplace Tab ──────────────────────────────────────────────────────────

function MarketplaceTab() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  // Fetch all non-community skills
  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', query],
    queryFn: () => fetchMarketplaceSkills(query || undefined),
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonality = personalities.find((p) => p.isActive);

  useEffect(() => {
    if (activePersonality && !hasInitialized) {
      setSelectedPersonalityId(activePersonality.id);
      setHasInitialized(true);
    }
  }, [activePersonality, hasInitialized]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
  };

  const installMut = useMutation({
    mutationFn: ({ id, personalityId }: { id: string; personalityId?: string }) =>
      installMarketplaceSkill(id, personalityId),
    onSuccess: () => { invalidate(); setInstallingId(null); },
    onError: () => setInstallingId(null),
  });

  const uninstallMut = useMutation({
    mutationFn: uninstallMarketplaceSkill,
    onSuccess: () => { invalidate(); setUninstallingId(null); },
    onError: () => setUninstallingId(null),
  });

  // Separate builtin and published, exclude community
  const allSkills = (data?.skills ?? []).filter((s) => s.source !== 'community');
  const builtinSkills = allSkills.filter((s) => s.source === 'builtin');
  const publishedSkills = allSkills.filter((s) => s.source === 'published');

  const renderGrid = (skills: MarketplaceSkill[], badgeFn?: (s: MarketplaceSkill) => React.ReactNode) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          badge={badgeFn?.(skill)}
          installing={installingId === skill.id && installMut.isPending}
          uninstalling={uninstallingId === skill.id && uninstallMut.isPending}
          onInstall={() => {
            setInstallingId(skill.id);
            installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId || undefined });
          }}
          onUninstall={() => {
            setUninstallingId(skill.id);
            uninstallMut.mutate(skill.id);
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Search skills by name, description, or author..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
                <h3 className="text-sm font-semibold text-foreground">YEOMAN Built-ins</h3>
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
    </div>
  );
}

// ─── Community Tab ────────────────────────────────────────────────────────────

function CommunityTab() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    added: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace-community', query],
    queryFn: () => fetchMarketplaceSkills(query || undefined, 'community'),
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

  // Default to active personality — community installs are always per-personality
  useEffect(() => {
    if (activePersonality && !hasInitialized) {
      setSelectedPersonalityId(activePersonality.id);
      setHasInitialized(true);
    }
  }, [activePersonality, hasInitialized]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['marketplace-community'] });
    void queryClient.invalidateQueries({ queryKey: ['community-status'] });
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
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
    onSuccess: () => { invalidate(); setInstallingId(null); },
    onError: () => setInstallingId(null),
  });

  const uninstallMut = useMutation({
    mutationFn: uninstallMarketplaceSkill,
    onSuccess: () => { invalidate(); setUninstallingId(null); },
    onError: () => setUninstallingId(null),
  });

  const skills = data?.skills ?? [];
  const canInstall = !!selectedPersonalityId;

  const lastSynced = statusData?.lastSyncedAt
    ? new Date(statusData.lastSyncedAt).toLocaleString()
    : null;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Search community skills..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Per-personality required */}
        <PersonalitySelector
          personalities={personalities}
          value={selectedPersonalityId}
          onChange={setSelectedPersonalityId}
          required
        />

        {/* Sync button */}
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

      {/* Repo path + last synced info */}
      {statusData && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono truncate">{statusData.communityRepoPath ?? 'No path configured'}</span>
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
        <div className={`p-3 rounded-lg border text-xs space-y-1 ${
          syncResult.errors.length > 0
            ? 'bg-warning/10 border-warning/20'
            : 'bg-success/10 border-success/20'
        }`}>
          <div className="flex items-center gap-2 font-medium">
            {syncResult.errors.length > 0 ? (
              <AlertCircle className="w-4 h-4 text-warning" />
            ) : (
              <CheckCircle className="w-4 h-4 text-success" />
            )}
            Sync complete — {syncResult.added} added, {syncResult.updated} updated, {syncResult.skipped} skipped
            {syncResult.errors.length > 0 && `, ${syncResult.errors.length} error(s)`}
          </div>
          {syncResult.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {syncResult.errors.map((e, i) => (
                <li key={i} className="truncate">· {e}</li>
              ))}
            </ul>
          )}
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
            Clone{' '}
            <span className="font-mono">secureyeoman-community-skills</span> alongside this project,
            then click <strong>Sync</strong> to import skills.
          </p>
          {statusData?.communityRepoPath && (
            <p className="text-xs text-muted-foreground font-mono">{statusData.communityRepoPath}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Community Skills</h3>
            <span className="text-xs text-muted-foreground">({skills.length})</span>
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
                onInstall={() => {
                  if (!canInstall) return;
                  setInstallingId(skill.id);
                  installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId });
                }}
                onUninstall={() => {
                  setUninstallingId(skill.id);
                  uninstallMut.mutate(skill.id);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
