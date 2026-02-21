import { useState, useCallback, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  User,
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Eye,
  ChevronDown,
  ChevronRight,
  Save,
  RefreshCw,
  Clock,
  GitBranch,
  FolderOpen,
  Globe,
  FileText,
  Search,
  Monitor,
  Wrench,
} from 'lucide-react';
import {
  fetchPersonalities,
  createPersonality,
  updatePersonality,
  deletePersonality,
  activatePersonality,
  fetchPromptPreview,
  fetchModelInfo,
  fetchPassions,
  createPassion,
  deletePassion,
  fetchInspirations,
  createInspiration,
  deleteInspiration,
  fetchPains,
  createPainEntry,
  deletePain,
  fetchKnowledge,
  learnKnowledge,
  updateKnowledge,
  deleteKnowledge,
  fetchHeartbeatTasks,
  updateHeartbeatTask,
  fetchExternalSyncStatus,
  fetchExternalBrainConfig,
  updateExternalBrainConfig,
  triggerExternalSync,
  fetchSkills,
  fetchMcpConfig,
  fetchSecurityPolicy,
} from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import { useCollabEditor } from '../hooks/useCollabEditor.js';
import { PresenceBanner } from './PresenceBanner.js';
import type {
  Personality,
  PersonalityCreate,
  Passion,
  Inspiration,
  Pain,
  KnowledgeEntry,
  HeartbeatTask,
  Skill,
} from '../types';
import { sanitizeText } from '../utils/sanitize';

const LOCAL_MCP_NAME = 'YEOMAN MCP';

const TRAIT_OPTIONS: Record<string, string[]> = {
  formality: ['casual', 'balanced', 'formal'],
  humor: ['none', 'subtle', 'witty'],
  verbosity: ['concise', 'balanced', 'detailed'],
};

const SEX_OPTIONS = ['unspecified', 'male', 'female', 'non-binary'] as const;

