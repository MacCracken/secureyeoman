import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';
import { createPersonality } from '../../api/client';
import type { PersonalityCreate } from '../../types';

interface PersonalityWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep = 'mission' | 'topics' | 'tone' | 'reasoning' | 'constraints' | 'review';

const STEPS: WizardStep[] = ['mission', 'topics', 'tone', 'reasoning', 'constraints', 'review'];

const STEP_LABELS: Record<WizardStep, string> = {
  mission: 'Mission',
  topics: 'Topics',
  tone: 'Tone & Style',
  reasoning: 'Reasoning',
  constraints: 'Constraints',
  review: 'Review',
};

const FORMALITY_OPTIONS = ['casual', 'balanced', 'formal'] as const;
const HUMOR_OPTIONS = ['none', 'subtle', 'witty'] as const;
const VERBOSITY_OPTIONS = ['concise', 'balanced', 'detailed'] as const;
const REASONING_OPTIONS = ['analytical', 'creative', 'balanced'] as const;

export function PersonalityWizard({ onComplete, onCancel }: PersonalityWizardProps) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<WizardStep>('mission');

  // Form state
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [formality, setFormality] = useState<string>('balanced');
  const [humor, setHumor] = useState<string>('dry');
  const [verbosity, setVerbosity] = useState<string>('concise');
  const [reasoning, setReasoning] = useState<string>('analytical');
  const [constraints, setConstraints] = useState('');
  const [sex, setSex] = useState<string>('unspecified');
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const createMutation = useMutation({
    mutationFn: (data: PersonalityCreate) => createPersonality(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      onComplete();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const canAdvance = () => {
    if (currentStep === 'mission') return name.trim().length > 0;
    return true;
  };

  const goNext = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1]);
  };

  const goBack = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1]);
  };

  const handleCreate = () => {
    const fullPrompt = constraints.trim()
      ? `${systemPrompt.trim()}\n\nConstraints:\n${constraints.trim()}`
      : systemPrompt.trim();

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || `${name.trim()} personality`,
      systemPrompt: fullPrompt,
      traits: { formality, humor, verbosity, reasoning },
      sex: sex as PersonalityCreate['sex'],
      voice: '',
      preferredLanguage: '',
      defaultModel: null,
      modelFallbacks: [],
      includeArchetypes: true,
      injectDateTime: false,
      empathyResonance: false,
    });
  };

  return (
    <div className="max-w-2xl mx-auto" data-testid="personality-wizard">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Personality Creation Wizard
          </h2>
          <span className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          {STEPS.map((s) => (
            <span
              key={s}
              className={`text-xs ${s === currentStep ? 'text-primary font-medium' : 'text-muted-foreground'}`}
            >
              {STEP_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="space-y-4 min-h-[200px]">
        {currentStep === 'mission' && (
          <div>
            <label className="block text-sm font-medium mb-1">Personality Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder="e.g., FRIDAY, SecurityBot, DataAnalyst"
              className="w-full px-3 py-2 border rounded-md bg-background"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <label className="block text-sm font-medium mt-4 mb-1">Mission (System Prompt)</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
              }}
              placeholder="Describe this personality's role and mission..."
              rows={4}
              className="w-full px-3 py-2 border rounded-md bg-background resize-y"
            />
          </div>
        )}

        {currentStep === 'topics' && (
          <div>
            <label className="block text-sm font-medium mb-1">Description / Focus Areas</label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              placeholder="What topics should this personality focus on?"
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-background resize-y"
            />
            <label className="block text-sm font-medium mt-4 mb-1">Sex</label>
            <select
              value={sex}
              onChange={(e) => {
                setSex(e.target.value);
              }}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="unspecified">Unspecified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non-binary">Non-binary</option>
            </select>
          </div>
        )}

        {currentStep === 'tone' && (
          <div className="space-y-4">
            <TraitSelector
              label="Formality"
              value={formality}
              options={FORMALITY_OPTIONS}
              onChange={setFormality}
            />
            <TraitSelector
              label="Humor"
              value={humor}
              options={HUMOR_OPTIONS}
              onChange={setHumor}
            />
            <TraitSelector
              label="Verbosity"
              value={verbosity}
              options={VERBOSITY_OPTIONS}
              onChange={setVerbosity}
            />
          </div>
        )}

        {currentStep === 'reasoning' && (
          <div>
            <TraitSelector
              label="Reasoning Style"
              value={reasoning}
              options={REASONING_OPTIONS}
              onChange={setReasoning}
            />
          </div>
        )}

        {currentStep === 'constraints' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Constraints & Guardrails (optional)
            </label>
            <textarea
              value={constraints}
              onChange={(e) => {
                setConstraints(e.target.value);
              }}
              placeholder="Any rules or boundaries this personality should follow..."
              rows={5}
              className="w-full px-3 py-2 border rounded-md bg-background resize-y"
            />
          </div>
        )}

        {currentStep === 'review' && (
          <div className="space-y-3">
            <h3 className="font-medium">Review your personality</h3>
            <div className="bg-muted/50 rounded-md p-4 space-y-2 text-sm">
              <p>
                <strong>Name:</strong> {name}
              </p>
              <p>
                <strong>Description:</strong> {description || `${name} personality`}
              </p>
              <p>
                <strong>Traits:</strong> {formality}, {humor}, {verbosity}
              </p>
              <p>
                <strong>Reasoning:</strong> {reasoning}
              </p>
              {constraints && (
                <p>
                  <strong>Constraints:</strong> {constraints.slice(0, 100)}...
                </p>
              )}
              {systemPrompt && (
                <p>
                  <strong>System Prompt:</strong> {systemPrompt.slice(0, 100)}...
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6 pt-4 border-t">
        <div>
          {stepIndex > 0 ? (
            <button
              onClick={goBack}
              className="flex items-center gap-1 px-4 py-2 text-sm border rounded-md hover:bg-muted"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {currentStep !== 'review' && currentStep !== 'mission' && (
            <button
              onClick={goNext}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          )}
          {currentStep === 'review' ? (
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {createMutation.isPending ? 'Creating...' : 'Create Personality'}
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canAdvance()}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TraitSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => {
              onChange(opt);
            }}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              value === opt
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
