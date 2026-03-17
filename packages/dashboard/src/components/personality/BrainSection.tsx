/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Trash2,
  Edit2,
  Save,
  Search,
  Clock,
  RefreshCw,
  Globe,
  Target,
  Lock,
  ExternalLink,
  BookOpen,
  Wrench,
} from 'lucide-react';
import {
  fetchKnowledge,
  learnKnowledge,
  updateKnowledge,
  deleteKnowledge,
  fetchExternalSyncStatus,
  fetchExternalBrainConfig,
  updateExternalBrainConfig,
  triggerExternalSync,
  fetchSkills,
} from '../../api/client';
import type { KnowledgeEntry, Skill } from '../../types';
import { CollapsibleSection, relativeTime } from './shared';
import { sanitizeText } from '../../utils/sanitize';
import { ConfirmDialog } from '../common/ConfirmDialog';

export type ModelDataType = { available?: Record<string, { model: string }[]> } | undefined;

export const PRIMARY_TOPICS = ['self-identity', 'hierarchy', 'purpose', 'interaction'];

export function getAnalyticalDepth(cfg: { enabled: boolean; budgetTokens: number }): string {
  if (!cfg.enabled) return 'off';
  if (cfg.budgetTokens <= 8192) return 'focused';
  if (cfg.budgetTokens <= 24000) return 'standard';
  if (cfg.budgetTokens <= 48000) return 'deep';
  return 'maximum';
}

export function setAnalyticalDepth(
  level: string,
  onChange: (cfg: { enabled: boolean; budgetTokens: number }) => void
) {
  const map: Record<string, { enabled: boolean; budgetTokens: number }> = {
    off: { enabled: false, budgetTokens: 4096 },
    focused: { enabled: true, budgetTokens: 4096 },
    standard: { enabled: true, budgetTokens: 16000 },
    deep: { enabled: true, budgetTokens: 32000 },
    maximum: { enabled: true, budgetTokens: 64000 },
  };
  onChange(map[level] ?? map.off);
}

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama (Local)',
  opencode: 'OpenCode (Zen)',
  lmstudio: 'LM Studio (Local)',
  localai: 'LocalAI (Local)',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
};

