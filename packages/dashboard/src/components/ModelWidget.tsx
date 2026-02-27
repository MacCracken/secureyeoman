import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Check, Loader2, X, Cpu, Download, Trash2 } from 'lucide-react';
import { fetchModelInfo, switchModel, patchModelConfig, fetchOllamaPull, deleteOllamaModel } from '../api/client';
import type { ModelInfo } from '../types';

const LOCAL_PROVIDER_KEYS = new Set(['ollama', 'lmstudio', 'localai']);

function formatDiskSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

interface ModelWidgetProps {
  onClose: () => void;
  onModelSwitch?: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama (Local)',
  opencode: 'OpenCode (Zen)',
};

function formatPrice(inputPer1M: number, outputPer1M: number): string {
  if (inputPer1M === 0 && outputPer1M === 0) return 'Free';
  return `$${inputPer1M} / $${outputPer1M} per 1M tokens`;
}

export function ModelWidget({ onClose, onModelSwitch }: ModelWidgetProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
  });

  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // Expand current provider on initial data load
  const didAutoExpand = useRef(false);
  useEffect(() => {
    if (data?.current.provider && !didAutoExpand.current) {
      didAutoExpand.current = true;
      setExpandedProviders(new Set([data.current.provider]));
    }
  }, [data?.current.provider]);

  const switchMutation = useMutation({
    mutationFn: switchModel,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-info'] });
      onModelSwitch?.();
    },
  });

  const localFirstMutation = useMutation({
    mutationFn: patchModelConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-info'] });
    },
  });

  const [pullModel, setPullModel] = useState('');
  const [pullStatus, setPullStatus] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<number | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [isPulling, setIsPulling] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: deleteOllamaModel,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-info'] });
    },
  });

  const handlePull = async () => {
    if (!pullModel.trim() || isPulling) return;
    setIsPulling(true);
    setPullStatus(null);
    setPullProgress(null);
    setPullError(null);
    try {
      for await (const progress of fetchOllamaPull(pullModel.trim())) {
        if (progress.error) {
          setPullError(progress.error);
          setIsPulling(false);
          return;
        }
        if (progress.status === 'done') {
          setPullStatus('done');
          setPullProgress(100);
          void queryClient.invalidateQueries({ queryKey: ['model-info'] });
          setPullModel('');
          break;
        }
        if (progress.total && progress.completed !== undefined) {
          setPullProgress(Math.round((progress.completed / progress.total) * 100));
        }
        if (progress.status) {
          setPullStatus(progress.status);
        }
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Pull failed');
    } finally {
      setIsPulling(false);
    }
  };

  const toggleProvider = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const handleSwitch = (provider: string, model: string) => {
    if (data?.current.provider === provider && data?.current.model === model) return;
    switchMutation.mutate({ provider, model });
  };

  if (isLoading) {
    return (
      <div className="card p-4 w-80 shadow-lg">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentProvider = data.current.provider;
  const currentModel = data.current.model;
  const localFirst = data.current.localFirst ?? false;
  const hasLocalProvider = Object.keys(data.available).some((p) => LOCAL_PROVIDER_KEYS.has(p));

  return (
    <div className="card w-80 shadow-lg max-h-[500px] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Model Selection</span>
        </div>
        <button onClick={onClose} className="btn-ghost p-1 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Current model */}
      <div className="px-3 py-2 bg-primary/5 border-b">
        <p className="text-xs text-muted-foreground">Current Model</p>
        <p className="text-sm font-medium">
          {currentModel}
          <span className="text-xs text-muted-foreground ml-2">
            {PROVIDER_LABELS[currentProvider] ?? currentProvider}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          max tokens: {data.current.maxTokens} | temp: {data.current.temperature}
        </p>
      </div>

      {/* Local-first toggle */}
      {hasLocalProvider && (
        <div className="px-3 py-2 border-b flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium">Local-first mode</p>
            <p className="text-xs text-muted-foreground">
              Try local model before cloud. Falls back to cloud if local is unreachable.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={localFirst}
            onClick={() => {
              localFirstMutation.mutate({ localFirst: !localFirst });
            }}
            disabled={localFirstMutation.isPending}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-0.5 ${
              localFirst ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                localFirst ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}

      {/* Model list */}
      <div className="overflow-y-auto flex-1">
        {Object.entries(data.available).map(([provider, models]) => (
          <div key={provider}>
            <button
              onClick={() => {
                toggleProvider(provider);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 border-b"
            >
              {expandedProviders.has(provider) ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {PROVIDER_LABELS[provider] ?? provider}
              <span className="text-xs text-muted-foreground ml-auto">{models.length} models</span>
            </button>

            {expandedProviders.has(provider) && (
              <div className="divide-y">
                {models.map((m) => {
                  const isActive = m.provider === currentProvider && m.model === currentModel;
                  const isSwitching =
                    switchMutation.isPending &&
                    switchMutation.variables?.provider === m.provider &&
                    switchMutation.variables?.model === m.model;
                  const isDeleting =
                    deleteMutation.isPending && deleteMutation.variables === m.model;
                  const isOllama = provider === 'ollama';
                  const modelSize = (m as ModelInfo & { size?: number }).size;

                  return (
                    <div
                      key={m.model}
                      className={`flex items-center ${isActive ? 'bg-primary/15 border-l-2 border-primary' : ''}`}
                    >
                      <button
                        onClick={() => {
                          handleSwitch(m.provider, m.model);
                        }}
                        disabled={isActive || switchMutation.isPending}
                        className="flex-1 text-left px-4 py-2 text-sm hover:bg-muted/50 disabled:opacity-60"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs">{m.model}</span>
                          <div className="flex items-center gap-1">
                            {isOllama && modelSize && (
                              <span className="text-xs text-muted-foreground">
                                {formatDiskSize(modelSize)}
                              </span>
                            )}
                            {isActive && <Check className="w-3 h-3 text-primary" />}
                            {isSwitching && <Loader2 className="w-3 h-3 animate-spin" />}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatPrice(m.inputPer1M, m.outputPer1M)}
                        </p>
                      </button>
                      {isOllama && (
                        <button
                          onClick={() => deleteMutation.mutate(m.model)}
                          disabled={deleteMutation.isPending}
                          className="p-2 hover:bg-destructive/10 hover:text-destructive rounded mr-1"
                          title={`Remove ${m.model}`}
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Ollama pull form */}
                {provider === 'ollama' && (
                  <div className="px-3 py-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Pull new model</p>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={pullModel}
                        onChange={(e) => setPullModel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handlePull();
                        }}
                        placeholder="e.g. llama3:8b"
                        className="flex-1 px-2 py-1 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        disabled={isPulling}
                      />
                      <button
                        onClick={() => void handlePull()}
                        disabled={isPulling || !pullModel.trim()}
                        className="btn-ghost p-1 rounded"
                        title="Pull model"
                      >
                        {isPulling ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    {isPulling && pullStatus && (
                      <div className="mt-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{pullStatus}</span>
                          {pullProgress !== null && <span>{pullProgress}%</span>}
                        </div>
                        {pullProgress !== null && (
                          <div className="h-1 bg-muted rounded mt-0.5">
                            <div
                              className="h-1 bg-primary rounded transition-all"
                              style={{ width: `${pullProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {pullStatus === 'done' && (
                      <p className="text-xs text-green-600 mt-1">✓ Pulled successfully</p>
                    )}
                    {pullError && (
                      <p className="text-xs text-destructive mt-1">{pullError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error feedback */}
      {switchMutation.isError && (
        <div className="px-3 py-2 bg-destructive/10 border-t text-xs text-destructive">
          Failed to switch model: {switchMutation.error.message}
        </div>
      )}
    </div>
  );
}