const PRIMARY_TOPICS = ['self-identity', 'hierarchy', 'purpose', 'interaction'];

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatIntervalHuman(ms: number): string {
  if (ms >= 3_600_000) {
    const h = Math.round(ms / 3_600_000);
    return `${h}h`;
  }
  if (ms >= 60_000) {
    const m = Math.round(ms / 60_000);
    return `${m}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

// ── Collapsible Section ─────────────────────────────────────────

function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border rounded p-3">
      <button
        onClick={() => {
          setOpen(!open);
        }}
        className="flex items-center gap-2 w-full text-left font-medium text-sm"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title}
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

// ── Spirit Section ──────────────────────────────────────────────

function SpiritSection() {
  const queryClient = useQueryClient();
  const [newPassion, setNewPassion] = useState({ name: '', description: '', intensity: 0.5 });
  const [newInspiration, setNewInspiration] = useState({
    source: '',
    description: '',
    impact: 0.5,
  });
  const [newPain, setNewPain] = useState({ trigger: '', description: '', severity: 0.5 });

  const { data: passionsData } = useQuery({ queryKey: ['passions'], queryFn: fetchPassions });
  const { data: inspirationsData } = useQuery({
    queryKey: ['inspirations'],
    queryFn: fetchInspirations,
  });
  const { data: painsData } = useQuery({ queryKey: ['pains'], queryFn: fetchPains });

  const passions = passionsData?.passions ?? [];
  const inspirations = inspirationsData?.inspirations ?? [];
  const pains = painsData?.pains ?? [];

  const createPassionMut = useMutation({
    mutationFn: () => createPassion(newPassion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['passions'] });
      setNewPassion({ name: '', description: '', intensity: 0.5 });
    },
  });

  const deletePassionMut = useMutation({
    mutationFn: (id: string) => deletePassion(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['passions'] }),
  });

  const createInspirationMut = useMutation({
    mutationFn: () => createInspiration(newInspiration),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inspirations'] });
      setNewInspiration({ source: '', description: '', impact: 0.5 });
    },
  });

  const deleteInspirationMut = useMutation({
    mutationFn: (id: string) => deleteInspiration(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['inspirations'] }),
  });

  const createPainMut = useMutation({
    mutationFn: () => createPainEntry(newPain),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pains'] });
      setNewPain({ trigger: '', description: '', severity: 0.5 });
    },
  });

  const deletePainMut = useMutation({
    mutationFn: (id: string) => deletePain(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pains'] }),
  });

  return (
    <CollapsibleSection title="Spirit - Pathos">
      {/* Passions */}
      <div>
        <h4 className="text-sm font-medium mb-2">Passions</h4>
        <div className="space-y-1 mb-2">
          {passions.map((p: Passion) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{p.name}</strong> (intensity: {p.intensity}){' '}
                {p.description && `— ${p.description}`}
              </span>
              <button
                onClick={() => {
                  deletePassionMut.mutate(p.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Name"
              value={newPassion.name}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, name: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newPassion.intensity}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, intensity: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Intensity: ${newPassion.intensity}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPassion.description}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createPassionMut.mutate();
              }}
              disabled={!newPassion.name.trim()}
              className="btn btn-primary px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Inspirations */}
      <div>
        <h4 className="text-sm font-medium mb-2">Inspirations</h4>
        <div className="space-y-1 mb-2">
          {inspirations.map((i: Inspiration) => (
            <div
              key={i.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{i.source}</strong> (impact: {i.impact}){' '}
                {i.description && `— ${i.description}`}
              </span>
              <button
                onClick={() => {
                  deleteInspirationMut.mutate(i.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Source"
              value={newInspiration.source}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, source: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newInspiration.impact}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, impact: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Impact: ${newInspiration.impact}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newInspiration.description}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createInspirationMut.mutate();
              }}
              disabled={!newInspiration.source.trim()}
              className="btn btn-primary px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Pains */}
      <div>
        <h4 className="text-sm font-medium mb-2">Pain Points</h4>
        <div className="space-y-1 mb-2">
          {pains.map((p: Pain) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{p.trigger}</strong> (severity: {p.severity}){' '}
                {p.description && `— ${p.description}`}
              </span>
              <button
                onClick={() => {
                  deletePainMut.mutate(p.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Trigger"
              value={newPain.trigger}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, trigger: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newPain.severity}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, severity: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Severity: ${newPain.severity}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPain.description}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createPainMut.mutate();
              }}
              disabled={!newPain.trigger.trim()}
              className="btn btn-primary px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ── Brain Section ───────────────────────────────────────────────

function BrainSection({ personalityId }: { personalityId: string | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [teachTopic, setTeachTopic] = useState('');
  const [teachContent, setTeachContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editConfidence, setEditConfidence] = useState(0.5);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeEntry | null>(null);

  const { data: knowledgeData } = useQuery({ queryKey: ['knowledge'], queryFn: fetchKnowledge });
  const knowledge = knowledgeData?.knowledge ?? [];

  const { data: allSkillsData } = useQuery({ queryKey: ['skills'], queryFn: () => fetchSkills() });
  const personalitySkills = (allSkillsData?.skills ?? []).filter(
    (s: Skill) => s.personalityId === personalityId
  );

  const { data: syncStatus } = useQuery({
    queryKey: ['externalSync'],
    queryFn: fetchExternalSyncStatus,
  });

  const { data: brainConfig, refetch: refetchBrainConfig } = useQuery({
    queryKey: ['externalBrainConfig'],
    queryFn: fetchExternalBrainConfig,
  });

  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configForm, setConfigForm] = useState({
    enabled: true,
    provider: 'filesystem',
    path: '',
    subdir: '',
    syncIntervalMs: 0,
  });

  const configMut = useMutation({
    mutationFn: (data: typeof configForm) => updateExternalBrainConfig(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['externalBrainConfig'] });
      void queryClient.invalidateQueries({ queryKey: ['externalSync'] });
      setShowConfigForm(false);
    },
  });

  const learnMut = useMutation({
    mutationFn: () => learnKnowledge(teachTopic, teachContent),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      setTeachTopic('');
      setTeachContent('');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { content?: string; confidence?: number } }) =>
      updateKnowledge(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteKnowledge(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const syncMut = useMutation({
    mutationFn: () => triggerExternalSync(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['externalSync'] }),
  });

  const startEdit = (k: KnowledgeEntry) => {
    setEditingId(k.id);
    setEditContent(k.content);
    setEditConfidence(k.confidence);
  };

  const handleSaveEdit = () => {
    if (editingId) {
      updateMut.mutate({
        id: editingId,
        data: { content: editContent, confidence: editConfidence },
      });
    }
  };

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  const isPrimary = (topic: string) => PRIMARY_TOPICS.includes(topic);

  return (
    <CollapsibleSection title="Brain - Intellect">
      {/* 1. External Knowledge Base — moved to top */}
      <div className="border-b pb-3 mb-1">
        <h4 className="text-sm font-medium mb-2">External Knowledge Base</h4>
        {syncStatus?.configured || brainConfig?.configured ? (
          <div className="space-y-2">
            <div className="text-xs space-y-1">
              <p>
                Provider:{' '}
                <strong>{syncStatus?.provider || brainConfig?.provider || 'Unknown'}</strong>
              </p>
              {(syncStatus as { path?: string })?.path && (
                <p>
                  Path:{' '}
                  <code className="bg-muted px-1 rounded">
                    {(syncStatus as { path?: string })?.path || brainConfig?.path}
                  </code>
                </p>
              )}
              {(syncStatus as { lastSync?: { timestamp: number; entriesExported: number } | null })
                ?.lastSync && (
                <p>
                  Last sync:{' '}
                  {relativeTime(
                    (syncStatus as { lastSync?: { timestamp: number } }).lastSync?.timestamp ?? 0
                  )}{' '}
                  (
                  {(syncStatus as { lastSync?: { entriesExported: number } }).lastSync
                    ?.entriesExported ?? 0}{' '}
                  entries exported)
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  syncMut.mutate();
                }}
                disabled={syncMut.isPending}
                className="btn btn-primary text-xs px-2 py-1 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                {syncMut.isPending ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={() => {
                  setShowConfigForm(!showConfigForm);
                }}
                className="btn btn-ghost text-xs px-2 py-1"
              >
                Configure
              </button>
            </div>
          </div>
        ) : showConfigForm ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Configure external brain sync to export memories and knowledge.
            </p>
            <div className="grid gap-2">
              <label className="text-xs">
                Provider
                <select
                  value={configForm.provider}
                  onChange={(e) => {
                    setConfigForm({ ...configForm, provider: e.target.value });
                  }}
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                >
                  <option value="filesystem">Filesystem</option>
                  <option value="obsidian">Obsidian</option>
                  <option value="git_repo">Git Repo</option>
                </select>
              </label>
              <label className="text-xs">
                Path
                <input
                  type="text"
                  value={configForm.path}
                  onChange={(e) => {
                    setConfigForm({ ...configForm, path: e.target.value });
                  }}
                  placeholder="/path/to/vault or /path/to/notes"
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                />
              </label>
              <label className="text-xs">
                Subdirectory (optional)
                <input
                  type="text"
                  value={configForm.subdir}
                  onChange={(e) => {
                    setConfigForm({ ...configForm, subdir: e.target.value });
                  }}
                  placeholder="e.g., 30 - Resources/FRIDAY"
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                />
              </label>
              <label className="text-xs">
                Sync Interval (minutes, 0 = manual only)
                <input
                  type="number"
                  value={configForm.syncIntervalMs / 60000}
                  onChange={(e) => {
                    setConfigForm({
                      ...configForm,
                      syncIntervalMs: parseInt(e.target.value || '0', 10) * 60000,
                    });
                  }}
                  min={0}
                  max={1440}
                  className="w-full mt-1 px-2 py-1 text-sm rounded border bg-background"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  configMut.mutate(configForm);
                }}
                disabled={!configForm.path || configMut.isPending}
                className="btn btn-primary text-xs px-3 py-1"
              >
                {configMut.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
              <button
                onClick={() => {
                  setShowConfigForm(false);
                }}
                className="btn btn-ghost text-xs px-3 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              External brain sync is not configured. Configure it to export memories and knowledge.
            </p>
            <button
              onClick={() => {
                setShowConfigForm(true);
              }}
              className="btn btn-primary text-xs px-3 py-1"
            >
              Configure External Sync
            </button>
          </div>
        )}
      </div>

      {/* 2. Knowledge sub-section */}
      <CollapsibleSection title="Knowledge">
        <ConfirmDialog
          open={!!deleteTarget}
          title="Delete Knowledge Entry"
          message={
            deleteTarget && isPrimary(deleteTarget.topic)
              ? `WARNING: "${deleteTarget.topic}" is a PRIMARY knowledge entry critical to the agent's identity. Deleting it may cause unpredictable behavior. Are you sure?`
              : `Delete knowledge entry "${deleteTarget?.topic}"? This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
          }}
        />

        <div className="space-y-2 mb-3">
          {knowledge.length === 0 && (
            <p className="text-xs text-muted-foreground">No knowledge entries yet.</p>
          )}
          {knowledge.map((k: KnowledgeEntry) => (
            <div key={k.id} className="text-sm bg-muted px-3 py-2 rounded space-y-1">
              {editingId === k.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong>[{k.topic}]</strong>
                    {isPrimary(k.topic) && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                    }}
                    className="w-full px-2 py-1 text-sm rounded border bg-background resize-y"
                    rows={3}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-muted-foreground">Confidence:</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={editConfidence}
                      onChange={(e) => {
                        setEditConfidence(parseFloat(e.target.value));
                      }}
                      className="w-24"
                    />
                    <span className="text-xs">{editConfidence.toFixed(2)}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => {
                        setEditingId(null);
                      }}
                      className="btn btn-ghost text-xs px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={updateMut.isPending}
                      className="btn btn-primary text-xs px-2 py-1 flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong>[{k.topic}]</strong>
                      {isPrimary(k.topic) && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                          PRIMARY
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        (confidence: {k.confidence})
                      </span>
                      <span className="text-xs text-muted-foreground">src: {k.source}</span>
                    </div>
                    <p className="mt-0.5">{sanitizeText(k.content)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        startEdit(k);
                      }}
                      className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setDeleteTarget(k);
                      }}
                      className="btn-ghost p-1 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Teach form */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Teach</h4>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Topic"
              value={teachTopic}
              onChange={(e) => {
                setTeachTopic(e.target.value);
              }}
              className="w-32 px-2 py-1 text-sm rounded border bg-background"
            />
            <input
              type="text"
              placeholder="Content"
              value={teachContent}
              onChange={(e) => {
                setTeachContent(e.target.value);
              }}
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                learnMut.mutate();
              }}
              disabled={!teachTopic.trim() || !teachContent.trim() || learnMut.isPending}
              className="btn btn-primary text-xs px-2 py-1"
            >
              {learnMut.isPending ? 'Teaching...' : 'Teach'}
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Skills sub-section */}
      <CollapsibleSection title="Skills">
        {personalityId === null ? (
          <p className="text-xs text-muted-foreground">
            Save this personality first to manage associated skills.
          </p>
        ) : personalitySkills.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No skills are associated with this personality yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Add skills from the{' '}
              <button
                onClick={() => navigate('/marketplace')}
                className="text-primary hover:underline"
              >
                Skills Marketplace
              </button>{' '}
              or{' '}
              <button
                onClick={() => navigate('/skills', { state: { initialTab: 'community' } })}
                className="text-primary hover:underline"
              >
                Community
              </button>{' '}
              tabs, or create a personal skill in the{' '}
              <button onClick={() => navigate('/skills')} className="text-primary hover:underline">
                Skills → Personal
              </button>{' '}
              tab.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {personalitySkills.map((skill: Skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50"
              >
                <span className="text-sm flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-muted-foreground" />
                  {sanitizeText(skill.name)}
                </span>
                <button
                  onClick={() => navigate('/skills', { state: { openSkillId: skill.id } })}
                  className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
                  title="Edit skill"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

// ── Body Section ────────────────────────────────────────────────

function HeartbeatTasksSection() {
  const queryClient = useQueryClient();
  const { data: tasksData } = useQuery({
    queryKey: ['heartbeatTasks'],
    queryFn: fetchHeartbeatTasks,
  });
  const tasks = tasksData?.tasks ?? [];

  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editFreqMinutes, setEditFreqMinutes] = useState(5);

  const updateMut = useMutation({
    mutationFn: ({
      name,
      data,
    }: {
      name: string;
      data: { intervalMs?: number; enabled?: boolean };
    }) => updateHeartbeatTask(name, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['heartbeatTasks'] });
      setEditingTask(null);
    },
  });

  const startEdit = (task: HeartbeatTask) => {
    setEditingTask(task.name);
    setEditFreqMinutes(Math.round((task.intervalMs ?? 60_000) / 60_000));
  };

  return (
    <div className="space-y-2">
      {tasks.length === 0 && (
        <p className="text-xs text-muted-foreground">No heartbeat tasks configured.</p>
      )}
      {tasks.map((task: HeartbeatTask) => (
        <div key={task.name} className="text-sm bg-muted px-3 py-2 rounded">
          {editingTask === task.name ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <strong>{task.name}</strong>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                  {task.type}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs">Frequency (minutes):</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={editFreqMinutes}
                  onChange={(e) => {
                    setEditFreqMinutes(parseInt(e.target.value) || 1);
                  }}
                  className="w-20 px-2 py-1 text-sm rounded border bg-background"
                />
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setEditingTask(null);
                  }}
                  className="btn btn-ghost text-xs px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateMut.mutate({
                      name: task.name,
                      data: { intervalMs: editFreqMinutes * 60_000 },
                    });
                  }}
                  disabled={updateMut.isPending}
                  className="btn btn-primary text-xs px-2 py-1 flex items-center gap-1"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <strong>{task.name}</strong>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                  {task.type}
                </span>
                <span
                  className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                    task.enabled ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {task.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  every {formatIntervalHuman(task.intervalMs ?? 60_000)}
                </span>
                <span className="text-xs text-muted-foreground">
                  last: {task.lastRunAt ? relativeTime(task.lastRunAt) : 'never'}
                </span>
                {task.type === 'reflective_task' && task.config?.prompt != null && (
                  <span className="text-xs italic text-muted-foreground truncate max-w-48">{`\u201C${String(task.config.prompt)}\u201D`}</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  title={task.enabled ? 'Enabled' : 'Disabled'}
                >
                  <input
                    type="checkbox"
                    checked={task.enabled}
                    onChange={() => {
                      updateMut.mutate({ name: task.name, data: { enabled: !task.enabled } });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-muted-foreground/30 peer-checked:bg-primary rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                </label>
                <button
                  onClick={() => {
                    startEdit(task);
                  }}
                  className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
                  title="Edit frequency"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface BodySectionProps {
  allowConnections: boolean;
  onAllowConnectionsChange: (enabled: boolean) => void;
  selectedServers: string[];
  onSelectedServersChange: (servers: string[]) => void;
  selectedIntegrations: string[];
  onSelectedIntegrationsChange: (integrations: string[]) => void;
  enabledCaps: Record<string, boolean>;
  onEnabledCapsChange: (caps: Record<string, boolean>) => void;
  mcpFeatures: {
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
  };
  onMcpFeaturesChange: (features: {
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
  }) => void;
  creationConfig: {
    skills: boolean;
    tasks: boolean;
    personalities: boolean;
    subAgents: boolean;
    customRoles: boolean;
    roleAssignments: boolean;
    experiments: boolean;
    allowA2A: boolean;
    allowSwarms: boolean;
    allowDynamicTools: boolean;
  };
  onCreationConfigChange: (config: {
    skills: boolean;
    tasks: boolean;
    personalities: boolean;
    subAgents: boolean;
    customRoles: boolean;
    roleAssignments: boolean;
    experiments: boolean;
    allowA2A: boolean;
    allowSwarms: boolean;
    allowDynamicTools: boolean;
  }) => void;
  proactiveConfig: {
    enabled: boolean;
    approvalMode: 'auto' | 'suggest' | 'manual';
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    learning: { enabled: boolean; minConfidence: number };
  };
  onProactiveConfigChange: (config: {
    enabled: boolean;
    approvalMode: 'auto' | 'suggest' | 'manual';
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    learning: { enabled: boolean; minConfidence: number };
  }) => void;
}

function BodySection({
  allowConnections,
  onAllowConnectionsChange,
  selectedServers,
  onSelectedServersChange,
  selectedIntegrations,
  onSelectedIntegrationsChange,
  enabledCaps,
  onEnabledCapsChange,
  mcpFeatures,
  onMcpFeaturesChange,
  creationConfig,
  onCreationConfigChange,
  proactiveConfig,
  onProactiveConfigChange,
}: BodySectionProps) {
  const capabilities = ['auditory', 'haptic', 'limb_movement', 'vision', 'vocalization'] as const;
  const { data: serversData, isLoading: serversLoading } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: () => fetch('/api/v1/mcp/servers').then((r) => r.json()),
  });
  const servers = serversData?.servers ?? [];

  const { data: integrationsData, isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => fetch('/api/v1/integrations').then((r) => r.json()),
  });
  const integrations: { id: string; displayName: string; platform: string; status: string }[] =
    integrationsData?.integrations ?? [];

  // Global MCP feature config — gates per-personality feature toggles
  const { data: globalMcpConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
  });

  // Fetch top-level security policy to gate sub-agent toggle
  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });
  const subAgentsBlockedByPolicy = securityPolicy?.allowSubAgents === false;
  const a2aBlockedByPolicy = securityPolicy?.allowA2A === false;
  const swarmsBlockedByPolicy = securityPolicy?.allowSwarms === false;
  const dtcBlockedByPolicy = securityPolicy?.allowDynamicTools === false;

  const creationItems = [
    { key: 'tasks' as const, label: 'New Tasks', icon: '📋' },
    { key: 'skills' as const, label: 'New Skills', icon: '🧠' },
    { key: 'experiments' as const, label: 'New Experiments', icon: '🧪' },
    { key: 'personalities' as const, label: 'New Personalities', icon: '👤' },
    {
      key: 'subAgents' as const,
      label: 'New Sub-Agents',
      icon: '🤖',
      blockedByPolicy: subAgentsBlockedByPolicy,
    },
    { key: 'customRoles' as const, label: 'New Custom Roles', icon: '🛡️' },
    { key: 'roleAssignments' as const, label: 'Assign Roles', icon: '🔑' },
    {
      key: 'allowDynamicTools' as const,
      label: 'Dynamic Tool Creation',
      icon: '🔧',
      blockedByPolicy: dtcBlockedByPolicy,
    },
  ];

  const allEnabled = creationItems
    .filter((item) => !('blockedByPolicy' in item && item.blockedByPolicy))
    .every((item) => creationConfig[item.key]);

  const toggleCreationItem = (
    key:
      | 'skills'
      | 'tasks'
      | 'personalities'
      | 'subAgents'
      | 'customRoles'
      | 'roleAssignments'
      | 'experiments'
      | 'allowA2A'
      | 'allowSwarms'
      | 'allowDynamicTools'
  ) => {
    onCreationConfigChange({
      ...creationConfig,
      [key]: !creationConfig[key],
    });
  };

  const toggleAllCreation = () => {
    const newValue = !allEnabled;
    onCreationConfigChange({
      skills: newValue,
      tasks: newValue,
      personalities: newValue,
      // Respect top-level security policy — never enable subAgents when blocked
      subAgents: subAgentsBlockedByPolicy ? false : newValue,
      customRoles: newValue,
      roleAssignments: newValue,
      experiments: newValue,
      // A2A/Swarms are sub-settings of subAgents — not toggled by Enable All
      allowA2A: creationConfig.allowA2A,
      allowSwarms: creationConfig.allowSwarms,
      // DTC is independent — respect policy but preserve current value
      allowDynamicTools: dtcBlockedByPolicy ? false : newValue,
    });
  };

  const capabilityInfo: Record<string, { icon: string; description: string; available: boolean }> =
    {
      auditory: {
        icon: '👂',
        description: 'Microphone input and audio output',
        available: true,
      },
      haptic: {
        icon: '🖐️',
        description: 'Tactile feedback and notifications',
        available: true,
      },
      limb_movement: {
        icon: '⌨️',
        description: 'Keyboard/mouse control and system commands',
        available: true,
      },
      vision: {
        icon: '👁️',
        description: 'Screen capture and visual input',
        available: true,
      },
      vocalization: {
        icon: '🗣️',
        description: 'Text-to-speech voice output',
        available: true,
      },
    };

  const toggleCapability = (cap: string) => {
    onEnabledCapsChange({ ...enabledCaps, [cap]: !enabledCaps[cap] });
  };

  return (
    <CollapsibleSection title="Body - Endowments" defaultOpen={false}>
      <CollapsibleSection title="Proactive Assistance" defaultOpen={false}>
        {/* Enable toggle — gated by security policy */}
        {(() => {
          const proactiveBlockedByPolicy = securityPolicy?.allowProactive === false;
          return (
            <div className="space-y-4">
              <div
                className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                  proactiveBlockedByPolicy
                    ? 'bg-muted/30 border-border opacity-60'
                    : proactiveConfig.enabled
                      ? 'bg-success/5 border-success/30'
                      : 'bg-muted/50 border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">Enable Assistance</span>
                  {proactiveBlockedByPolicy && (
                    <span className="text-xs text-destructive">(blocked by security policy)</span>
                  )}
                </div>
                <label
                  className={`relative inline-flex items-center ${proactiveBlockedByPolicy ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={proactiveBlockedByPolicy ? false : proactiveConfig.enabled}
                    onChange={() => {
                      if (!proactiveBlockedByPolicy) {
                        onProactiveConfigChange({
                          ...proactiveConfig,
                          enabled: !proactiveConfig.enabled,
                        });
                      }
                    }}
                    disabled={proactiveBlockedByPolicy}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                  <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                    {proactiveBlockedByPolicy
                      ? 'Blocked'
                      : proactiveConfig.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                  </span>
                </label>
              </div>

              {proactiveConfig.enabled && !proactiveBlockedByPolicy && (
                <>
                  {/* Approval Mode */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Approval Mode</h4>
                    <div className="flex gap-1">
                      {(['auto', 'suggest', 'manual'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            onProactiveConfigChange({ ...proactiveConfig, approvalMode: mode });
                          }}
                          className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                            proactiveConfig.approvalMode === mode
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/50 border-border hover:bg-muted'
                          }`}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {proactiveConfig.approvalMode === 'auto' &&
                        'Actions execute automatically without user approval.'}
                      {proactiveConfig.approvalMode === 'suggest' &&
                        'Actions are suggested to the user for approval before execution.'}
                      {proactiveConfig.approvalMode === 'manual' &&
                        'All proactive actions require explicit manual approval.'}
                    </p>
                  </div>

                  {/* Built-in Triggers */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Built-in Triggers</h4>
                    <div className="space-y-2">
                      {[
                        { key: 'dailyStandup' as const, label: 'Daily Standup Reminder' },
                        { key: 'weeklySummary' as const, label: 'Weekly Summary' },
                        { key: 'contextualFollowup' as const, label: 'Contextual Follow-up' },
                        {
                          key: 'integrationHealthAlert' as const,
                          label: 'Integration Health Alert',
                        },
                        { key: 'securityAlertDigest' as const, label: 'Security Alert Digest' },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                            proactiveConfig.builtins[item.key]
                              ? 'bg-success/5 border-success/30'
                              : 'bg-muted/50 border-border'
                          }`}
                        >
                          <span className="font-medium">{item.label}</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={proactiveConfig.builtins[item.key]}
                              onChange={() => {
                                onProactiveConfigChange({
                                  ...proactiveConfig,
                                  builtins: {
                                    ...proactiveConfig.builtins,
                                    [item.key]: !proactiveConfig.builtins[item.key],
                                  },
                                });
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Learning */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Learning</h4>
                    <div className="space-y-3">
                      <div
                        className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                          proactiveConfig.learning.enabled
                            ? 'bg-success/5 border-success/30'
                            : 'bg-muted/50 border-border'
                        }`}
                      >
                        <span className="font-medium">Enable Learning</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={proactiveConfig.learning.enabled}
                            onChange={() => {
                              onProactiveConfigChange({
                                ...proactiveConfig,
                                learning: {
                                  ...proactiveConfig.learning,
                                  enabled: !proactiveConfig.learning.enabled,
                                },
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                        </label>
                      </div>
                      {proactiveConfig.learning.enabled && (
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">
                            Min Confidence: {proactiveConfig.learning.minConfidence.toFixed(2)}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={proactiveConfig.learning.minConfidence}
                            onChange={(e) => {
                              onProactiveConfigChange({
                                ...proactiveConfig,
                                learning: {
                                  ...proactiveConfig.learning,
                                  minConfidence: parseFloat(e.target.value),
                                },
                              });
                            }}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0.0</span>
                            <span>1.0</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </CollapsibleSection>

      <div>
        <CollapsibleSection title="Capabilities" defaultOpen={false}>
          <div className="space-y-2">
            {capabilities.map((cap) => {
              const info = capabilityInfo[cap];
              const isEnabled = enabledCaps[cap] ?? false;
              const isConfigurable =
                info.available &&
                (cap === 'vision' ||
                  cap === 'auditory' ||
                  cap === 'limb_movement' ||
                  cap === 'vocalization' ||
                  cap === 'haptic');

              return (
                <div
                  key={cap}
                  className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                    isEnabled
                      ? 'bg-success/5 border-success/30'
                      : info.available
                        ? 'bg-muted/50 border-border'
                        : 'bg-muted/30 border-border opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{info.icon}</span>
                    <div>
                      <span className="capitalize font-medium">{cap.replace('_', ' ')}</span>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!info.available ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Not available
                      </span>
                    ) : isConfigurable ? (
                      <label
                        className="relative inline-flex items-center cursor-pointer"
                        title={isEnabled ? 'Enabled' : 'Disabled'}
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => {
                            toggleCapability(cap);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                        <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        Available
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      </div>

      {/* MCP Connections */}
      <CollapsibleSection title="MCP Connections" defaultOpen={false}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Enable MCP connections</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowConnections}
                onChange={(e) => {
                  onAllowConnectionsChange(e.target.checked);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          </div>

          {allowConnections && (
            <>
              <p className="text-xs text-muted-foreground">
                Select which MCP servers this personality can use:
              </p>

              {serversLoading ? (
                <p className="text-xs text-muted-foreground">Loading servers...</p>
              ) : servers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No MCP servers configured. Add servers in Connections &gt; MCP Server.
                </p>
              ) : (
                <div className="space-y-2">
                  {servers.map((server: { id: string; name: string; description: string }) => {
                    const isSelected = selectedServers.includes(server.id);
                    const isYeoman = server.name === LOCAL_MCP_NAME;

                    return (
                      <div key={server.id}>
                        <label
                          className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-success/5 border-success/30'
                              : 'bg-muted/30 border-border hover:bg-muted/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                onSelectedServersChange([...selectedServers, server.id]);
                              } else {
                                onSelectedServersChange(
                                  selectedServers.filter((id) => id !== server.id)
                                );
                              }
                            }}
                            className="w-3.5 h-3.5 rounded accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">{server.name}</span>
                            {server.description && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {server.description}
                              </p>
                            )}
                          </div>
                        </label>

                        {/* Per-personality feature toggles for YEOMAN MCP */}
                        {isYeoman && isSelected && (
                          <div className="ml-6 mt-1 space-y-1">
                            <p className="text-[10px] text-muted-foreground mb-1">
                              Tool categories this personality can access:
                            </p>
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeGit
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Git & GitHub
                                {!globalMcpConfig?.exposeGit && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeGit}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeGit: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeGit}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeFilesystem
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Filesystem
                                {!globalMcpConfig?.exposeFilesystem && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeFilesystem}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeFilesystem: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeFilesystem}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Web Scraping & Search — master toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeWeb
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Web Scraping & Search
                                {!globalMcpConfig?.exposeWeb && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (enable in Connections first)
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeWeb}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeWeb: e.target.checked,
                                    // Disable sub-toggles when master is unchecked
                                    ...(!e.target.checked
                                      ? { exposeWebScraping: false, exposeWebSearch: false }
                                      : {}),
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeWeb}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                            {/* Web sub-toggles — only visible when exposeWeb is checked */}
                            {mcpFeatures.exposeWeb && (
                              <>
                                <label
                                  className={`flex items-center gap-2 p-1.5 ml-4 rounded bg-muted/30 transition-colors ${
                                    globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebScraping
                                      ? 'cursor-pointer hover:bg-muted/50'
                                      : 'opacity-50 cursor-not-allowed'
                                  }`}
                                >
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs flex-1">
                                    Scraping Tools
                                    {!(
                                      globalMcpConfig?.exposeWeb &&
                                      globalMcpConfig?.exposeWebScraping
                                    ) && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        (enable in Connections first)
                                      </span>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={mcpFeatures.exposeWebScraping}
                                    onChange={(e) => {
                                      onMcpFeaturesChange({
                                        ...mcpFeatures,
                                        exposeWebScraping: e.target.checked,
                                      });
                                    }}
                                    disabled={
                                      !(
                                        globalMcpConfig?.exposeWeb &&
                                        globalMcpConfig?.exposeWebScraping
                                      )
                                    }
                                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                  />
                                </label>
                                <label
                                  className={`flex items-center gap-2 p-1.5 ml-4 rounded bg-muted/30 transition-colors ${
                                    globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebSearch
                                      ? 'cursor-pointer hover:bg-muted/50'
                                      : 'opacity-50 cursor-not-allowed'
                                  }`}
                                >
                                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs flex-1">
                                    Search Tools
                                    {!(
                                      globalMcpConfig?.exposeWeb && globalMcpConfig?.exposeWebSearch
                                    ) && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        (enable in Connections first)
                                      </span>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={mcpFeatures.exposeWebSearch}
                                    onChange={(e) => {
                                      onMcpFeaturesChange({
                                        ...mcpFeatures,
                                        exposeWebSearch: e.target.checked,
                                      });
                                    }}
                                    disabled={
                                      !(
                                        globalMcpConfig?.exposeWeb &&
                                        globalMcpConfig?.exposeWebSearch
                                      )
                                    }
                                    className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                                  />
                                </label>
                              </>
                            )}
                            {/* Browser Automation — standalone toggle */}
                            <label
                              className={`flex items-center gap-2 p-1.5 rounded bg-muted/30 transition-colors ${
                                globalMcpConfig?.exposeBrowser
                                  ? 'cursor-pointer hover:bg-muted/50'
                                  : 'opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">
                                Browser Automation
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  (preview)
                                </span>
                                {!globalMcpConfig?.exposeBrowser && (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    — enable in Connections first
                                  </span>
                                )}
                              </span>
                              <input
                                type="checkbox"
                                checked={mcpFeatures.exposeBrowser}
                                onChange={(e) => {
                                  onMcpFeaturesChange({
                                    ...mcpFeatures,
                                    exposeBrowser: e.target.checked,
                                  });
                                }}
                                disabled={!globalMcpConfig?.exposeBrowser}
                                className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Integration Access */}
      <CollapsibleSection title="Integration Access" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Select which integrations this personality can access. Leave all unchecked to allow
            access to every configured integration.
          </p>

          {integrationsLoading ? (
            <p className="text-xs text-muted-foreground">Loading integrations...</p>
          ) : integrations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No integrations configured. Add integrations in Connections &gt; Integrations.
            </p>
          ) : (
            <div className="space-y-2">
              {integrations.map((integration) => {
                const isSelected = selectedIntegrations.includes(integration.id);
                return (
                  <label
                    key={integration.id}
                    className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-success/5 border-success/30'
                        : 'bg-muted/30 border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectedIntegrationsChange([...selectedIntegrations, integration.id]);
                        } else {
                          onSelectedIntegrationsChange(
                            selectedIntegrations.filter((id) => id !== integration.id)
                          );
                        }
                      }}
                      className="w-3.5 h-3.5 rounded accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{integration.displayName}</span>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {integration.platform}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Resource Creation" defaultOpen={false}>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Resource Creation</h4>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={allEnabled}
              onChange={toggleAllCreation}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
              {allEnabled ? 'All enabled' : 'Enable all'}
            </span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Allow this personality to autonomously create new skills, tasks, roles, experiments, and
          personalities.
        </p>
        <div className="space-y-2">
          {creationItems.map((item) => {
            const blocked = 'blockedByPolicy' in item && item.blockedByPolicy;
            const isEnabled = blocked ? false : creationConfig[item.key];
            return (
              <Fragment key={item.key}>
                <div
                  className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                    blocked
                      ? 'bg-muted/30 border-border opacity-60'
                      : isEnabled
                        ? 'bg-success/5 border-success/30'
                        : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    {blocked && (
                      <span className="text-xs text-destructive">
                        (disabled by security policy)
                      </span>
                    )}
                  </div>
                  <label
                    className={`relative inline-flex items-center ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => {
                        if (!blocked) toggleCreationItem(item.key);
                      }}
                      disabled={blocked}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                    <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                      {blocked ? 'Blocked' : isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>

                {/* A2A and Swarms sub-settings — only visible when New Sub-Agents is enabled */}
                {item.key === 'subAgents' && creationConfig.subAgents && (
                  <div className="ml-6 pl-4 border-l-2 border-border space-y-2">
                    {[
                      {
                        key: 'allowA2A' as const,
                        label: 'A2A Networks',
                        icon: '🌐',
                        blocked: a2aBlockedByPolicy,
                      },
                      {
                        key: 'allowSwarms' as const,
                        label: 'Agent Swarms',
                        icon: '🐝',
                        blocked: swarmsBlockedByPolicy,
                      },
                    ].map((sub) => {
                      const subEnabled = sub.blocked ? false : creationConfig[sub.key];
                      return (
                        <div
                          key={sub.key}
                          className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                            sub.blocked
                              ? 'bg-muted/30 border-border opacity-60'
                              : subEnabled
                                ? 'bg-success/5 border-success/30'
                                : 'bg-muted/50 border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{sub.icon}</span>
                            <span className="font-medium">{sub.label}</span>
                            {sub.blocked && (
                              <span className="text-xs text-destructive">
                                (disabled by security policy)
                              </span>
                            )}
                          </div>
                          <label
                            className={`relative inline-flex items-center ${sub.blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <input
                              type="checkbox"
                              checked={subEnabled}
                              onChange={() => {
                                if (!sub.blocked) toggleCreationItem(sub.key);
                              }}
                              disabled={sub.blocked}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                            <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                              {sub.blocked ? 'Blocked' : subEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

function HeartSection() {
  return (
    <CollapsibleSection title="Heart — Pulse">
      <div>
        <h4 className="text-sm font-medium mb-2">Heartbeat Tasks</h4>
        <HeartbeatTasksSection />
      </div>
    </CollapsibleSection>
  );
}

// ── Main PersonalityEditor ──────────────────────────────────────

export function PersonalityEditor() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Personality | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [setActiveOnSave, setSetActiveOnSave] = useState(false);
  const [form, setForm] = useState<PersonalityCreate>({
    name: '',
    description: '',
    systemPrompt: '',
    traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
    sex: 'unspecified',
    voice: '',
    preferredLanguage: '',
    defaultModel: null,
    modelFallbacks: [],
    includeArchetypes: true,
    body: {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
      },
    },
  });

  const [pendingFallback, setPendingFallback] = useState('');

  const [creationConfig, setCreationConfig] = useState({
    skills: false,
    tasks: false,
    personalities: false,
    subAgents: false,
    customRoles: false,
    roleAssignments: false,
    experiments: false,
    allowA2A: false,
    allowSwarms: false,
    allowDynamicTools: false,
  });

  const [allowConnections, setAllowConnections] = useState(false);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([]);
  const [enabledCaps, setEnabledCaps] = useState<Record<string, boolean>>({
    vision: false,
    limb_movement: false,
    auditory: false,
    haptic: false,
    vocalization: false,
  });
  const [mcpFeatures, setMcpFeatures] = useState<{
    exposeGit: boolean;
    exposeFilesystem: boolean;
    exposeWeb: boolean;
    exposeWebScraping: boolean;
    exposeWebSearch: boolean;
    exposeBrowser: boolean;
  }>({
    exposeGit: false,
    exposeFilesystem: false,
    exposeWeb: false,
    exposeWebScraping: false,
    exposeWebSearch: false,
    exposeBrowser: false,
  });
  const [proactiveConfig, setProactiveConfig] = useState<{
    enabled: boolean;
    approvalMode: 'auto' | 'suggest' | 'manual';
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    learning: { enabled: boolean; minConfidence: number };
  }>({
    enabled: false,
    approvalMode: 'suggest',
    builtins: {
      dailyStandup: false,
      weeklySummary: false,
      contextualFollowup: false,
      integrationHealthAlert: false,
      securityAlertDigest: false,
    },
    learning: { enabled: true, minConfidence: 0.7 },
  });

  // Collaborative editing — active when an existing personality is open for editing
  const collabDocId = editing && editing !== 'new' ? `personality:${editing}` : null;
  const {
    text: collabSystemPrompt,
    onTextChange: onCollabSystemPromptChange,
    presenceUsers: systemPromptPresence,
  } = useCollabEditor(collabDocId, 'systemPrompt', form.systemPrompt);

  const { data: personalitiesData, isLoading } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const { data: preview } = useQuery({
    queryKey: ['promptPreview', previewId],
    queryFn: () => fetchPromptPreview(previewId!),
    enabled: !!previewId,
  });

  const { data: modelData } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: fetchModelInfo,
  });

  const personalities = personalitiesData?.personalities ?? [];

  const createMut = useMutation({
    mutationFn: (data: PersonalityCreate) => createPersonality(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      setEditing(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PersonalityCreate> }) =>
      updatePersonality(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      if (setActiveOnSave && variables.id) {
        activateMut.mutate(variables.id);
      }
      setEditing(null);
      setSetActiveOnSave(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => {
      setActivatingId(id);
      setActivateError(null);
      return activatePersonality(id);
    },
    onSuccess: () => {
      setActivatingId(null);
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['promptPreview'] });
    },
    onError: (err: Error) => {
      setActivatingId(null);
      setActivateError(err.message || 'Failed to activate personality');
    },
  });

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      const pName = searchParams.get('name') || '';
      const pDescription = searchParams.get('description') || '';
      const pModel = searchParams.get('model') || '';
      setForm((prev) => ({
        ...prev,
        name: pName,
        description: pDescription,
        defaultModel: pModel || null,
      }));
      setEditing('new');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const startEdit = (p: Personality) => {
    const body = p.body ?? {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
      },
    };
    setForm({
      name: p.name,
      description: p.description,
      systemPrompt: p.systemPrompt,
      traits: p.traits,
      sex: p.sex,
      voice: p.voice,
      preferredLanguage: p.preferredLanguage,
      defaultModel: p.defaultModel,
      modelFallbacks: p.modelFallbacks ?? [],
      includeArchetypes: p.includeArchetypes,
      body,
    });
    setCreationConfig({
      skills: body.creationConfig?.skills ?? false,
      tasks: body.creationConfig?.tasks ?? false,
      personalities: body.creationConfig?.personalities ?? false,
      subAgents: body.creationConfig?.subAgents ?? false,
      customRoles: body.creationConfig?.customRoles ?? false,
      roleAssignments: body.creationConfig?.roleAssignments ?? false,
      experiments: body.creationConfig?.experiments ?? false,
      allowA2A: body.creationConfig?.allowA2A ?? false,
      allowSwarms: body.creationConfig?.allowSwarms ?? false,
      allowDynamicTools: p.body?.creationConfig?.allowDynamicTools ?? false,
    });
    setAllowConnections(body.enabled ?? false);
    setSelectedServers(body.selectedServers ?? []);
    setSelectedIntegrations(body.selectedIntegrations ?? []);
    const caps = body.capabilities ?? [];
    setEnabledCaps({
      vision: caps.includes('vision'),
      limb_movement: caps.includes('limb_movement'),
      auditory: caps.includes('auditory'),
      haptic: caps.includes('haptic'),
      vocalization: caps.includes('vocalization'),
    });
    setMcpFeatures({
      exposeGit: body.mcpFeatures?.exposeGit ?? false,
      exposeFilesystem: body.mcpFeatures?.exposeFilesystem ?? false,
      exposeWeb: body.mcpFeatures?.exposeWeb ?? false,
      exposeWebScraping: body.mcpFeatures?.exposeWebScraping ?? false,
      exposeWebSearch: body.mcpFeatures?.exposeWebSearch ?? false,
      exposeBrowser: body.mcpFeatures?.exposeBrowser ?? false,
    });
    setProactiveConfig({
      enabled: body.proactiveConfig?.enabled ?? false,
      approvalMode: body.proactiveConfig?.approvalMode ?? 'suggest',
      builtins: {
        dailyStandup: body.proactiveConfig?.builtins?.dailyStandup ?? false,
        weeklySummary: body.proactiveConfig?.builtins?.weeklySummary ?? false,
        contextualFollowup: body.proactiveConfig?.builtins?.contextualFollowup ?? false,
        integrationHealthAlert: body.proactiveConfig?.builtins?.integrationHealthAlert ?? false,
        securityAlertDigest: body.proactiveConfig?.builtins?.securityAlertDigest ?? false,
      },
      learning: {
        enabled: body.proactiveConfig?.learning?.enabled ?? true,
        minConfidence: body.proactiveConfig?.learning?.minConfidence ?? 0.7,
      },
    });
    setSetActiveOnSave(false);
    setEditing(p.id);
  };

  const startCreate = () => {
    const body = {
      enabled: false,
      capabilities: [],
      heartEnabled: true,
      creationConfig: {
        skills: false,
        tasks: false,
        personalities: false,
        subAgents: false,
        customRoles: false,
        roleAssignments: false,
        experiments: false,
      },
    };
    setForm({
      name: '',
      description: '',
      systemPrompt: '',
      traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
      sex: 'unspecified',
      voice: '',
      preferredLanguage: '',
      defaultModel: null,
      modelFallbacks: [],
      includeArchetypes: false,
      body,
    });
    setCreationConfig({
      skills: false,
      tasks: false,
      personalities: false,
      subAgents: false,
      customRoles: false,
      roleAssignments: false,
      experiments: false,
      allowA2A: false,
      allowSwarms: false,
      allowDynamicTools: false,
    });
    setAllowConnections(false);
    setSelectedServers([]);
    setEnabledCaps({
      vision: false,
      limb_movement: false,
      auditory: false,
      haptic: false,
      vocalization: false,
    });
    setMcpFeatures({
      exposeGit: false,
      exposeFilesystem: false,
      exposeWeb: false,
      exposeWebScraping: false,
      exposeWebSearch: false,
      exposeBrowser: false,
    });
    setProactiveConfig({
      enabled: false,
      approvalMode: 'suggest',
      builtins: {
        dailyStandup: false,
        weeklySummary: false,
        contextualFollowup: false,
        integrationHealthAlert: false,
        securityAlertDigest: false,
      },
      learning: { enabled: true, minConfidence: 0.7 },
    });
    setSetActiveOnSave(false);
    setEditing('new');
  };

  const handleSave = () => {
    const capabilities = Object.entries(enabledCaps)
      .filter(([, enabled]) => enabled)
      .map(([cap]) => cap);
    const formWithBody = {
      ...form,
      body: {
        ...form.body,
        enabled: allowConnections,
        capabilities,
        heartEnabled: true,
        creationConfig,
        selectedServers,
        selectedIntegrations,
        mcpFeatures,
        proactiveConfig,
      },
    };
    if (editing === 'new') {
      createMut.mutate(formWithBody);
    } else if (editing) {
      updateMut.mutate({ id: editing, data: formWithBody });
    }
  };

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  const editingPersonality =
    editing && editing !== 'new' ? personalities.find((p) => p.id === editing) : null;
  const showActivateToggle =
    editing !== 'new' && editingPersonality && !editingPersonality.isActive;

  return (
    <div className="space-y-6">
      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Personality"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Personalities</h2>
        <button
          onClick={startCreate}
          className="btn btn-primary flex items-center justify-center gap-1 text-sm sm:text-base"
        >
          <Plus className="w-4 h-4" /> <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New Personality</span>
        </button>
      </div>

      {activateError && (
        <div className="card p-3 border-destructive bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>{activateError}</span>
          <button
            onClick={() => {
              setActivateError(null);
            }}
            className="btn-ghost p-1"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {/* Editor Form */}
      {editing && (
        <div className="card p-4 space-y-4 border-primary">
          <h3 className="font-medium">
            {editing === 'new' ? 'Create Personality' : 'Edit Personality'}
          </h3>

          {/* Soul Section */}
          <CollapsibleSection title="Soul — Identity" defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sex</label>
                <select
                  value={form.sex}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, sex: e.target.value as PersonalityCreate['sex'] }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {SEX_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => {
                  setForm((f) => ({ ...f, description: e.target.value }));
                }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                maxLength={1000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">System Prompt</label>
              <PresenceBanner users={systemPromptPresence} />
              <textarea
                value={collabDocId ? collabSystemPrompt : form.systemPrompt}
                onChange={(e) => {
                  const val = e.target.value;
                  if (collabDocId) {
                    onCollabSystemPromptChange(val);
                    setForm((f) => ({ ...f, systemPrompt: val }));
                  } else {
                    setForm((f) => ({ ...f, systemPrompt: val }));
                  }
                }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                rows={4}
                maxLength={8000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(
                  (collabDocId ? collabSystemPrompt : form.systemPrompt)?.length ?? 0
                ).toLocaleString()}{' '}
                / 8,000 chars
              </p>
            </div>

            <label className="flex flex-col gap-1 cursor-pointer" data-testid="archetype-toggle">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeArchetypes ?? false}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, includeArchetypes: e.target.checked }));
                  }}
                  className="rounded border-muted-foreground"
                />
                <span className="text-sm">Include Sacred Archetypes</span>
              </div>
              <span className="text-xs text-muted-foreground ml-6">
                Preamble is presented in prompt
              </span>
            </label>

            <div>
              <label className="block text-sm font-medium mb-2">Traits</label>
              <div className="space-y-2">
                {Object.entries(TRAIT_OPTIONS).map(([trait, options]) => (
                  <div
                    key={trait}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                  >
                    <span className="text-xs text-muted-foreground sm:w-20 capitalize">
                      {trait}
                    </span>
                    <div className="flex gap-1 flex-wrap">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setForm((f) => ({ ...f, traits: { ...f.traits, [trait]: opt } }));
                          }}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            form.traits?.[trait] === opt
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Voice</label>
                <input
                  type="text"
                  value={form.voice}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, voice: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., warm, professional"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Preferred Language</label>
                <input
                  type="text"
                  value={form.preferredLanguage}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, preferredLanguage: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., English"
                  maxLength={100}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Default Model</label>
              <select
                value={
                  form.defaultModel
                    ? `${form.defaultModel.provider}/${form.defaultModel.model}`
                    : ''
                }
                onChange={(e) => {
                  if (!e.target.value) {
                    setForm((f) => ({ ...f, defaultModel: null }));
                  } else {
                    const [provider, ...rest] = e.target.value.split('/');
                    setForm((f) => ({ ...f, defaultModel: { provider, model: rest.join('/') } }));
                  }
                }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Use system default</option>
                {modelData?.available &&
                  Object.entries(modelData.available).map(([provider, models]) =>
                    models.map((m) => (
                      <option key={`${provider}/${m.model}`} value={`${provider}/${m.model}`}>
                        {provider}/{m.model}
                      </option>
                    ))
                  )}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Model to use when chatting with this personality. Can be overridden per-session.
              </p>
            </div>

            {/* ── Model Fallbacks ─────────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium mb-1">Model Fallbacks</label>
              <p className="text-xs text-muted-foreground mb-2">
                Ordered list of fallback models (max 5). Tried in order if the primary model fails
                due to rate limits or unavailability.
              </p>

              {/* Current fallbacks list */}
              {(form.modelFallbacks ?? []).length > 0 && (
                <div className="space-y-1 mb-2" data-testid="fallback-list">
                  {(form.modelFallbacks ?? []).map((fb, idx) => (
                    <div
                      key={`${fb.provider}/${fb.model}-${String(idx)}`}
                      className="flex items-center gap-2 text-sm bg-muted/40 px-2 py-1 rounded"
                    >
                      <span className="text-muted-foreground text-xs w-4">{idx + 1}.</span>
                      <span className="flex-1 font-mono text-xs">
                        {fb.provider}/{fb.model}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            modelFallbacks: (f.modelFallbacks ?? []).filter((_, i) => i !== idx),
                          }));
                        }}
                        className="text-muted-foreground hover:text-destructive text-xs px-1"
                        aria-label="Remove fallback"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add fallback dropdown */}
              {(form.modelFallbacks ?? []).length < 5 && (
                <div className="flex gap-2">
                  <select
                    value={pendingFallback}
                    onChange={(e) => {
                      setPendingFallback(e.target.value);
                    }}
                    className="flex-1 px-3 py-2 rounded border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="fallback-add-select"
                  >
                    <option value="">Add fallback model…</option>
                    {modelData?.available &&
                      Object.entries(modelData.available).flatMap(([provider, models]) =>
                        models
                          .filter((m) => {
                            const key = `${provider}/${m.model}`;
                            const isDefault = form.defaultModel
                              ? `${form.defaultModel.provider}/${form.defaultModel.model}` === key
                              : false;
                            const alreadyAdded = (form.modelFallbacks ?? []).some(
                              (fb) => `${fb.provider}/${fb.model}` === key
                            );
                            return !isDefault && !alreadyAdded;
                          })
                          .map((m) => (
                            <option key={`${provider}/${m.model}`} value={`${provider}/${m.model}`}>
                              {provider}/{m.model}
                            </option>
                          ))
                      )}
                  </select>
                  <button
                    type="button"
                    disabled={!pendingFallback}
                    onClick={() => {
                      if (!pendingFallback) return;
                      const [provider, ...rest] = pendingFallback.split('/');
                      setForm((f) => ({
                        ...f,
                        modelFallbacks: [
                          ...(f.modelFallbacks ?? []),
                          { provider: provider, model: rest.join('/') },
                        ],
                      }));
                      setPendingFallback('');
                    }}
                    className="px-3 py-2 rounded border bg-primary text-primary-foreground text-sm disabled:opacity-40"
                    data-testid="fallback-add-btn"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Spirit Section */}
          <SpiritSection />

          {/* Brain Section */}
          <BrainSection personalityId={editing !== 'new' ? editing : null} />

          {/* Body Section */}
          <BodySection
            allowConnections={allowConnections}
            onAllowConnectionsChange={setAllowConnections}
            selectedServers={selectedServers}
            onSelectedServersChange={setSelectedServers}
            selectedIntegrations={selectedIntegrations}
            onSelectedIntegrationsChange={setSelectedIntegrations}
            enabledCaps={enabledCaps}
            onEnabledCapsChange={setEnabledCaps}
            mcpFeatures={mcpFeatures}
            onMcpFeaturesChange={setMcpFeatures}
            creationConfig={creationConfig}
            onCreationConfigChange={setCreationConfig}
            proactiveConfig={proactiveConfig}
            onProactiveConfigChange={setProactiveConfig}
          />

          {/* Heart Section */}
          <HeartSection />

          {showActivateToggle && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={setActiveOnSave}
                onChange={(e) => {
                  setSetActiveOnSave(e.target.checked);
                }}
                className="rounded border-muted-foreground"
              />
              <span className="text-sm">Set as active personality on save</span>
            </label>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setEditing(null);
              }}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name?.trim() || createMut.isPending || updateMut.isPending}
              className="btn btn-primary"
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Personality List */}
      <div
        className={editing ? 'space-y-3' : 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3'}
      >
        {personalities.map((p) => (
          <div key={p.id}>
            <div
              className={`card p-3 sm:p-4 ${p.isActive ? 'border-primary ring-1 ring-primary/20' : ''} hover:shadow-md transition-shadow`}
            >
              <div className="flex flex-col gap-2">
                {/* Header with name and actions */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${p.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                    >
                      <User className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-medium text-sm sm:text-base truncate">{p.name}</h3>
                        {p.isActive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        {formatDate(p.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Actions - always visible */}
                  <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                    {p.isActive ? (
                      <span className="p-1.5 sm:p-2 text-success" title="Active personality">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          activateMut.mutate(p.id);
                        }}
                        disabled={activatingId === p.id}
                        className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-success rounded-lg"
                        title={`Activate ${p.name}`}
                        aria-label={`Activate personality ${p.name}`}
                      >
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        startEdit(p);
                      }}
                      className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-foreground rounded-lg"
                      title={`Edit ${p.name}`}
                      aria-label={`Edit personality ${p.name}`}
                    >
                      <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setDeleteTarget(p);
                      }}
                      disabled={p.isActive || deleteMut.isPending}
                      className="btn-ghost p-1.5 sm:p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg"
                      title={
                        p.isActive
                          ? 'Switch to another personality before deleting'
                          : `Delete ${p.name}`
                      }
                      aria-label={
                        p.isActive
                          ? 'Cannot delete active personality — switch first'
                          : `Delete personality ${p.name}`
                      }
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                {p.description && (
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>
                )}

                {/* Tags row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Object.entries(p.traits)
                    .slice(0, 2)
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full"
                      >
                        {k}: {v}
                      </span>
                    ))}
                  {Object.keys(p.traits).length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{Object.keys(p.traits).length - 2}
                    </span>
                  )}
                  {p.sex !== 'unspecified' && (
                    <span className="text-[10px] sm:text-xs bg-muted px-2 py-0.5 rounded-full capitalize">
                      {p.sex}
                    </span>
                  )}
                  {p.defaultModel && (
                    <span className="text-[10px] sm:text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground ml-auto">
                      {p.defaultModel.provider}
                    </span>
                  )}
                </div>

                {/* Mobile-only created date */}
                <p className="text-[10px] text-muted-foreground sm:hidden">
                  Created {formatDate(p.createdAt)}
                </p>

                {/* Preview button */}
                <button
                  onClick={() => {
                    setPreviewId(previewId === p.id ? null : p.id);
                  }}
                  className={`text-xs flex items-center justify-center gap-1 py-1.5 px-2 rounded border transition-colors ${
                    previewId === p.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  {previewId === p.id ? 'Hide Preview' : 'Preview Prompt'}
                </button>
              </div>
            </div>

            {/* Per-personality Prompt Preview */}
            {previewId === p.id && preview && (
              <div className="card p-3 sm:p-4 mt-2 border-muted bg-muted/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <h3 className="font-medium text-sm">System Prompt Preview</h3>
                  <div className="flex gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{preview.charCount.toLocaleString()} chars</span>
                    <span>~{preview.estimatedTokens.toLocaleString()} tokens</span>
                    {preview.tools.length > 0 && <span>{preview.tools.length} tools</span>}
                  </div>
                </div>
                <pre className="text-[10px] sm:text-xs bg-background p-2 sm:p-3 rounded border overflow-auto max-h-40 sm:max-h-64 whitespace-pre-wrap font-mono">
                  {preview.prompt}
                </pre>
              </div>
            )}
          </div>
        ))}

        {!isLoading && personalities.length === 0 && (
          <div className="col-span-full">
            <div className="text-center py-12 px-4 bg-muted/30 rounded-lg border border-dashed">
              <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-2">No personalities yet</p>
              <p className="text-sm text-muted-foreground/70">
                Create your first personality to get started
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
