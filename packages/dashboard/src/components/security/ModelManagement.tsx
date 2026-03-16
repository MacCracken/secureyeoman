/**
 * ModelManagement — AI Model Default selector.
 *
 * Extracted from SecuritySettings.tsx (behavior-preserving refactor).
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  fetchModelDefault,
  setModelDefault,
  clearModelDefault,
  fetchModelInfo,
} from '../../api/client';

export const MODEL_PROVIDER_LABELS: Record<string, string> = {
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

export function ModelManagement() {
  const queryClient = useQueryClient();

  const { data: modelDefault } = useQuery({
    queryKey: ['model-default'],
    queryFn: fetchModelDefault,
  });

  const { data: modelInfo } = useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
  });

  const setDefaultMutation = useMutation({
    mutationFn: setModelDefault,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-default'] });
      void queryClient.invalidateQueries({ queryKey: ['model-info'] });
    },
  });

  const clearDefaultMutation = useMutation({
    mutationFn: clearModelDefault,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-default'] });
    },
  });

  const [draftProvider, setDraftProvider] = useState('');
  const [draftModel, setDraftModel] = useState('');

  const modelsByProvider = modelInfo?.available ?? {};
  const draftKey = draftProvider && draftModel ? `${draftProvider}::${draftModel}` : '';

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="font-medium text-sm">AI Model Default</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Persistent model used after restart. Overrides config file.
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Current default:</span>
        {modelDefault?.provider && modelDefault?.model ? (
          <span className="badge badge-success">
            {MODEL_PROVIDER_LABELS[modelDefault.provider] ?? modelDefault.provider} /{' '}
            {modelDefault.model}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Using config file
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <select
            className="w-full px-2 py-1 text-sm rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            value={draftKey}
            onChange={(e) => {
              const [p, ...rest] = e.target.value.split('::');
              setDraftProvider(p ?? '');
              setDraftModel(rest.join('::'));
            }}
          >
            <option value="">Select a model…</option>
            {Object.entries(modelsByProvider).map(([provider, models]) => (
              <optgroup key={provider} label={MODEL_PROVIDER_LABELS[provider] ?? provider}>
                {models.map((m) => (
                  <option key={`${provider}::${m.model}`} value={`${provider}::${m.model}`}>
                    {m.model}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          className="btn btn-ghost text-sm h-8"
          disabled={!draftProvider || !draftModel || setDefaultMutation.isPending}
          onClick={() => {
            if (draftProvider && draftModel) {
              setDefaultMutation.mutate({ provider: draftProvider, model: draftModel });
            }
          }}
        >
          {setDefaultMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Set Default'
          )}
        </button>
        {modelDefault?.provider && modelDefault?.model && (
          <button
            className="text-xs text-destructive hover:text-destructive/80"
            disabled={clearDefaultMutation.isPending}
            onClick={() => {
              clearDefaultMutation.mutate();
            }}
          >
            {clearDefaultMutation.isPending ? 'Clearing…' : 'Clear'}
          </button>
        )}
      </div>
    </div>
  );
}
