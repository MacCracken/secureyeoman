import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, ArrowRight, ArrowLeft, Check, Cpu } from 'lucide-react';
import { completeOnboarding } from '../api/client';
import type { PersonalityCreate, DefaultModel } from '../types';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type Step = 'name' | 'personality' | 'model' | 'confirm';

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

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('name');
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

  const resolvedDefaultModel: DefaultModel | null = modelName
    ? { provider: selectedProvider, model: modelName }
    : null;

  const mutation = useMutation({
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

  // Keep personality name synced with agent name
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

  const steps: Step[] = ['name', 'personality', 'model', 'confirm'];
  const stepIndex = steps.indexOf(step);

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
            {steps.map((s, i) => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div
                  className={`h-1 flex-1 rounded ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Step {stepIndex + 1} of {steps.length}
          </p>
        </div>

        <div className="card-content">
          {error && (
            <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Agent Name */}
          {step === 'name' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Agent Name</label>
                <input
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
            </div>
          )}

          {/* Step 2: Personality */}
          {step === 'personality' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
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
                <label className="block text-sm font-medium mb-1">System Prompt</label>
                <textarea
                  value={personality.systemPrompt}
                  onChange={(e) => {
                    setPersonality((p) => ({ ...p, systemPrompt: e.target.value }));
                  }}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  rows={3}
                  placeholder={`You are ${agentName}, a helpful AI assistant...`}
                  maxLength={2000}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Voice</label>
                  <input
                    type="text"
                    value={personality.voice}
                    onChange={(e) => {
                      setPersonality((p) => ({ ...p, voice: e.target.value }));
                    }}
                    className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., warm, professional"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Preferred Language</label>
                  <input
                    type="text"
                    value={personality.preferredLanguage}
                    onChange={(e) => {
                      setPersonality((p) => ({ ...p, preferredLanguage: e.target.value }));
                    }}
                    className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., English"
                    maxLength={50}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: AI Model */}
          {step === 'model' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">AI Provider &amp; Model</span>
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
                <label className="block text-xs text-muted-foreground mb-1">Model name</label>
                <input
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
                onClick={() => {
                  setModelName('');
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear — use server default
              </button>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 rounded bg-muted">
                <h3 className="font-medium text-lg mb-3">{agentName}</h3>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Description</dt>
                    <dd>{personality.description || '(none)'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Traits</dt>
                    <dd className="flex gap-2 flex-wrap">
                      {Object.entries(personality.traits ?? {}).map(([k, v]) => (
                        <span key={k} className="badge badge-info">
                          {k}: {v}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">AI Model</dt>
                    <dd className="font-mono text-xs">
                      {resolvedDefaultModel
                        ? `${resolvedDefaultModel.provider} / ${resolvedDefaultModel.model}`
                        : 'Server default'}
                    </dd>
                  </div>
                  {personality.voice && (
                    <div>
                      <dt className="text-muted-foreground">Voice</dt>
                      <dd>{personality.voice}</dd>
                    </div>
                  )}
                  {personality.preferredLanguage && (
                    <div>
                      <dt className="text-muted-foreground">Language</dt>
                      <dd>{personality.preferredLanguage}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex justify-between">
          <button
            onClick={() => {
              setStep(steps[stepIndex - 1]);
            }}
            disabled={stepIndex === 0}
            className="btn btn-ghost flex items-center gap-1 disabled:opacity-30"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {step !== 'confirm' ? (
            <button
              onClick={() => {
                setStep(steps[stepIndex + 1]);
              }}
              disabled={!agentName.trim()}
              className="btn btn-primary flex items-center gap-1"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                mutation.mutate();
              }}
              disabled={mutation.isPending}
              className="btn btn-primary flex items-center gap-1"
            >
              {mutation.isPending ? (
                'Creating...'
              ) : (
                <>
                  Complete <Check className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
