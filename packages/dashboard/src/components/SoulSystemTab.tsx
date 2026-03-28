/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Users2, Star, Clock, Zap, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSoulConfig,
  updateSoulConfig,
  fetchPersonalities,
  enablePersonality,
  disablePersonality,
  setDefaultPersonality,
  clearDefaultPersonality,
  fetchStrategies,
  createStrategy,
  deleteStrategy,
} from '../api/client';
import type { Personality, SoulConfig } from '../types';

const LEARNING_MODE_LABELS: Record<string, string> = {
  user_authored: 'User Authored',
  ai_proposed: 'AI Proposed',
  autonomous: 'Autonomous',
};

const STRATEGY_CATEGORIES = [
  'chain_of_thought',
  'tree_of_thought',
  'reflexion',
  'self_refine',
  'self_consistent',
  'chain_of_density',
  'argument_of_thought',
  'standard',
] as const;

// ── Soul System Section ──────────────────────────────────────────────

export function SoulSystemTab() {
  const queryClient = useQueryClient();

  const { data: soulConfig } = useQuery({
    queryKey: ['soulConfig'],
    queryFn: fetchSoulConfig,
  });

  // Soul config form state
  const [formEnabled, setFormEnabled] = useState(soulConfig?.enabled ?? true);
  const [formLearningMode, setFormLearningMode] = useState(
    soulConfig?.learningMode ?? ['user_authored']
  );
  const [formMaxSkills, setFormMaxSkills] = useState(soulConfig?.maxSkills ?? 100);
  const [formMaxPromptTokens, setFormMaxPromptTokens] = useState(
    soulConfig?.maxPromptTokens ?? 64000
  );

  useEffect(() => {
    if (soulConfig) {
      setFormEnabled(soulConfig.enabled);
      setFormLearningMode(soulConfig.learningMode);
      setFormMaxSkills(soulConfig.maxSkills);
      setFormMaxPromptTokens(soulConfig.maxPromptTokens);
    }
  }, [soulConfig]);

  const configMutation = useMutation({
    mutationFn: (patch: Partial<SoulConfig>) => updateSoulConfig(patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['soulConfig'] }),
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });

  const enableMut = useMutation({
    mutationFn: (id: string) => enablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => disablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => setDefaultPersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const clearDefaultMut = useMutation({
    mutationFn: () => clearDefaultPersonality(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonalities = personalities.filter((p) => p.isActive);
  const globalMaxPromptTokens = soulConfig?.maxPromptTokens ?? 16000;

  // Suppress unused-variable lint for mutations that may be used in future UI
  void enableMut;
  void disableMut;
  void setDefaultMut;
  void clearDefaultMut;

  return (
    <>
      {/* ── Soul System ───────────────────────────────────────── */}
      {soulConfig && (
        <div className="card p-4 space-y-4">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Soul System
          </h3>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">Enabled</span>
              <p className="text-xs text-muted-foreground">
                Allow soul system to influence AI responses
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formEnabled}
              onClick={() => {
                setFormEnabled(!formEnabled);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                formEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  formEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Learning mode */}
          <div>
            <span className="text-sm font-medium block mb-2">Learning Mode</span>
            <div className="space-y-1.5">
              {(['user_authored', 'ai_proposed', 'autonomous'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formLearningMode.includes(mode)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormLearningMode([...formLearningMode, mode]);
                      } else {
                        setFormLearningMode(formLearningMode.filter((m) => m !== mode));
                      }
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-sm">{LEARNING_MODE_LABELS[mode]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Numeric limits */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Max Skills</label>
              <input
                type="number"
                min={1}
                max={200}
                value={formMaxSkills}
                onChange={(e) => {
                  setFormMaxSkills(Number(e.target.value));
                }}
                className="w-full px-2 py-1.5 text-sm rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Global limit across all souls (1–200)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Default Prompt Budget</label>
              <input
                type="number"
                min={1024}
                max={100000}
                step={1024}
                value={formMaxPromptTokens}
                onChange={(e) => {
                  setFormMaxPromptTokens(Number(e.target.value));
                }}
                className="w-full px-2 py-1.5 text-sm rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Overridable per soul (1,024–100,000 tokens)
              </p>
            </div>
          </div>

          {/* Error + Save */}
          {configMutation.isError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="mt-0.5 shrink-0">✕</span>
              <span>
                Failed to save:{' '}
                {configMutation.error instanceof Error
                  ? configMutation.error.message
                  : 'Unknown error'}
              </span>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                configMutation.mutate({
                  enabled: formEnabled,
                  learningMode: formLearningMode,
                  maxSkills: formMaxSkills,
                  maxPromptTokens: formMaxPromptTokens,
                });
              }}
              disabled={configMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              {configMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ── Reasoning Strategies ──────────────────────────────── */}
      <StrategyManagementCard />

      {/* ── Active Souls ──────────────────────────────────────── */}
      {personalitiesData && (
        <div className="card">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Users2 className="w-4 h-4" />
              Active Souls
              <span className="text-xs text-muted-foreground font-normal">
                {activePersonalities.length} / {personalities.length} enabled
              </span>
            </h3>
            <Link
              to="/personality"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Manage Souls
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {personalities.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No souls configured.{' '}
                <Link to="/personality" className="text-primary hover:underline">
                  Create one
                </Link>
              </div>
            )}
            {personalities.map((p) => (
              <SoulRow key={p.id} personality={p} globalMaxPromptTokens={globalMaxPromptTokens} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Soul Row ─────────────────────────────────────────────────────────

interface SoulRowProps {
  personality: Personality;
  globalMaxPromptTokens: number;
}

function SoulRow({ personality: p, globalMaxPromptTokens }: SoulRowProps) {
  const activeHoursEnabled = p.body?.activeHours?.enabled;
  const alwaysOn = p.isActive && !activeHoursEnabled;
  const offHours = p.isActive && activeHoursEnabled && p.isWithinActiveHours === false;
  const promptBudget = p.body?.maxPromptTokens;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${p.isActive ? 'bg-success' : 'bg-muted-foreground/30'}`}
        title={p.isActive ? 'Active' : 'Inactive'}
      />

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{p.name}</span>
          {p.isActive && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">
              Active
            </span>
          )}
          {alwaysOn && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              Always On
            </span>
          )}
          {p.isDefault && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
              <Star className="w-2.5 h-2.5" />
              Default
            </span>
          )}
          {offHours && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Off-hours
            </span>
          )}
          {promptBudget !== undefined && promptBudget !== globalMaxPromptTokens && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {promptBudget.toLocaleString()} tkns
            </span>
          )}
        </div>
        {p.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>
        )}
      </div>
    </div>
  );
}

// ── Strategy Management Card ────────────────────────────────────────

function StrategyManagementCard() {
  const queryClient = useQueryClient();
  const { data: strategiesData } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => fetchStrategies(),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStrategy(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['strategies'] }),
  });
  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createStrategy>[0]) => createStrategy(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setShowForm(false);
      setFormName('');
      setFormSlug('');
      setFormCategory('chain_of_thought');
      setFormDescription('');
      setFormPrefix('');
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formCategory, setFormCategory] = useState('chain_of_thought');
  const [formDescription, setFormDescription] = useState('');
  const [formPrefix, setFormPrefix] = useState('');

  const strategies = strategiesData?.items ?? [];

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Reasoning Strategies
        </h3>
        <button
          onClick={() => {
            setShowForm((v) => !v);
          }}
          className="btn btn-ghost btn-sm text-xs flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          New
        </button>
      </div>

      {showForm && (
        <div className="space-y-2 border rounded-lg p-3">
          <input
            placeholder="Name"
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
            }}
            className="w-full px-2 py-1.5 text-sm rounded border bg-background"
          />
          <input
            placeholder="slug-like-this"
            value={formSlug}
            onChange={(e) => {
              setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
            }}
            className="w-full px-2 py-1.5 text-sm rounded border bg-background font-mono"
          />
          <select
            value={formCategory}
            onChange={(e) => {
              setFormCategory(e.target.value);
            }}
            className="w-full px-2 py-1.5 text-sm rounded border bg-background"
          >
            {STRATEGY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <input
            placeholder="Description (optional)"
            value={formDescription}
            onChange={(e) => {
              setFormDescription(e.target.value);
            }}
            className="w-full px-2 py-1.5 text-sm rounded border bg-background"
          />
          <textarea
            placeholder="Prompt prefix..."
            value={formPrefix}
            onChange={(e) => {
              setFormPrefix(e.target.value);
            }}
            rows={3}
            className="w-full px-2 py-1.5 text-sm rounded border bg-background resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowForm(false);
              }}
              className="btn btn-ghost btn-sm text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                createMutation.mutate({
                  name: formName,
                  slug: formSlug,
                  category: formCategory,
                  description: formDescription,
                  promptPrefix: formPrefix,
                });
              }}
              disabled={!formName || !formSlug || !formPrefix || createMutation.isPending}
              className="btn btn-ghost btn-sm text-xs"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-destructive">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Failed'}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1">
        {strategies.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{s.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {s.category.replace(/_/g, ' ')}
              </span>
              {s.isBuiltin && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  builtin
                </span>
              )}
            </div>
            {!s.isBuiltin && (
              <button
                onClick={() => {
                  deleteMutation.mutate(s.id);
                }}
                disabled={deleteMutation.isPending}
                className="btn btn-ghost btn-sm p-1 text-muted-foreground hover:text-destructive"
                title="Delete strategy"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {strategies.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No strategies found.</p>
        )}
      </div>
    </div>
  );
}
