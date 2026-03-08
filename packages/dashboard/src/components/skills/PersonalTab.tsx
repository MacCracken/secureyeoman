import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wrench,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ThumbsUp,
  ThumbsDown,
  X,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  Bot,
  GitBranch,
  Shield,
  User,
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
  installMarketplaceSkill,
  fetchPersonalities,
} from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { Skill, SkillCreate } from '../../types';
import { sanitizeText } from '../../utils/sanitize';
import { useCollabEditor } from '../../hooks/useCollabEditor.js';
import { PresenceBanner } from '../PresenceBanner.js';
import { exportSkill, type TabType } from './shared';

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

/** Detect system items (themes/personalities installed from marketplace) that shouldn't appear in Personal view. */
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

export function PersonalTab() {
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

  const rawPersonalities = personalitiesData?.personalities ?? [];
  // Default personality first, then alphabetical
  const personalities = [...rawPersonalities].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('');
  // Auto-select default personality when data first loads
  const personalityInitialized = useRef(false);
  useEffect(() => {
    if (personalityInitialized.current || !personalities.length) return;
    const def = personalities.find((p) => p.isDefault);
    if (def) setSelectedPersonalityId(def.id);
    else setSelectedPersonalityId(personalities[0].id);
    personalityInitialized.current = true;
  }, [personalities]);

  const selectedPersonality = personalities.find((p) => p.id === selectedPersonalityId) ?? null;
  const skills = selectedPersonalityId
    ? (data?.skills ?? []).filter(
        (s) => s.personalityId === selectedPersonalityId && !isSystemSkill(s)
      )
    : [];
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
      personalityId: selectedPersonalityId || null,
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
      personalityId: s.personalityId ?? (selectedPersonalityId || null),
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
            `Invalid file: $schema must be "sy-skill/1" (got ${JSON.stringify(raw.$schema ?? null)}).`
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
            onSuccess: () => {
              setImportSuccess(`"${raw.name as string}" imported successfully.`);
            },
            onError: (err: unknown) => {
              setImportError(err instanceof Error ? err.message : 'Import failed.');
            },
          }
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
      types?: { description: string; accept: Record<string, string[]> }[];
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
    }) => Promise<{ getFile(): Promise<File> }[]>;

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

      {/* Row 1: Actions + filters */}
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
              personalityId: selectedPersonalityId || null,
            });
          }}
          className="btn btn-ghost"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Skill
        </button>
        <button
          onClick={() => void handleImportClick()}
          className="btn btn-secondary"
          title="Import a .skill.json file"
        >
          <Upload className="w-4 h-4 mr-1" /> Import
        </button>
        <div className="relative">
          <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
          <select
            value={selectedPersonalityId}
            onChange={(e) => {
              setSelectedPersonalityId(e.target.value);
            }}
            className="bg-card border border-border rounded-lg pl-10 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
          >
            {personalities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? ' (Default)' : ''}
                {p.isActive ? ' (Active)' : ''}
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

      {/* Row 3: Info text */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Bot className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Skills for{' '}
          <span className="font-medium text-foreground">{selectedPersonality?.name ?? '—'}</span>.
          To see all installed skills across every agent, visit the{' '}
          <span className="font-medium text-foreground">Installed</span> tab.
        </span>
      </div>

      {importError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{importError}</span>
          <button
            onClick={() => {
              setImportError(null);
            }}
            className="btn btn-ghost p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{importSuccess}</span>
          <button
            onClick={() => {
              setImportSuccess(null);
            }}
            className="btn btn-ghost p-1"
          >
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
                className="btn btn-ghost"
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
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {sanitizeText(skill.description)}
                  </p>
                  {(skill.triggerPatterns || []).length > 0 && (
                    <div className="flex items-center flex-wrap gap-1 mt-2">
                      <span className="text-xs font-medium text-muted-foreground mr-1">
                        Triggers:
                      </span>
                      {(skill.triggerPatterns || []).map((p, i) => (
                        <span
                          key={i}
                          className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  {(skill.mcpToolsAllowed || []).length > 0 && (
                    <div className="flex items-center flex-wrap gap-1 mt-1.5">
                      <Shield className="w-3 h-3 text-warning shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground mr-1">
                        MCP Restricted:
                      </span>
                      {(skill.mcpToolsAllowed || []).map((t, i) => (
                        <span
                          key={i}
                          className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded font-mono"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {skill.linkedWorkflowId && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <GitBranch className="w-3 h-3 text-info shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground">Workflow:</span>
                      <span className="text-xs bg-info/10 text-info px-2 py-0.5 rounded font-mono">
                        {skill.linkedWorkflowId}
                      </span>
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
                      onClick={() => {
                        exportSkill(skill);
                      }}
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
