import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Upload,
  User,
  Users,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Shield,
  GitBranch,
  Sparkles,
  Pencil,
  ArrowRight,
  Globe,
  Eye,
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
  fetchSecurityPolicy,
} from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import type { Skill, SkillCreate, Personality, MarketplaceSkill } from '../types';
import { sanitizeText } from '../utils/sanitize';
import { useCollabEditor } from '../hooks/useCollabEditor.js';
import { PresenceBanner } from './PresenceBanner.js';

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

const AI_SOURCES: ReadonlySet<string> = new Set(['ai_learned', 'ai_proposed']);

/** Download a skill as a portable .skill.json file for re-use or import. */
function exportSkill(skill: Skill) {
  // Strip server-managed runtime fields; keep everything a SkillCreate accepts
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    usageCount: _uc,
    lastUsedAt: _la,
    personalityName: _pn,
    ...exportable
  } = skill as Skill & { id: string; createdAt: number; updatedAt: number; usageCount: number; lastUsedAt: number | null; personalityName?: string | null };

  const payload = JSON.stringify({ $schema: 'sy-skill/1', ...exportable }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${skill.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.skill.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SkillsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });
  const communityEnabled = securityPolicy?.allowCommunityGitFetch ?? false;

  const getInitialTab = (): TabType => {
    const path = location.pathname;
    if (path.includes('/community')) return 'community';
    if (path.includes('/marketplace')) return 'marketplace';
    if (path.includes('/installed')) return 'installed';
    const stateTab = (location.state as { initialTab?: TabType } | null)?.initialTab;
    if (stateTab) return stateTab;
    return 'my-skills';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  // If community is disabled while on that tab, fall back to Personal
  useEffect(() => {
    if (!communityEnabled && activeTab === 'community') {
      setActiveTab('my-skills');
    }
  }, [communityEnabled, activeTab]);

  useEffect(() => {
    if ((location.state as { initialTab?: string } | null)?.initialTab) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          onClick={() => {
            setActiveTab('my-skills');
          }}
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
          onClick={() => {
            setActiveTab('marketplace');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'marketplace'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Store className="w-4 h-4" />
          Marketplace
        </button>
        {communityEnabled && (
          <button
            onClick={() => {
              setActiveTab('community');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'community'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" />
            Community
          </button>
        )}
        <button
          onClick={() => {
            setActiveTab('installed');
          }}
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
      {activeTab === 'community' && communityEnabled && <CommunityTab />}
      {activeTab === 'installed' && <InstalledSkillsTab onNavigateTab={setActiveTab} />}
    </div>
  );
}

// ─── Personal Skills Tab ──────────────────────────────────────────────────────

function MySkillsTab() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
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

  // Collaborative editing — active when an existing skill is open for editing
  const collabSkillDocId = editing && editing !== 'new' ? `skill:${editing}` : null;
  const {
    text: collabInstructions,
    onTextChange: onCollabInstructionsChange,
    presenceUsers: instructionsPresence,
  } = useCollabEditor(collabSkillDocId, 'instructions', form.instructions);

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

  useEffect(() => {
    const openSkillId = (location.state as { openSkillId?: string } | null)?.openSkillId;
    if (openSkillId && skills.length > 0) {
      const skill = skills.find((s) => s.id === openSkillId);
      if (skill) {
        startEdit(skill);
        navigate('/skills', { replace: true, state: null });
      }
    }
  }, [location.state, skills]); // navigate and startEdit are stable

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

  /** Validate and submit a File object as an imported skill. */
  const processImportFile = (file: File) => {
    // Must be .json by both extension AND MIME type — reject .svg, images, etc.
    const hasJsonExt = file.name.toLowerCase().endsWith('.json');
    const hasJsonMime =
      file.type === 'application/json' || file.type === 'text/json' || file.type === '';
    if (!hasJsonExt || !hasJsonMime) {
      setImportError('Only .json files are accepted. Other file types are not supported.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as Record<string, unknown>;

        // Schema validation
        if (raw.$schema !== 'sy-skill/1') {
          setImportError(
            `Invalid file: $schema must be "sy-skill/1" (got ${JSON.stringify(raw.$schema ?? null)}).`,
          );
          return;
        }

        // Required field check
        if (!raw.name || typeof raw.name !== 'string') {
          setImportError('Invalid skill file: "name" field is required and must be a string.');
          return;
        }

        // Strip server-managed fields that may still be present in the export
        const {
          $schema: _s,
          id: _id,
          createdAt: _c,
          updatedAt: _u,
          usageCount: _uc,
          lastUsedAt: _la,
          personalityName: _pn,
          ...skillData
        } = raw;

        createMut.mutate(
          { ...(skillData as unknown as SkillCreate), source: 'user' },
          {
            onSuccess: () => setImportSuccess(`"${raw.name as string}" imported successfully.`),
            onError: (err: unknown) =>
              setImportError(err instanceof Error ? err.message : 'Import failed.'),
          },
        );
      } catch {
        setImportError('Could not parse file — ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);
  };

  /** Fallback handler for the hidden <input type="file">. */
  const handleImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after fixing an error
    e.target.value = '';
    setImportError(null);
    setImportSuccess(null);
    if (!file) return;
    processImportFile(file);
  };

  /**
   * Prefer the File System Access API (showOpenFilePicker) which lets us hint
   * startIn: 'home' so the picker opens in the user's home directory rather
   * than the dev-server CWD. Falls back to a hidden <input> for unsupported browsers.
   */
  const handleImportClick = async () => {
    setImportError(null);
    setImportSuccess(null);

    type ShowOpenFilePicker = (opts?: {
      startIn?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
    }) => Promise<Array<{ getFile(): Promise<File> }>>;

    const picker = (window as Window & { showOpenFilePicker?: ShowOpenFilePicker })
      .showOpenFilePicker;

    if (typeof picker === 'function') {
      try {
        const [handle] = await picker({
          startIn: 'home',
          types: [
            {
              description: 'Skill JSON file',
              accept: { 'application/json': ['.json'] },
            },
          ],
          multiple: false,
          excludeAcceptAllOption: true,
        });
        const file = await handle.getFile();
        processImportFile(file);
      } catch (err) {
        // AbortError = user cancelled — not an error worth showing
        if (err instanceof Error && err.name !== 'AbortError') {
          setImportError('Could not open file picker.');
        }
      }
    } else {
      // Fallback: plain <input type="file">
      importInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-6">
      {/* Fallback hidden input for browsers without showOpenFilePicker */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportInputChange}
      />

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
        <button onClick={() => void handleImportClick()}
          className="btn btn-secondary"
          title="Import a .skill.json file"
        >
          <Upload className="w-4 h-4 mr-1" /> Import
        </button>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
          }}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending_approval">Pending</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => {
            setFilterSource(e.target.value);
          }}
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

      {importError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{importError}</span>
          <button onClick={() => setImportError(null)} className="btn btn-ghost p-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{importSuccess}</span>
          <button onClick={() => setImportSuccess(null)} className="btn btn-ghost p-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {editing !== null && (
        <div className="card p-4 space-y-4">
          <h3 className="font-semibold">{editing === 'new' ? 'Create New Skill' : 'Edit Skill'}</h3>
          <div className="grid gap-3">
            <input
              className="bg-background border rounded-lg px-3 py-2 text-sm"
              placeholder="Skill name"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
              }}
            />
            <input
              className="bg-background border rounded-lg px-3 py-2 text-sm"
              placeholder="Description"
              value={form.description}
              onChange={(e) => {
                setForm({ ...form, description: e.target.value });
              }}
            />
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={form.personalityId ?? ''}
                onChange={(e) => {
                  setForm({ ...form, personalityId: e.target.value || null });
                }}
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
            <PresenceBanner users={instructionsPresence} />
            <textarea
              className="bg-background border rounded-lg px-3 py-2 text-sm min-h-[80px]"
              placeholder="Instructions (what the skill does)"
              value={collabSkillDocId ? collabInstructions : form.instructions}
              onChange={(e) => {
                const val = e.target.value;
                if (collabSkillDocId) {
                  onCollabInstructionsChange(val);
                  setForm({ ...form, instructions: val });
                } else {
                  setForm({ ...form, instructions: val });
                }
              }}
            />
            <div className="flex gap-2">
              <input
                className="bg-background border rounded-lg px-3 py-2 text-sm flex-1"
                placeholder="Trigger patterns (e.g., /mycommand)"
                value={triggerInput}
                onChange={(e) => {
                  setTriggerInput(e.target.value);
                }}
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
                    <button
                      onClick={() => {
                        handleRemoveTrigger(i);
                      }}
                    >
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
              <button
                onClick={() => {
                  setEditing(null);
                }}
                className="btn btn-ghost"
              >
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
                        onClick={() => {
                          approveMut.mutate(skill.id);
                        }}
                        className="btn btn-ghost p-2"
                        title="Approve"
                      >
                        <ThumbsUp className="w-4 h-4 text-success" />
                      </button>
                      <button
                        onClick={() => {
                          rejectMut.mutate(skill.id);
                        }}
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
                  <button
                    onClick={() => {
                      startEdit(skill);
                    }}
                    className="btn btn-ghost p-2"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {AI_SOURCES.has(skill.source) && (
                    <button
                      onClick={() => exportSkill(skill)}
                      className="btn btn-ghost p-2"
                      title="Export as JSON"
                    >
                      <Download className="w-4 h-4 text-primary" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDeleteTarget(skill);
                    }}
                    className="btn btn-ghost p-2"
                    title="Delete"
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
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// ─── Installed Skills Tab ─────────────────────────────────────────────────────

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

function InstalledSkillsTab({ onNavigateTab }: { onNavigateTab?: (tab: TabType) => void }) {
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

  // All skills from every source are shown in Installed — not just marketplace/community.
  const allSkills = data?.skills ?? [];

  const filteredSkills =
    filterPersonalityId === '__global__'
      ? allSkills.filter((s) => !s.personalityId)
      : filterPersonalityId
        ? allSkills.filter((s) => s.personalityId === filterPersonalityId)
        : allSkills;

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
          {AI_SOURCES.has(skill.source) && (
            <button
              onClick={() => exportSkill(skill)}
              className="btn btn-ghost p-2"
              title="Export as JSON"
            >
              <Download className="w-4 h-4 text-primary" />
            </button>
          )}
          <button
            onClick={() => {
              setDeleteTarget(skill);
            }}
            className="btn btn-ghost p-2"
          >
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
            onChange={(e) => {
              setFilterPersonalityId(e.target.value);
            }}
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
        {allSkills.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {filteredSkills.length} of {allSkills.length} skills
          </span>
        )}
      </div>

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
                    ? () => onNavigateTab(section.tabTarget as TabType)
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
          <p className="text-sm text-muted-foreground">
            No skills for the selected filter.
          </p>
        </div>
      ) : (
        /* ── Grouped by source ─────────────────────────────────────────── */
        <div className="space-y-8">
          {SOURCE_SECTIONS.map((section) => {
            const sectionSkills = filteredSkills.filter((s) => section.key.includes(s.source));
            if (sectionSkills.length === 0) return null;
            return (
              <section key={section.key[0]}>
                <div className="flex items-center gap-2 mb-3">
                  {section.icon}
                  <h3 className="text-sm font-semibold">{section.label}</h3>
                  <span className="text-xs text-muted-foreground">({sectionSkills.length})</span>
                </div>
                <div className="space-y-2">{sectionSkills.map(renderSkill)}</div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Skill"
        message={`Remove "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          deleteMut.mutate(deleteTarget!.id);
          setDeleteTarget(null);
        }}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// ─── Shared skill card ────────────────────────────────────────────────────────

function SkillCard({
  skill,
  onInstall,
  onUninstall,
  onPreview,
  installing,
  uninstalling,
  badge,
}: {
  skill: MarketplaceSkill;
  onInstall: () => void;
  onUninstall: () => void;
  onPreview: () => void;
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

        <div className="flex items-center gap-1.5">
          <button
            onClick={onPreview}
            className="btn btn-ghost flex items-center gap-1 text-xs px-2 py-2 text-muted-foreground hover:text-foreground shrink-0"
            title="Preview skill"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>

          <div className="flex-1">
            {skill.installed ? (
              <button
                onClick={onUninstall}
                disabled={uninstalling}
                className="btn btn-ghost text-destructive flex items-center gap-2 w-full justify-center text-xs py-2"
              >
                {uninstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Uninstall
              </button>
            ) : skill.installedGlobally ? (
              <div className="flex items-center gap-2 w-full justify-center text-xs py-2 text-muted-foreground">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>Installed globally</span>
              </div>
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
      </div>
    </div>
  );
}

// ─── Skill Preview Modal ───────────────────────────────────────────────────────

function SkillPreviewModal({
  skill,
  onClose,
  onInstall,
  onUninstall,
  installing,
  uninstalling,
}: {
  skill: MarketplaceSkill;
  onClose: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  installing: boolean;
  uninstalling: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">{skill.name}</h2>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                v{skill.version}
              </span>
              {skill.source === 'builtin' && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  <Shield className="w-2.5 h-2.5" />
                  YEOMAN
                </span>
              )}
              {skill.source === 'community' && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">
                  <GitBranch className="w-2.5 h-2.5" />
                  Community
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              <span>{skill.author}</span>
              {skill.authorInfo?.github && (
                <a
                  href={`https://github.com/${skill.authorInfo.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors underline underline-offset-2"
                >
                  GitHub
                </a>
              )}
              {skill.authorInfo?.website && (
                <a
                  href={skill.authorInfo.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Website
                </a>
              )}
              {skill.authorInfo?.license && <span>{skill.authorInfo.license}</span>}
              <span className="capitalize">{skill.category}</span>
              <span>{skill.downloadCount.toLocaleString()} installs</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost p-1.5 shrink-0"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <span key={tag} className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {skill.description && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Description</h3>
              <p className="text-sm text-foreground leading-relaxed">{sanitizeText(skill.description)}</p>
            </div>
          )}

          {/* Instructions */}
          {skill.instructions && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Instructions</h3>
              <pre className="text-xs bg-muted rounded-lg p-3 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-64 overflow-y-auto">
                {skill.instructions}
              </pre>
            </div>
          )}

          {/* Trigger Patterns */}
          {skill.triggerPatterns.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Trigger Patterns
              </h3>
              <div className="space-y-1">
                {skill.triggerPatterns.map((pattern, i) => (
                  <code key={i} className="block text-xs bg-muted rounded px-2 py-1 font-mono text-foreground">
                    {pattern}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* MCP Tools */}
          {skill.tools.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                MCP Tools ({skill.tools.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {skill.tools.map((tool) => (
                  <span key={tool.name} className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono text-foreground">
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Updated {new Date(skill.updatedAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost text-sm px-4">
              Close
            </button>
            {skill.installed ? (
              <button
                onClick={onUninstall}
                disabled={uninstalling}
                className="btn btn-ghost text-destructive flex items-center gap-2 text-sm px-4"
              >
                {uninstalling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Uninstall
              </button>
            ) : skill.installedGlobally ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-4">
                <Globe className="w-4 h-4 shrink-0" />
                Installed globally
              </div>
            ) : (
              <button
                onClick={onInstall}
                disabled={installing}
                className="btn btn-primary flex items-center gap-2 text-sm px-4"
              >
                {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Install
              </button>
            )}
          </div>
        </div>
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
          onChange={(e) => {
            onChange(e.target.value);
          }}
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
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
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
  const [previewSkill, setPreviewSkill] = useState<MarketplaceSkill | null>(null);

  // Fetch all non-community skills — keyed on personalityId so results refresh when selection changes
  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', query, selectedPersonalityId],
    queryFn: () => fetchMarketplaceSkills(query || undefined, undefined, selectedPersonalityId),
    enabled: hasInitialized,
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
  const allSkills = (data?.skills ?? []).filter((s) => s.source !== 'community');
  const builtinSkills = allSkills.filter((s) => s.source === 'builtin');
  const publishedSkills = allSkills.filter((s) => s.source === 'published');

  const renderGrid = (
    skills: MarketplaceSkill[],
    badgeFn?: (s: MarketplaceSkill) => React.ReactNode
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          badge={badgeFn?.(skill)}
          installing={installingId === skill.id && installMut.isPending}
          uninstalling={uninstallingId === skill.id && uninstallMut.isPending}
          onPreview={() => setPreviewSkill(skill)}
          onInstall={() => {
            setInstallingId(skill.id);
            installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId || undefined });
          }}
          onUninstall={() => {
            setUninstallingId(skill.id);
            uninstallMut.mutate({ id: skill.id, personalityId: selectedPersonalityId || undefined });
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
        onClose={() => setPreviewSkill(null)}
        installing={installingId === previewSkill.id && installMut.isPending}
        uninstalling={uninstallingId === previewSkill.id && uninstallMut.isPending}
        onInstall={() => {
          setInstallingId(previewSkill.id);
          installMut.mutate({ id: previewSkill.id, personalityId: selectedPersonalityId || undefined });
          setPreviewSkill(null);
        }}
        onUninstall={() => {
          setUninstallingId(previewSkill.id);
          uninstallMut.mutate({ id: previewSkill.id, personalityId: selectedPersonalityId || undefined });
          setPreviewSkill(null);
        }}
      />
    )}
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Search skills by name, description, or author..."
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
    </>
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
  const [previewSkill, setPreviewSkill] = useState<MarketplaceSkill | null>(null);
  const [syncResult, setSyncResult] = useState<{
    added: number;
    updated: number;
    skipped: number;
    removed: number;
    errors: string[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace-community', query, selectedPersonalityId],
    queryFn: () => fetchMarketplaceSkills(query || undefined, 'community', selectedPersonalityId),
    enabled: hasInitialized,
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

  const skills = data?.skills ?? [];
  const canInstall = !!selectedPersonalityId;

  const lastSynced = statusData?.lastSyncedAt
    ? new Date(statusData.lastSyncedAt).toLocaleString()
    : null;

  return (
    <>
    {previewSkill && (
      <SkillPreviewModal
        skill={previewSkill}
        onClose={() => setPreviewSkill(null)}
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
          uninstallMut.mutate({ id: previewSkill.id, personalityId: selectedPersonalityId || undefined });
          setPreviewSkill(null);
        }}
      />
    )}
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="Search community skills..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
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

      {/* Repo path + last synced info */}
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

      {/* Sync result */}
      {syncResult && (
        <div
          className={`p-3 rounded-lg border text-xs space-y-1 ${
            syncResult.errors.length > 0
              ? 'bg-warning/10 border-warning/20'
              : 'bg-success/10 border-success/20'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {syncResult.errors.length > 0 ? (
              <AlertCircle className="w-4 h-4 text-warning" />
            ) : (
              <CheckCircle className="w-4 h-4 text-success" />
            )}
            Sync complete — {syncResult.added} added, {syncResult.updated} updated,{' '}
            {syncResult.skipped} skipped
            {syncResult.removed > 0 && `, ${syncResult.removed} removed`}
            {syncResult.errors.length > 0 && `, ${syncResult.errors.length} error(s)`}
          </div>
          {syncResult.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {syncResult.errors.map((e, i) => (
                <li key={i} className="truncate">
                  · {e}
                </li>
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
            Click <strong>Sync</strong> to import skills from the community repo — git fetch runs
            automatically when <span className="font-mono">allowCommunityGitFetch</span> is
            enabled.
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
                onPreview={() => setPreviewSkill(skill)}
                onInstall={() => {
                  if (!canInstall) return;
                  setInstallingId(skill.id);
                  installMut.mutate({ id: skill.id, personalityId: selectedPersonalityId });
                }}
                onUninstall={() => {
                  setUninstallingId(skill.id);
                  uninstallMut.mutate({ id: skill.id, personalityId: selectedPersonalityId || undefined });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
