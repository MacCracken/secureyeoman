import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, ArrowRight, ArrowLeft, Check, Cpu, Key, Shield, Copy } from 'lucide-react';
import {
  completeOnboarding,
  fetchApiKeys,
  createApiKey,
  fetchSecurityPolicy,
  updateSecurityPolicy,
} from '../api/client';
import type { PersonalityCreate, DefaultModel, ApiKeyCreateRequest } from '../types';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type Step = 'personality' | 'api-keys' | 'security' | 'model' | 'done';

const STEPS: Step[] = ['personality', 'api-keys', 'security', 'model', 'done'];

const TRAIT_OPTIONS: Record<string, string[]> = {
  formality: ['casual', 'balanced', 'formal'],
  humor: ['none', 'subtle', 'witty'],
  verbosity: ['concise', 'balanced', 'detailed'],
};

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'ollama', 'deepseek', 'mistral'] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_DEFAULTS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
  ollama: 'llama3.2',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
};

const SECURITY_TOGGLES: { key: string; label: string; description: string }[] = [
  { key: 'allowCodeEditor', label: 'Code Editor', description: 'Allow access to the code editor' },
  {
    key: 'allowAdvancedEditor',
    label: 'Advanced Editor',
    description: 'Allow the three-panel advanced editor mode',
  },
  {
    key: 'allowIntentEditor',
    label: 'Intent Document Editor',
    description: 'Allow editing the organisation intent document',
  },
  {
    key: 'allowFileSystemAccess',
    label: 'File System Access',
    description: 'Allow the agent to read and write local files',
  },
  {
    key: 'allowNetworkAccess',
    label: 'Network Access',
    description: 'Allow the agent to make outbound network requests',
  },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('personality');
  const [agentName, setAgentName] = useState('FRIDAY');
  const [personality, setPersonality] = useState<PersonalityCreate>({
    name: 'FRIDAY',
    description: 'Friendly, Reliable, Intelligent Digitally Adaptable Yeoman',
    systemPrompt: '',
    traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
    sex: 'unspecified',
    voice: '',
    preferredLanguage: '',
    includeArchetypes: true,
  });
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic');
  const [modelName, setModelName] = useState(PROVIDER_DEFAULTS.anthropic);
  const [error, setError] = useState<string | null>(null);

  // API Keys step state
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [createdKeyValue, setCreatedKeyValue] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // Security step state
  const [securityDirty, setSecurityDirty] = useState(false);
  const [securityToggles, setSecurityToggles] = useState<Record<string, boolean>>({
    allowCodeEditor: true,
    allowAdvancedEditor: false,
    allowIntentEditor: true,
    allowFileSystemAccess: false,
    allowNetworkAccess: false,
  });

  const stepIndex = STEPS.indexOf(step);

  const resolvedDefaultModel: DefaultModel | null = modelName
    ? { provider: selectedProvider, model: modelName }
    : null;

  // Queries
  const { data: apiKeysData } = useQuery({
    queryKey: ['api-keys'],
    queryFn: fetchApiKeys,
    enabled: step === 'api-keys',
  });

  const { data: securityPolicyData } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    enabled: step === 'security',
  });

  // Initialise toggle state from fetched policy (runs once when data arrives)
  useEffect(() => {
    if (!securityPolicyData) return;
    setSecurityToggles({
      allowCodeEditor: securityPolicyData.allowCodeEditor ?? true,
      allowAdvancedEditor: securityPolicyData.allowAdvancedEditor ?? false,
      allowIntentEditor: securityPolicyData.allowIntentEditor ?? true,
      allowFileSystemAccess: (securityPolicyData as any).allowFileSystemAccess ?? false,
      allowNetworkAccess: (securityPolicyData as any).allowNetworkAccess ?? false,
    });
  }, [securityPolicyData]);

  // Mutations
  const completeMutation = useMutation({
    mutationFn: () =>
      completeOnboarding({
        ...personality,
        agentName,
        defaultModel: resolvedDefaultModel,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['onboarding'] });
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      void queryClient.invalidateQueries({ queryKey: ['agentName'] });
      onComplete();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: (data: ApiKeyCreateRequest) => createApiKey(data),
    onSuccess: (result) => {
      setCreatedKeyValue(result.rawKey);
      setNewKeyName('');
      setNewKeyExpiry('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const securityMutation = useMutation({
    mutationFn: (data: Record<string, boolean>) => updateSecurityPolicy(data as any),
  });

  const handleNameChange = (name: string) => {
    setAgentName(name);
    setPersonality((p) => ({
      ...p,
      name,
      systemPrompt:
        p.systemPrompt ||
        `You are ${name}, a helpful and security-conscious AI assistant. You are direct, technically precise, and proactive about identifying risks.`,
    }));
  };

  const handleProviderChange = (p: Provider) => {
    setSelectedProvider(p);
    setModelName(PROVIDER_DEFAULTS[p]);
  };

  const handleNext = async () => {
    setError(null);
    if (step === 'security' && securityDirty) {
      try {
        await securityMutation.mutateAsync(securityToggles);
      } catch {
        // non-fatal — proceed anyway
      }
    }
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]);
    }
  };

  const handleSkip = () => {
    setError(null);
    setStep(STEPS[stepIndex + 1]);
  };

  const handleBack = () => {
    setError(null);
    setStep(STEPS[stepIndex - 1]);
  };

  const handleCopyKey = async () => {
    if (createdKeyValue) {
      await navigator.clipboard.writeText(createdKeyValue);
      setKeyCopied(true);
      setTimeout(() => {
        setKeyCopied(false);
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="card max-w-lg w-full">
        <div className="card-header text-center">
          <Sparkles className="w-12 h-12 mx-auto text-primary mb-2" />
          <h1 className="card-title text-2xl">Welcome to SecureYeoman</h1>
          <p className="card-description">Let's set up your AI assistant</p>
        </div>

        {/* Progress */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div
                  className={`h-1 flex-1 rounded ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>

        <div className="card-content">
          {error && (
            <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Meet your agent (name + personality) */}
          {step === 'personality' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-1">Meet your agent</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Give your AI assistant a name and personality.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="agent-name">
                  Agent Name
                </label>
                <input
                  id="agent-name"
                  type="text"
                  value={agentName}
                  onChange={(e) => {
                    handleNameChange(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="FRIDAY"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is how your AI assistant will identify itself.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="agent-description">
                  Description
                </label>
                <input
                  id="agent-description"
                  type="text"
                  value={personality.description}
                  onChange={(e) => {
                    setPersonality((p) => ({ ...p, description: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="A helpful AI assistant"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Traits</label>
                <div className="space-y-3">
                  {Object.entries(TRAIT_OPTIONS).map(([trait, options]) => (
                    <div key={trait}>
                      <span className="text-xs text-muted-foreground capitalize">{trait}</span>
                      <div className="flex gap-2 mt-1">
                        {options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setPersonality((p) => ({
                                ...p,
                                traits: { ...p.traits, [trait]: opt },
                              }));
                            }}
                            className={`px-3 py-1 text-xs rounded border transition-colors ${
                              personality.traits?.[trait] === opt
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
            </div>
          )}

          {/* Step 2: Connect AI providers (API keys) */}
          {step === 'api-keys' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Key className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Connect AI providers</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a dashboard API key. You can skip this and do it later in Settings.
                </p>
              </div>

              {/* Existing keys */}
              {apiKeysData && apiKeysData.keys.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Existing keys</p>
                  {apiKeysData.keys.map((k) => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between px-3 py-2 rounded border text-sm"
                    >
                      <span className="font-medium">{k.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">{k.prefix}…</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Created key copy banner */}
              {createdKeyValue && (
                <div className="p-3 rounded bg-success/10 border border-success/30 space-y-2">
                  <p className="text-xs font-medium text-success">
                    API key created — copy it now, it won't be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-background rounded px-2 py-1 break-all">
                      {createdKeyValue}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopyKey()}
                      className="btn btn-ghost p-1"
                      aria-label="Copy API key"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  {keyCopied && (
                    <p className="text-xs text-success">Copied to clipboard!</p>
                  )}
                </div>
              )}

              {/* Create key form */}
              {!createdKeyValue && (
                <div className="space-y-3 border rounded p-3">
                  <p className="text-xs font-medium">Create API Key</p>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1" htmlFor="key-name">
                      Key name
                    </label>
                    <input
                      id="key-name"
                      type="text"
                      value={newKeyName}
                      onChange={(e) => {
                        setNewKeyName(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                      placeholder="My dashboard key"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label
                      className="block text-xs text-muted-foreground mb-1"
                      htmlFor="key-expiry"
                    >
                      Expires in days (optional)
                    </label>
                    <input
                      id="key-expiry"
                      type="number"
                      value={newKeyExpiry}
                      onChange={(e) => {
                        setNewKeyExpiry(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                      placeholder="e.g. 365"
                      min={1}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!newKeyName.trim() || createKeyMutation.isPending}
                    onClick={() => {
                      createKeyMutation.mutate({
                        name: newKeyName.trim(),
                        role: 'admin',
                        expiresInDays: newKeyExpiry ? parseInt(newKeyExpiry, 10) : undefined,
                      });
                    }}
                    className="btn btn-ghost text-sm disabled:opacity-40"
                  >
                    {createKeyMutation.isPending ? 'Creating…' : 'Create key'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Security policy */}
          {step === 'security' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Security policy</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose which capabilities to enable. You can change these later in Settings →
                  Security.
                </p>
              </div>

              <div className="space-y-3">
                {SECURITY_TOGGLES.map(({ key, label, description }) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 cursor-pointer"
                    htmlFor={`toggle-${key}`}
                  >
                    <input
                      id={`toggle-${key}`}
                      type="checkbox"
                      checked={securityToggles[key] ?? false}
                      onChange={(e) => {
                        setSecurityToggles((prev) => ({ ...prev, [key]: e.target.checked }));
                        setSecurityDirty(true);
                      }}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Default model */}
          {step === 'model' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Default model</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose the AI provider and model for this personality. The provider's API key must
                be set in your <code className="font-mono">.env</code> file before starting the
                server. You can skip this step to use the server default.
              </p>

              <div>
                <label className="block text-xs text-muted-foreground mb-2">Provider</label>
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        handleProviderChange(p);
                      }}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${
                        selectedProvider === p
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1" htmlFor="model-name">
                  Model name
                </label>
                <input
                  id="model-name"
                  type="text"
                  value={modelName}
                  onChange={(e) => {
                    setModelName(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  placeholder={PROVIDER_DEFAULTS[selectedProvider]}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default for {selectedProvider}:{' '}
                  <code className="font-mono">{PROVIDER_DEFAULTS[selectedProvider]}</code>
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModelName('');
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear — use server default
              </button>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-primary" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold">You're all set!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {agentName} is ready to assist you. Welcome to SecureYeoman.
                </p>
              </div>
              <div className="p-4 rounded bg-muted text-left">
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Agent</dt>
                    <dd className="font-medium">{agentName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">AI Model</dt>
                    <dd className="font-mono text-xs">
                      {resolvedDefaultModel
                        ? `${resolvedDefaultModel.provider} / ${resolvedDefaultModel.model}`
                        : 'Server default'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={stepIndex === 0}
            className="btn btn-ghost flex items-center gap-1 disabled:opacity-30"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center gap-2">
            {/* Skip button for api-keys and security steps */}
            {(step === 'api-keys' || step === 'security') && (
              <button
                type="button"
                onClick={handleSkip}
                className="btn btn-ghost text-sm text-muted-foreground"
              >
                Skip for now
              </button>
            )}

            {step !== 'done' ? (
              <button
                type="button"
                onClick={() => void handleNext()}
                disabled={step === 'personality' && !agentName.trim()}
                className="btn btn-ghost flex items-center gap-1"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  completeMutation.mutate();
                }}
                disabled={completeMutation.isPending}
                className="btn btn-ghost flex items-center gap-1"
              >
                {completeMutation.isPending ? (
                  'Creating...'
                ) : (
                  <>
                    Launch SecureYeoman <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
