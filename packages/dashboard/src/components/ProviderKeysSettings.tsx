/* eslint-disable react-hooks/preserve-manual-memoization */
/**
 * Provider API Keys Settings
 *
 * Dropdown-driven UI for managing AI provider API keys.
 * Selecting a provider shows setup help if not yet configured,
 * or management controls if already configured.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Trash2, Check, ExternalLink, ChevronDown, HelpCircle } from 'lucide-react';
import { fetchSecretKeys, setSecret, deleteSecret } from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';

interface ProviderDef {
  id: string;
  label: string;
  envVarName: string;
  description: string;
  placeholder: string;
  website: string;
  docsUrl: string;
  helpSteps: string[];
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    envVarName: 'ANTHROPIC_API_KEY',
    description: 'Claude models (Opus, Sonnet, Haiku)',
    placeholder: 'sk-ant-...',
    website: 'https://console.anthropic.com',
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
    helpSteps: [
      'Go to console.anthropic.com and sign in (or create an account)',
      'Navigate to Settings > API Keys',
      'Click "Create Key", give it a name, and copy the key',
      'Paste the key below',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envVarName: 'OPENAI_API_KEY',
    description: 'GPT-4o, GPT-4, o1, o3 models',
    placeholder: 'sk-...',
    website: 'https://platform.openai.com',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    helpSteps: [
      'Go to platform.openai.com and sign in (or create an account)',
      'Navigate to API Keys in the left sidebar',
      'Click "Create new secret key", name it, and copy the key',
      'Paste the key below',
    ],
  },
  {
    id: 'google',
    label: 'Google / Gemini',
    envVarName: 'GOOGLE_API_KEY',
    description: 'Gemini Pro, Gemini Ultra models',
    placeholder: 'AIza...',
    website: 'https://aistudio.google.com',
    docsUrl: 'https://ai.google.dev/docs',
    helpSteps: [
      'Go to aistudio.google.com and sign in with your Google account',
      'Click "Get API key" in the top bar',
      'Create a key in a new or existing Google Cloud project',
      'Copy the generated key and paste it below',
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    envVarName: 'GROQ_API_KEY',
    description: 'Fast inference for open models (Llama, Mixtral)',
    placeholder: 'gsk_...',
    website: 'https://console.groq.com',
    docsUrl: 'https://console.groq.com/docs/quickstart',
    helpSteps: [
      'Go to console.groq.com and sign in (or create an account)',
      'Navigate to API Keys from the dashboard',
      'Click "Create API Key", name it, and copy the key',
      'Paste the key below',
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    envVarName: 'MISTRAL_API_KEY',
    description: 'Mistral Large, Medium, Small models',
    placeholder: '',
    website: 'https://console.mistral.ai',
    docsUrl: 'https://docs.mistral.ai',
    helpSteps: [
      'Go to console.mistral.ai and sign in (or create an account)',
      'Navigate to API Keys in your workspace settings',
      'Click "Create new key", name it, and copy the key',
      'Paste the key below',
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envVarName: 'DEEPSEEK_API_KEY',
    description: 'DeepSeek-V3, DeepSeek-R1 models',
    placeholder: 'sk-...',
    website: 'https://platform.deepseek.com',
    docsUrl: 'https://api-docs.deepseek.com',
    helpSteps: [
      'Go to platform.deepseek.com and sign in (or create an account)',
      'Navigate to API Keys',
      'Click "Create API Key", copy the generated key',
      'Paste the key below',
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envVarName: 'OPENROUTER_API_KEY',
    description: 'Unified API for 100+ models from multiple providers',
    placeholder: 'sk-or-...',
    website: 'https://openrouter.ai',
    docsUrl: 'https://openrouter.ai/docs',
    helpSteps: [
      'Go to openrouter.ai and sign in (or create an account)',
      'Navigate to Keys in your account settings',
      'Click "Create Key", name it, and copy the key',
      'Paste the key below',
    ],
  },
];

const _PROVIDER_ENV_NAMES = new Set(PROVIDERS.map((p) => p.envVarName));

export function ProviderKeysSettings() {
  const queryClient = useQueryClient();

  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [customEnvName, setCustomEnvName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ envVarName: string; label: string } | null>(
    null
  );

  const { data: secretsData, isLoading } = useQuery({
    queryKey: ['secret-keys'],
    queryFn: fetchSecretKeys,
    refetchOnWindowFocus: false,
  });

  const configuredKeys = new Set(secretsData?.keys ?? []);

  const setMutation = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) => setSecret(name, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['secret-keys'] });
      void queryClient.refetchQueries({ queryKey: ['model-info'] });
      setKeyValue('');
      setSelectedProviderId('');
      setCustomEnvName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteSecret(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['secret-keys'] });
      void queryClient.refetchQueries({ queryKey: ['model-info'] });
      setDeleteTarget(null);
    },
  });

  const selectedProvider = PROVIDERS.find((p) => p.id === selectedProviderId);
  const isCustom = selectedProviderId === 'custom';
  const resolvedEnvName = isCustom ? customEnvName : (selectedProvider?.envVarName ?? '');
  const isConfigured = resolvedEnvName.length > 0 && configuredKeys.has(resolvedEnvName);
  const canSave = resolvedEnvName.length > 0 && keyValue.length >= 8;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    setMutation.mutate({ name: resolvedEnvName, value: keyValue });
  }, [canSave, resolvedEnvName, keyValue, setMutation]);

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.envVarName);
      // If the deleted provider is the one currently selected, the status will update via query refresh
    }
  }, [deleteTarget, deleteMutation]);

  const handleSelectProvider = (id: string) => {
    setSelectedProviderId(id);
    setKeyValue('');
    setCustomEnvName('');
    setMutation.reset();
  };

  // Count configured known providers for the summary line
  const configuredCount = PROVIDERS.filter((p) => configuredKeys.has(p.envVarName)).length;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Provider Key"
        message={`Delete the API key for ${deleteTarget?.label}? The provider will no longer be available until a new key is set.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      <div>
        <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
          <KeyRound className="w-5 h-5" />
          AI Provider Keys
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure API keys for AI model providers. Keys are stored securely and never displayed
          after saving.
        </p>
      </div>

      <div className="card p-4 space-y-4">
        {/* Provider dropdown */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Provider</label>
          <div className="relative">
            <select
              value={selectedProviderId}
              onChange={(e) => {
                handleSelectProvider(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary pr-8"
            >
              <option value="">Select a provider...</option>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {configuredKeys.has(p.envVarName) ? ' (configured)' : ''}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          {!isLoading && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {configuredCount} of {PROVIDERS.length} providers configured
            </p>
          )}
        </div>

        {/* Provider detail panel */}
        {selectedProvider && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-success' : 'bg-muted-foreground/30'}`}
                />
                <span className="font-medium text-sm">{selectedProvider.label}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {selectedProvider.envVarName}
                </span>
              </div>
              {isConfigured && (
                <span className="text-xs text-success font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Configured
                </span>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Description */}
              <p className="text-sm text-muted-foreground">{selectedProvider.description}</p>

              {/* Help steps — shown when NOT configured */}
              {!isConfigured && (
                <div className="rounded-lg bg-muted/20 border border-border p-3 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                    <HelpCircle className="w-3.5 h-3.5 text-primary" />
                    How to get your API key
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1.5 ml-5 list-decimal">
                    {selectedProvider.helpSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  <a
                    href={selectedProvider.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    Open {selectedProvider.label} console
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Key input — always shown so user can add or replace */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {isConfigured ? 'Replace API Key' : 'API Key'}
                </label>
                <input
                  type="password"
                  value={keyValue}
                  onChange={(e) => {
                    setKeyValue(e.target.value);
                  }}
                  placeholder={selectedProvider.placeholder || 'Paste API key...'}
                  className="px-3 py-1.5 rounded-lg border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                  autoComplete="off"
                />
                {keyValue.length > 0 && keyValue.length < 8 && (
                  <p className="text-xs text-destructive mt-1">Key must be at least 8 characters</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost text-sm px-4 py-1.5"
                  onClick={handleSave}
                  disabled={!canSave || setMutation.isPending}
                >
                  {setMutation.isPending ? 'Saving...' : isConfigured ? 'Replace Key' : 'Save Key'}
                </button>
                <button
                  className="btn btn-ghost text-sm px-4 py-1.5"
                  onClick={() => {
                    handleSelectProvider('');
                  }}
                >
                  Cancel
                </button>
                {isConfigured && (
                  <button
                    className="text-destructive hover:text-destructive/80 text-sm flex items-center gap-1 px-2 py-1.5"
                    onClick={() => {
                      setDeleteTarget({
                        envVarName: selectedProvider.envVarName,
                        label: selectedProvider.label,
                      });
                    }}
                    aria-label={`Delete ${selectedProvider.label} key`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
                <a
                  href={selectedProvider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-primary hover:underline flex items-center gap-0.5"
                >
                  API docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {setMutation.isError && (
                <p className="text-xs text-destructive">Failed to save key. Please try again.</p>
              )}
              {setMutation.isSuccess && (
                <p className="text-xs text-success">Key saved successfully.</p>
              )}
            </div>
          </div>
        )}

        {/* Custom provider panel */}
        {isCustom && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <span className="font-medium text-sm">Custom Provider</span>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Environment Variable Name
                </label>
                <input
                  type="text"
                  value={customEnvName}
                  onChange={(e) => {
                    setCustomEnvName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
                  }}
                  placeholder="MY_PROVIDER_API_KEY"
                  className="px-3 py-1.5 rounded-lg border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {customEnvName && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                    <input
                      type="password"
                      value={keyValue}
                      onChange={(e) => {
                        setKeyValue(e.target.value);
                      }}
                      placeholder="Paste API key..."
                      className="px-3 py-1.5 rounded-lg border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                      autoComplete="off"
                    />
                    {keyValue.length > 0 && keyValue.length < 8 && (
                      <p className="text-xs text-destructive mt-1">
                        Key must be at least 8 characters
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-ghost text-sm px-4 py-1.5"
                      onClick={handleSave}
                      disabled={!canSave || setMutation.isPending}
                    >
                      {setMutation.isPending ? 'Saving...' : 'Save Key'}
                    </button>
                    <button
                      className="btn btn-ghost text-sm px-4 py-1.5"
                      onClick={() => {
                        handleSelectProvider('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {setMutation.isError && (
                    <p className="text-xs text-destructive">
                      Failed to save key. Please try again.
                    </p>
                  )}
                  {setMutation.isSuccess && (
                    <p className="text-xs text-success">Key saved successfully.</p>
                  )}
                </>
              )}
              {!customEnvName && (
                <button
                  className="btn btn-ghost text-sm px-4 py-1.5"
                  onClick={() => {
                    handleSelectProvider('');
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Configured providers summary — only shown when at least one is configured and no provider selected */}
        {!selectedProviderId && !isLoading && configuredCount > 0 && (
          <div className="space-y-1">
            {PROVIDERS.filter((p) => configuredKeys.has(p.envVarName)).map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  handleSelectProvider(provider.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleSelectProvider(provider.id);
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  <span className="font-medium">{provider.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {provider.envVarName}
                  </span>
                </div>
                <span className="text-xs text-success">Configured</span>
              </div>
            ))}
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      </div>
    </div>
  );
}