export function BrainSection({
  personalityId,
  activeHours,
  onActiveHoursChange,
  thinkingConfig,
  onThinkingConfigChange,
  reasoningConfig,
  onReasoningConfigChange,
  contextOverflowStrategy,
  onContextOverflowStrategyChange,
  costBudget,
  onCostBudgetChange,
  maxPromptTokens,
  onMaxPromptTokensChange,
  globalMaxPromptTokens,
  exposeOrgIntentTools,
  onExposeOrgIntentToolsChange,
  orgIntentMcpEnabled,
  orgKnowledgeBase,
  onOrgKnowledgeBaseChange,
  orgEnabled,
  omnipresentMind,
  onOmnipresentMindChange,
  strictSystemPromptConfidentiality,
  onStrictSystemPromptConfidentialityChange,
  knowledgeMode,
  onKnowledgeModeChange,
  notebookTokenBudget,
  onNotebookTokenBudgetChange,
  injectDateTime,
  onInjectDateTimeChange,
  defaultModel,
  onDefaultModelChange,
  modelFallbacks,
  onModelFallbacksChange,
  proactiveConfig,
  onProactiveConfigChange,
  communityEnabled,
  modelData,
}: {
  personalityId: string | null;
  activeHours: {
    enabled: boolean;
    start: string;
    end: string;
    daysOfWeek: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    timezone: string;
  };
  onActiveHoursChange: (config: {
    enabled: boolean;
    start: string;
    end: string;
    daysOfWeek: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    timezone: string;
  }) => void;
  thinkingConfig: { enabled: boolean; budgetTokens: number };
  onThinkingConfigChange: (config: { enabled: boolean; budgetTokens: number }) => void;
  reasoningConfig: { enabled: boolean; effort: 'low' | 'medium' | 'high' };
  onReasoningConfigChange: (config: {
    enabled: boolean;
    effort: 'low' | 'medium' | 'high';
  }) => void;
  contextOverflowStrategy: 'summarise' | 'truncate' | 'error';
  onContextOverflowStrategyChange: (v: 'summarise' | 'truncate' | 'error') => void;
  costBudget: { dailyUsd?: number; monthlyUsd?: number };
  onCostBudgetChange: (v: { dailyUsd?: number; monthlyUsd?: number }) => void;
  maxPromptTokens: number | null;
  onMaxPromptTokensChange: (value: number | null) => void;
  globalMaxPromptTokens: number;
  exposeOrgIntentTools: boolean;
  onExposeOrgIntentToolsChange: (v: boolean) => void;
  orgIntentMcpEnabled: boolean;
  orgKnowledgeBase: boolean;
  onOrgKnowledgeBaseChange: (v: boolean) => void;
  orgEnabled: boolean;
  omnipresentMind: boolean;
  onOmnipresentMindChange: (v: boolean) => void;
  strictSystemPromptConfidentiality: boolean;
  onStrictSystemPromptConfidentialityChange: (v: boolean | undefined) => void;
  knowledgeMode: 'rag' | 'notebook' | 'hybrid';
  onKnowledgeModeChange: (v: 'rag' | 'notebook' | 'hybrid') => void;
  notebookTokenBudget: number | null;
  onNotebookTokenBudgetChange: (v: number | null) => void;
  injectDateTime: boolean;
  onInjectDateTimeChange: (v: boolean) => void;
  proactiveConfig: {
    enabled: boolean;
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    builtinModes: {
      dailyStandup: 'auto' | 'suggest' | 'manual';
      weeklySummary: 'auto' | 'suggest' | 'manual';
      contextualFollowup: 'auto' | 'suggest' | 'manual';
      integrationHealthAlert: 'auto' | 'suggest' | 'manual';
      securityAlertDigest: 'auto' | 'suggest' | 'manual';
    };
    learning: { enabled: boolean; minConfidence: number };
  };
  onProactiveConfigChange: (config: {
    enabled: boolean;
    builtins: {
      dailyStandup: boolean;
      weeklySummary: boolean;
      contextualFollowup: boolean;
      integrationHealthAlert: boolean;
      securityAlertDigest: boolean;
    };
    builtinModes: {
      dailyStandup: 'auto' | 'suggest' | 'manual';
      weeklySummary: 'auto' | 'suggest' | 'manual';
      contextualFollowup: 'auto' | 'suggest' | 'manual';
      integrationHealthAlert: 'auto' | 'suggest' | 'manual';
      securityAlertDigest: 'auto' | 'suggest' | 'manual';
    };
    learning: { enabled: boolean; minConfidence: number };
  }) => void;
  communityEnabled: boolean;
  defaultModel: { provider: string; model: string } | null;
  onDefaultModelChange: (v: { provider: string; model: string } | null) => void;
  modelFallbacks: { provider: string; model: string }[];
  onModelFallbacksChange: (v: { provider: string; model: string }[]) => void;
  modelData: ModelDataType;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pendingFallback, setPendingFallback] = useState('');
  const [teachTopic, setTeachTopic] = useState('');
  const [teachContent, setTeachContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editConfidence, setEditConfidence] = useState(0.5);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeEntry | null>(null);

  const { data: knowledgeData } = useQuery({
    queryKey: ['knowledge', personalityId],
    queryFn: () => fetchKnowledge({ personalityId }),
    enabled: !!personalityId,
  });
  const knowledge = knowledgeData?.knowledge ?? [];

  const { data: allSkillsData } = useQuery({ queryKey: ['skills'], queryFn: () => fetchSkills() });
  const personalitySkills = (allSkillsData?.skills ?? []).filter(
    (s: Skill) => s.personalityId === personalityId
  );

  const { data: syncStatus } = useQuery({
    queryKey: ['externalSync'],
    queryFn: fetchExternalSyncStatus,
  });

  const { data: brainConfig, refetch: _refetchBrainConfig } = useQuery({
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
      void queryClient.invalidateQueries({ queryKey: ['knowledge', personalityId] });
      setTeachTopic('');
      setTeachContent('');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { content?: string; confidence?: number } }) =>
      updateKnowledge(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge', personalityId] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteKnowledge(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['knowledge', personalityId] }),
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
      <CollapsibleSection title="Thinking" defaultOpen={true}>
        {/* Omnipresent Mind toggle — always first */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-sm font-medium">Omnipresent Mind</p>
              <p className="text-xs text-muted-foreground">
                When enabled, this personality accesses the shared memory pool across all agents.
                Disable to keep memories and knowledge private to this personality.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={omnipresentMind}
              onChange={(e) => {
                onOmnipresentMindChange(e.target.checked);
              }}
              aria-label="Omnipresent Mind"
              className="sr-only peer"
            />
            <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* Organizational Knowledge Base toggle — only when org is enabled */}
        {orgEnabled && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium">Organizational Knowledge Base</span>
                <span className="text-xs text-muted-foreground">
                  Allow this personality to query and retrieve organization knowledge base content
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={orgKnowledgeBase}
                onChange={(e) => {
                  onOrgKnowledgeBaseChange(e.target.checked);
                }}
                aria-label="Organizational Knowledge Base"
                className="sr-only peer"
              />
              <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>
        )}

        {/* Organizational Intent Signal — only when org is enabled */}
        {orgEnabled &&
          (orgIntentMcpEnabled ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <Target className="w-4 h-4 text-primary shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium">Organizational Intent</span>
                  <span className="text-xs text-muted-foreground">
                    Allow this personality to read live org intent signals
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={exposeOrgIntentTools}
                  onChange={(e) => {
                    onExposeOrgIntentToolsChange(e.target.checked);
                  }}
                  aria-label="Organizational Intent Signal"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Organizational Intent — Not Enabled
                </span>
                <span className="text-xs text-muted-foreground">
                  Intent must be active in Security → Organization before assigning org intent
                  access to a personality.
                </span>
                <button
                  type="button"
                  onClick={() => void navigate('/security-settings')}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline self-start"
                >
                  <ExternalLink className="w-3 h-3" />
                  Security → Organization → Intent
                </button>
              </div>
            </div>
          ))}

        {/* System Prompt Confidentiality override */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-sm font-medium">System Prompt Confidentiality</p>
              <p className="text-xs text-muted-foreground">
                Override global setting: scan responses for system prompt content leaks. Falls back
                to the global Security setting when unchecked.
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={strictSystemPromptConfidentiality}
              onChange={(e) => {
                onStrictSystemPromptConfidentialityChange(e.target.checked ? true : undefined);
              }}
              aria-label="System Prompt Confidentiality"
              className="sr-only peer"
            />
            <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* Knowledge Retrieval Mode */}
        <div className="p-3 rounded-lg border border-border space-y-2">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Knowledge Retrieval Mode</p>
              <p className="text-xs text-muted-foreground">
                How the AI reads your document library when answering questions.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {(['rag', 'notebook', 'hybrid'] as const).map((mode) => {
              const labels: Record<string, string> = {
                rag: 'RAG',
                notebook: 'Notebook',
                hybrid: 'Hybrid',
              };
              const descs: Record<string, string> = {
                rag: 'Top-K semantic search (fast)',
                notebook: 'Full corpus in-context (NotebookLM style)',
                hybrid: 'Notebook first, RAG fallback',
              };
              return (
                <button
                  key={mode}
                  onClick={() => {
                    onKnowledgeModeChange(mode);
                  }}
                  title={descs[mode]}
                  className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors text-center ${
                    knowledgeMode === mode
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground italic">
            {knowledgeMode === 'rag' &&
              'Retrieves the most relevant snippets. Works at any corpus size.'}
            {knowledgeMode === 'notebook' &&
              'Loads all documents into the context window. Requires a large-context model (Claude ≥200K, Gemini ≥1M recommended).'}
            {knowledgeMode === 'hybrid' &&
              'Loads the full corpus when it fits in 65% of the context window, otherwise falls back to RAG automatically.'}
          </p>
          {(knowledgeMode === 'notebook' || knowledgeMode === 'hybrid') && (
            <div className="space-y-1 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Override token budget</span>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notebookTokenBudget !== null}
                    onChange={(e) => {
                      onNotebookTokenBudgetChange(e.target.checked ? 50000 : null);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>
              {notebookTokenBudget !== null && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground block">
                    Budget: {notebookTokenBudget.toLocaleString()} tokens
                  </label>
                  <input
                    type="range"
                    min={10000}
                    max={900000}
                    step={10000}
                    value={notebookTokenBudget}
                    onChange={(e) => {
                      onNotebookTokenBudgetChange(Number(e.target.value));
                    }}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chronoception */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-sm font-medium">Chronoception</p>
              <p className="text-xs text-muted-foreground">
                Injects the current date and time into the system prompt so the personality always
                knows when it is
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={injectDateTime}
              onChange={(e) => {
                onInjectDateTimeChange(e.target.checked);
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* Default Model */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Default Model</label>
            <select
              value={defaultModel ? `${defaultModel.provider}/${defaultModel.model}` : ''}
              onChange={(e) => {
                if (!e.target.value) {
                  onDefaultModelChange(null);
                } else {
                  const [provider, ...rest] = e.target.value.split('/');
                  onDefaultModelChange({ provider, model: rest.join('/') });
                }
              }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Use system default</option>
              {modelData?.available &&
                Object.entries(modelData.available).map(([provider, models]) => (
                  <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                    {models.map((m) => (
                      <option key={`${provider}/${m.model}`} value={`${provider}/${m.model}`}>
                        {m.model}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Model to use when chatting with this personality. Can be overridden per-session.
            </p>
          </div>

          {/* Model Fallbacks */}
          <div>
            <label className="block text-sm font-medium mb-1">Model Fallbacks</label>
            <p className="text-xs text-muted-foreground mb-2">
              Ordered list of fallback models (max 5). Tried in order if the primary model fails due
              to rate limits or unavailability.
            </p>
            {modelFallbacks.length > 0 && (
              <div className="space-y-1 mb-2" data-testid="fallback-list">
                {modelFallbacks.map((fb, idx) => (
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
                        onModelFallbacksChange(modelFallbacks.filter((_, i) => i !== idx));
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
            {modelFallbacks.length < 5 && (
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
                    Object.entries(modelData.available).map(([provider, models]) => {
                      const filtered = models.filter((m) => {
                        const key = `${provider}/${m.model}`;
                        const isDefault = defaultModel
                          ? `${defaultModel.provider}/${defaultModel.model}` === key
                          : false;
                        const alreadyAdded = modelFallbacks.some(
                          (fb) => `${fb.provider}/${fb.model}` === key
                        );
                        return !isDefault && !alreadyAdded;
                      });
                      if (filtered.length === 0) return null;
                      return (
                        <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                          {filtered.map((m) => (
                            <option key={`${provider}/${m.model}`} value={`${provider}/${m.model}`}>
                              {m.model}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                </select>
                <button
                  type="button"
                  disabled={!pendingFallback}
                  onClick={() => {
                    if (!pendingFallback) return;
                    const [provider, ...rest] = pendingFallback.split('/');
                    onModelFallbacksChange([
                      ...modelFallbacks,
                      { provider, model: rest.join('/') },
                    ]);
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

          {/* Analytical Depth */}
          <div>
            <label className="block text-sm font-medium mb-1">Analytical Depth</label>
            <p className="text-xs text-muted-foreground mb-2">
              Controls the reasoning effort budget. Higher depth = more thorough thinking but more
              tokens consumed. Anthropic models only.
            </p>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  { value: 'off', label: 'Off', desc: 'No extended thinking' },
                  { value: 'focused', label: 'Focused', desc: '~4k tokens' },
                  { value: 'standard', label: 'Standard', desc: '~16k tokens' },
                  { value: 'deep', label: 'Deep', desc: '~32k tokens' },
                  { value: 'maximum', label: 'Maximum', desc: '64k tokens' },
                ] as const
              ).map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  title={desc}
                  onClick={() => {
                    setAnalyticalDepth(value, onThinkingConfigChange);
                  }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    getAnalyticalDepth(thinkingConfig) === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Extended Thinking — raw token budget for power users */}
        <CollapsibleSection title="Extended Thinking" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Fine-grained token budget control. Analytical Depth above is the simplified version;
              use this for exact budget values. Anthropic models only.
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Enable extended thinking</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={thinkingConfig.enabled}
                  onChange={(e) => {
                    onThinkingConfigChange({ ...thinkingConfig, enabled: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            {thinkingConfig.enabled && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground block">
                  Token budget: {thinkingConfig.budgetTokens.toLocaleString()} tokens
                </label>
                <input
                  type="range"
                  min={1024}
                  max={64000}
                  step={256}
                  value={thinkingConfig.budgetTokens}
                  onChange={(e) => {
                    onThinkingConfigChange({
                      ...thinkingConfig,
                      budgetTokens: Number(e.target.value),
                    });
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1,024</span>
                  <span>64,000</span>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Reasoning Effort" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Controls OpenAI reasoning effort for o-series models (o1, o3). Higher effort uses more
              tokens but produces more thorough reasoning.
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Enable reasoning effort</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={reasoningConfig.enabled}
                  onChange={(e) => {
                    onReasoningConfigChange({ ...reasoningConfig, enabled: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            {reasoningConfig.enabled && (
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      onReasoningConfigChange({ ...reasoningConfig, effort: level });
                    }}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      reasoningConfig.effort === level
                        ? 'bg-primary text-white border-primary'
                        : 'bg-background border-border hover:bg-muted/50'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Context Overflow" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Strategy when conversation exceeds the model&apos;s context window.
            </p>
            <div className="flex gap-2">
              {[
                { value: 'summarise' as const, label: 'Summarise', desc: 'Compact older messages' },
                { value: 'truncate' as const, label: 'Truncate', desc: 'Drop oldest messages' },
                { value: 'error' as const, label: 'Error', desc: 'Reject the request' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onContextOverflowStrategyChange(opt.value);
                  }}
                  title={opt.desc}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    contextOverflowStrategy === opt.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-background border-border hover:bg-muted/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Cost Budget" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Limit AI spending for this personality. Requests are blocked when the budget is
              exceeded.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Daily limit (USD)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costBudget.dailyUsd ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined;
                    onCostBudgetChange({ ...costBudget, dailyUsd: v && v > 0 ? v : undefined });
                  }}
                  placeholder="No limit"
                  className="w-full px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Monthly limit (USD)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={costBudget.monthlyUsd ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined;
                    onCostBudgetChange({ ...costBudget, monthlyUsd: v && v > 0 ? v : undefined });
                  }}
                  placeholder="No limit"
                  className="w-full px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Prompt Budget" defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Controls how many tokens are reserved for this soul&apos;s composed system prompt
              (identity, skills, context). Overrides the global server default when set.
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Override global prompt budget</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={maxPromptTokens !== null}
                  onChange={(e) => {
                    onMaxPromptTokensChange(e.target.checked ? globalMaxPromptTokens : null);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-muted-foreground/30 peer-checked:bg-success after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            {maxPromptTokens !== null ? (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground block">
                  Budget: {maxPromptTokens.toLocaleString()} tokens
                </label>
                <input
                  type="range"
                  min={1024}
                  max={100000}
                  step={1024}
                  value={maxPromptTokens}
                  onChange={(e) => {
                    onMaxPromptTokensChange(Number(e.target.value));
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1,024</span>
                  <span>100,000</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Using global default ({globalMaxPromptTokens.toLocaleString()} tokens)
              </p>
            )}
          </div>
        </CollapsibleSection>
      </CollapsibleSection>

      {/* Active Hours */}
      <CollapsibleSection title="Active Hours" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Outside these hours, the personality&apos;s body is at rest — heartbeat checks and
            proactive triggers are suppressed.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Enable active hours</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Enable active hours"
                checked={activeHours.enabled}
                onChange={() => {
                  onActiveHoursChange({ ...activeHours, enabled: !activeHours.enabled });
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
          </div>
          {activeHours.enabled && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">Start (UTC)</label>
                  <input
                    type="time"
                    value={activeHours.start}
                    onChange={(e) => {
                      onActiveHoursChange({ ...activeHours, start: e.target.value });
                    }}
                    className="w-full text-xs rounded border border-border bg-background px-2 py-1"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">End (UTC)</label>
                  <input
                    type="time"
                    value={activeHours.end}
                    onChange={(e) => {
                      onActiveHoursChange({ ...activeHours, end: e.target.value });
                    }}
                    className="w-full text-xs rounded border border-border bg-background px-2 py-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Days of week</label>
                <div className="flex gap-1 flex-wrap">
                  {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => {
                    const isSelected = activeHours.daysOfWeek.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const days = isSelected
                            ? activeHours.daysOfWeek.filter((d) => d !== day)
                            : [...activeHours.daysOfWeek, day];
                          onActiveHoursChange({ ...activeHours, daysOfWeek: days });
                        }}
                        className={`text-xs px-2 py-1 rounded border capitalize transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 border-border hover:bg-muted'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Timezone</label>
                <select
                  value={activeHours.timezone}
                  onChange={(e) => {
                    onActiveHoursChange({ ...activeHours, timezone: e.target.value });
                  }}
                  className="w-full text-xs rounded border border-border bg-background px-2 py-1"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

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
                      className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
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
              className="btn btn-ghost text-xs px-2 py-1"
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
                onClick={() => void navigate('/marketplace')}
                className="text-primary hover:underline"
              >
                Skills Marketplace
              </button>
              {communityEnabled && (
                <>
                  {' '}
                  or{' '}
                  <button
                    onClick={() => void navigate('/skills', { state: { initialTab: 'community' } })}
                    className="text-primary hover:underline"
                  >
                    Community
                  </button>
                </>
              )}{' '}
              tabs, or create a personal skill in the{' '}
              <button
                onClick={() => void navigate('/skills')}
                className="text-primary hover:underline"
              >
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
                  onClick={() => void navigate('/skills', { state: { openSkillId: skill.id } })}
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

      {/* External Brain Sync */}
      <div className="border-b pb-3 mb-1">
        <h4 className="text-sm font-medium mb-2">External Brain Sync</h4>
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
                className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
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
                className="btn btn-ghost text-xs px-3 py-1"
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
              className="btn btn-ghost text-xs px-3 py-1"
            >
              Configure External Sync
            </button>
          </div>
        )}
      </div>

      {/* Proactive Assistance */}
      <CollapsibleSection title="Proactive Assistance" defaultOpen={false}>
        {(() => {
          const proactiveBlockedByPolicy = false; // Policy check handled at API level
          return (
            <div className="space-y-4">
              <div
                className={`text-sm px-3 py-2 rounded flex items-center justify-between border ${
                  proactiveBlockedByPolicy
                    ? 'bg-muted/30 border-border opacity-60'
                    : 'bg-muted/50 border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">Enable Assistance</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proactiveConfig.enabled}
                    onChange={() => {
                      onProactiveConfigChange({
                        ...proactiveConfig,
                        enabled: !proactiveConfig.enabled,
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                  <span className="text-xs ml-2 text-muted-foreground peer-checked:text-success">
                    {proactiveConfig.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              {proactiveConfig.enabled && (
                <>
                  {/* Built-in Triggers — per-item 3-phase approval switch */}
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
                      ].map((item) => {
                        const isOn = proactiveConfig.builtins[item.key];
                        const activeMode = proactiveConfig.builtinModes[item.key];
                        return (
                          <div
                            key={item.key}
                            className="text-sm px-3 py-2 rounded flex items-center justify-between border bg-muted/50 border-border"
                          >
                            <span className="font-medium">{item.label}</span>
                            <div className="flex gap-1">
                              {(['auto', 'suggest', 'manual'] as const).map((mode) => {
                                const isActive = isOn && activeMode === mode;
                                const activeClass = isActive
                                  ? mode === 'auto'
                                    ? 'bg-green-600 text-white border-green-600'
                                    : mode === 'suggest'
                                      ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-muted/50 border-border hover:bg-muted';
                                return (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => {
                                      onProactiveConfigChange({
                                        ...proactiveConfig,
                                        builtins: {
                                          ...proactiveConfig.builtins,
                                          [item.key]: !isActive,
                                        },
                                        builtinModes: {
                                          ...proactiveConfig.builtinModes,
                                          [item.key]: mode,
                                        },
                                      });
                                    }}
                                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${activeClass}`}
                                  >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Learning */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Learning</h4>
                    <div className="space-y-3">
                      <div className="text-sm px-3 py-2 rounded flex items-center justify-between border bg-muted/50 border-border">
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
    </CollapsibleSection>
  );
}
