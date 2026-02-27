import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  Mic,
  Volume2,
  Image,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  Filter,
  Radio,
} from 'lucide-react';
import {
  fetchMultimodalConfig,
  fetchMultimodalJobs,
  fetchSecurityPolicy,
  updateMultimodalProvider,
  updateMultimodalModel,
} from '../api/client';

type JobType = 'vision' | 'stt' | 'tts' | 'image_gen';
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface MultimodalJob {
  id: string;
  type: JobType;
  status: JobStatus;
  platform?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: number;
}

const TYPE_ICONS: Record<JobType, React.ReactNode> = {
  vision: <Eye className="w-4 h-4" />,
  stt: <Mic className="w-4 h-4" />,
  tts: <Volume2 className="w-4 h-4" />,
  image_gen: <Image className="w-4 h-4" />,
};

const TYPE_LABELS: Record<JobType, string> = {
  vision: 'Vision',
  stt: 'Speech-to-Text',
  tts: 'Text-to-Speech',
  image_gen: 'Image Generation',
};

const STATUS_STYLES: Record<JobStatus, { color: string; icon: React.ReactNode }> = {
  pending: { color: 'text-muted-foreground', icon: <Clock className="w-3.5 h-3.5" /> },
  running: { color: 'text-blue-500', icon: <Play className="w-3.5 h-3.5" /> },
  completed: { color: 'text-green-500', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  failed: { color: 'text-destructive', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const PAGE_SIZE = 20;

export function MultimodalPage({ embedded }: { embedded?: boolean } = {}) {
  const [typeFilter, setTypeFilter] = useState<JobType | ''>('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const { data: configData } = useQuery({
    queryKey: ['multimodalConfig'],
    queryFn: fetchMultimodalConfig,
    staleTime: 30000,
  });

  const providerMutation = useMutation({
    mutationFn: ({ type, provider }: { type: 'vision' | 'tts' | 'stt'; provider: string }) =>
      updateMultimodalProvider(type, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['multimodalConfig'] });
    },
  });

  const modelMutation = useMutation({
    mutationFn: ({ type, model }: { type: 'stt' | 'tts'; model: string }) =>
      updateMultimodalModel(type, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['multimodalConfig'] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['multimodalJobs', typeFilter, statusFilter, page],
    queryFn: () =>
      fetchMultimodalJobs({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: 5000,
  });

  const jobs = (data?.jobs ?? []) as unknown as MultimodalJob[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const enabled = securityPolicy?.allowMultimodal ?? false;

  // Stats
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  if (!enabled) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Multimodal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Vision, speech, and image generation job viewer
            </p>
          </div>
        )}
        <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-3 text-sm text-yellow-600 dark:text-yellow-400">
          Multimodal processing is currently disabled. Enable it in Settings &gt; Security Policy.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Multimodal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vision, speech, and image generation job viewer
          </p>
        </div>
      )}

      {/* Provider Configuration */}
      <ProviderCard
        config={configData}
        onSelectProvider={(type, provider) => {
          providerMutation.mutate({ type, provider });
        }}
        onSelectModel={(type, model) => {
          modelMutation.mutate({ type, model });
        }}
        isPending={providerMutation.isPending}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <StatCard label="Total Jobs" value={total} />
        <StatCard label="Completed" value={completedCount} color="text-green-500" />
        <StatCard label="Failed" value={failedCount} color="text-destructive" />
        <StatCard
          label="Success Rate"
          value={
            completedCount + failedCount > 0
              ? `${((completedCount / (completedCount + failedCount)) * 100).toFixed(1)}%`
              : '-'
          }
        />
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-header flex flex-row items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="card-title text-base">Jobs</h2>
        </div>
        <div className="card-content space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as JobType | '');
                setPage(0);
              }}
              className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-40"
            >
              <option value="">All Types</option>
              <option value="vision">Vision</option>
              <option value="stt">Speech-to-Text</option>
              <option value="tts">Text-to-Speech</option>
              <option value="image_gen">Image Generation</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as JobStatus | '');
                setPage(0);
              }}
              className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-40"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No multimodal jobs found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 w-8"></th>
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Platform</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const expanded = expandedId === job.id;
                    const status = STATUS_STYLES[job.status] ?? STATUS_STYLES.pending;
                    return (
                      <React.Fragment key={job.id}>
                        <tr
                          className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => {
                            setExpandedId(expanded ? null : job.id);
                          }}
                        >
                          <td className="py-2 pr-3">
                            {expanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {job.id.length > 8 ? `${job.id.slice(0, 8)}...` : job.id}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="flex items-center gap-1.5">
                              {TYPE_ICONS[job.type]}
                              {TYPE_LABELS[job.type] ?? job.type}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`flex items-center gap-1 ${status.color}`}>
                              {status.icon}
                              {job.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {job.durationMs != null ? `${job.durationMs}ms` : '-'}
                          </td>
                          <td className="py-2 pr-3">{job.platform ?? '-'}</td>
                          <td className="py-2">{new Date(job.createdAt).toLocaleString()}</td>
                        </tr>
                        {expanded && (
                          <tr key={`${job.id}-detail`} className="border-b bg-muted/20">
                            <td colSpan={7} className="py-3 px-4">
                              <div className="space-y-2 text-xs">
                                {job.error && (
                                  <div>
                                    <span className="font-medium text-destructive">Error: </span>
                                    {job.error}
                                  </div>
                                )}
                                {job.input && (
                                  <div>
                                    <span className="font-medium">Input: </span>
                                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                                      {JSON.stringify(job.input, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {job.output && (
                                  <div>
                                    <span className="font-medium">Output: </span>
                                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                                      {JSON.stringify(job.output, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-1">
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={page === 0}
                  onClick={() => {
                    setPage((p) => Math.max(0, p - 1));
                  }}
                >
                  Previous
                </button>
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={page >= totalPages - 1}
                  onClick={() => {
                    setPage((p) => p + 1);
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Fallback labels for providers not in server metadata
const PROVIDER_LABEL_FALLBACK: Record<string, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  voicebox: 'Voicebox (local)',
  elevenlabs: 'ElevenLabs',
  deepgram: 'Deepgram',
  cartesia: 'Cartesia',
  google: 'Google Cloud',
  azure: 'Azure AI Speech',
  playht: 'Play.ht',
  openedai: 'OpenedAI Speech (local)',
  kokoro: 'Kokoro (local)',
  assemblyai: 'AssemblyAI',
};

interface ProviderMeta {
  label: string;
  category: 'local' | 'cloud';
}

interface ProviderInfo {
  active: string;
  available: string[];
  configured: string[];
  model?: string;
  voiceboxUrl?: string;
  metadata?: Record<string, ProviderMeta>;
}

interface ProvidersConfig {
  vision?: ProviderInfo;
  tts?: ProviderInfo;
  stt?: ProviderInfo;
}

function ProviderBadge({
  provider,
  label,
  active,
  onClick,
  isPending,
}: {
  provider: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  isPending?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={isPending || active}
      onClick={onClick}
      title={active ? 'Currently active' : `Switch to ${label}`}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? 'border-primary/50 bg-primary/10 text-primary font-medium cursor-default'
          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground cursor-pointer'
      }`}
    >
      {active && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
      {isPending && !active ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
      {label}
    </button>
  );
}

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3'];

function ProviderSection({
  type,
  label,
  info,
  onSelect,
  onSelectModel,
  isPending,
}: {
  type: 'vision' | 'tts' | 'stt';
  label: string;
  info: ProviderInfo | undefined;
  onSelect: (type: 'vision' | 'tts' | 'stt', provider: string) => void;
  onSelectModel?: (type: 'stt' | 'tts', model: string) => void;
  isPending: boolean;
}) {
  const configured = info?.configured ?? [];
  const active = info?.active ?? '';
  const model = info?.model ?? '';
  const metadata = info?.metadata ?? {};

  const getLabel = (p: string): string => metadata[p]?.label ?? PROVIDER_LABEL_FALLBACK[p] ?? p;
  const getCategory = (p: string): 'local' | 'cloud' => metadata[p]?.category ?? 'cloud';

  const cloudProviders = configured.filter((p) => getCategory(p) === 'cloud');
  const localProviders = configured.filter((p) => getCategory(p) === 'local');

  // Model selector for STT: local providers get whisper model picker; openai shows fixed chip
  const showModelSelector = type === 'stt' && active !== '';
  const isLocalSTT = ['voicebox', 'openedai'].includes(active);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      {configured.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">No providers connected.</p>
      ) : (
        <div className="space-y-1.5">
          {cloudProviders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cloudProviders.map((p) => (
                <ProviderBadge
                  key={p}
                  provider={p}
                  label={getLabel(p)}
                  active={p === active}
                  isPending={isPending}
                  onClick={() => {
                    if (p !== active) onSelect(type, p);
                  }}
                />
              ))}
            </div>
          )}
          {localProviders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="text-[10px] text-muted-foreground/50 self-center pr-1">local</span>
              {localProviders.map((p) => (
                <ProviderBadge
                  key={p}
                  provider={p}
                  label={getLabel(p)}
                  active={p === active}
                  isPending={isPending}
                  onClick={() => {
                    if (p !== active) onSelect(type, p);
                  }}
                />
              ))}
            </div>
          )}
          {showModelSelector && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] text-muted-foreground/50">model</span>
              {isLocalSTT ? (
                <select
                  value={model || 'whisper-1'}
                  onChange={(e) => onSelectModel?.('stt', e.target.value)}
                  className="bg-card border border-border rounded text-xs py-0.5 px-1.5"
                  disabled={isPending}
                >
                  {WHISPER_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground">
                  {model || 'whisper-1'}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  config,
  onSelectProvider,
  onSelectModel,
  isPending,
}: {
  config: Record<string, unknown> | undefined;
  onSelectProvider: (type: 'vision' | 'tts' | 'stt', provider: string) => void;
  onSelectModel: (type: 'stt' | 'tts', model: string) => void;
  isPending: boolean;
}) {
  const providers = (config?.providers ?? {}) as ProvidersConfig;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Providers</h2>
        <span className="text-xs text-muted-foreground ml-auto">
          Click a configured provider to switch
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ProviderSection
          type="vision"
          label="Vision"
          info={providers.vision}
          onSelect={onSelectProvider}
          isPending={isPending}
        />
        <ProviderSection
          type="tts"
          label="Text-to-Speech"
          info={providers.tts}
          onSelect={onSelectProvider}
          isPending={isPending}
        />
        <ProviderSection
          type="stt"
          label="Speech-to-Text"
          info={providers.stt}
          onSelect={onSelectProvider}
          onSelectModel={onSelectModel}
          isPending={isPending}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg sm:text-xl font-bold mt-0.5 ${color ?? ''}`}>{value}</p>
    </div>
  );
}
