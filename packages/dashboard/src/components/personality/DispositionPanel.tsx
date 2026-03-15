import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Disposition trait definitions grouped by category. */
export interface TraitDef {
  key: string;
  label: string;
  options: string[];
  category: 'communication' | 'emotional' | 'cognitive' | 'professional';
  description: string;
}

export const TRAIT_DEFS: TraitDef[] = [
  // Communication — 5 levels: far-left → left → balanced → right → far-right
  {
    key: 'formality',
    label: 'Formality',
    options: ['street', 'casual', 'balanced', 'formal', 'ceremonial'],
    category: 'communication',
    description: 'Language register and tone',
  },
  {
    key: 'humor',
    label: 'Humor',
    options: ['deadpan', 'dry', 'balanced', 'witty', 'comedic'],
    category: 'communication',
    description: 'Use of humor in responses',
  },
  {
    key: 'verbosity',
    label: 'Verbosity',
    options: ['terse', 'concise', 'balanced', 'detailed', 'exhaustive'],
    category: 'communication',
    description: 'Response length and depth',
  },
  {
    key: 'directness',
    label: 'Directness',
    options: ['evasive', 'diplomatic', 'balanced', 'candid', 'blunt'],
    category: 'communication',
    description: 'How directly opinions are stated',
  },
  // Emotional
  {
    key: 'warmth',
    label: 'Warmth',
    options: ['cold', 'reserved', 'balanced', 'friendly', 'effusive'],
    category: 'emotional',
    description: 'Emotional tone and approachability',
  },
  {
    key: 'empathy',
    label: 'Empathy',
    options: ['detached', 'analytical', 'balanced', 'empathetic', 'compassionate'],
    category: 'emotional',
    description: 'Emotional awareness and response',
  },
  {
    key: 'patience',
    label: 'Patience',
    options: ['brisk', 'efficient', 'balanced', 'patient', 'nurturing'],
    category: 'emotional',
    description: 'Willingness to repeat and re-explain',
  },
  {
    key: 'confidence',
    label: 'Confidence',
    options: ['humble', 'modest', 'balanced', 'assertive', 'authoritative'],
    category: 'emotional',
    description: 'Self-assurance in responses',
  },
  // Cognitive
  {
    key: 'creativity',
    label: 'Creativity',
    options: ['rigid', 'conventional', 'balanced', 'imaginative', 'avant-garde'],
    category: 'cognitive',
    description: 'Novelty and originality of ideas',
  },
  {
    key: 'risk_tolerance',
    label: 'Risk Tolerance',
    options: ['risk-averse', 'cautious', 'balanced', 'bold', 'reckless'],
    category: 'cognitive',
    description: 'Willingness to suggest unconventional solutions',
  },
  {
    key: 'curiosity',
    label: 'Curiosity',
    options: ['narrow', 'focused', 'balanced', 'curious', 'exploratory'],
    category: 'cognitive',
    description: 'Tendency to ask follow-up questions and explore tangents',
  },
  {
    key: 'skepticism',
    label: 'Skepticism',
    options: ['gullible', 'trusting', 'balanced', 'skeptical', 'contrarian'],
    category: 'cognitive',
    description: 'How readily claims are accepted vs questioned',
  },
  // Professional
  {
    key: 'autonomy',
    label: 'Autonomy',
    options: ['dependent', 'consultative', 'balanced', 'proactive', 'autonomous'],
    category: 'professional',
    description: 'Initiative in taking action without explicit requests',
  },
  {
    key: 'pedagogy',
    label: 'Pedagogy',
    options: ['terse-answer', 'answer-focused', 'balanced', 'explanatory', 'socratic'],
    category: 'professional',
    description: 'Tendency to explain reasoning vs just giving answers',
  },
  {
    key: 'precision',
    label: 'Precision',
    options: ['approximate', 'loose', 'balanced', 'precise', 'meticulous'],
    category: 'professional',
    description: 'Attention to exact details and edge cases',
  },
];

export const TRAIT_CATEGORIES: { key: TraitDef['category']; label: string }[] = [
  { key: 'communication', label: 'Communication' },
  { key: 'emotional', label: 'Emotional' },
  { key: 'cognitive', label: 'Cognitive' },
  { key: 'professional', label: 'Professional' },
];

/** Core traits shown by default (the original 3). */
export const CORE_TRAIT_KEYS = new Set(['formality', 'humor', 'verbosity']);

/** Inline widget for adding arbitrary custom traits not in the predefined list. */
function CustomTraitInput({
  traits,
  knownKeys,
  onAdd,
  onRemove,
}: {
  traits: Record<string, string>;
  knownKeys: Set<string>;
  onAdd: (key: string, value: string) => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  // Show existing custom traits (keys not in TRAIT_DEFS)
  const customEntries = Object.entries(traits).filter(([k]) => !knownKeys.has(k));

  const handleAdd = () => {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_');
    const value = newValue.trim().toLowerCase();
    if (key && value) {
      onAdd(key, value);
      setNewKey('');
      setNewValue('');
    }
  };

  return (
    <div className="space-y-2">
      {customEntries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground sm:w-28">{k}</span>
          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded border border-primary">
            {v}
          </span>
          <button
            onClick={() => {
              onRemove(k);
            }}
            className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-destructive"
            title="Remove custom trait"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          className="bg-background border border-border rounded px-2 py-1 text-xs w-28"
          placeholder="trait name"
          value={newKey}
          onChange={(e) => {
            setNewKey(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <input
          className="bg-background border border-border rounded px-2 py-1 text-xs w-28"
          placeholder="value"
          value={newValue}
          onChange={(e) => {
            setNewValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          className="btn btn-ghost text-xs px-2 py-1 disabled:opacity-30"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

/** Disposition editor — expandable trait grid with core + advanced categories. */
export function DispositionEditor({
  traits,
  onChange,
}: {
  traits: Record<string, string>;
  onChange: (traits: Record<string, string>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Count how many advanced traits are set (non-core with a value)
  const advancedSetCount = TRAIT_DEFS.filter(
    (t) => !CORE_TRAIT_KEYS.has(t.key) && traits[t.key]
  ).length;

  const setTrait = (key: string, value: string) => {
    onChange({ ...traits, [key]: value });
  };

  const clearTrait = (key: string) => {
    const { [key]: _, ...next } = traits;
    onChange(next);
  };

  const renderTraitRow = (def: TraitDef) => {
    const selected = traits[def.key];
    const isCore = CORE_TRAIT_KEYS.has(def.key);
    return (
      <div key={def.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
        <div className="sm:w-28 flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground" title={def.description}>
            {def.label}
          </span>
        </div>
        <div className="flex gap-1 flex-wrap items-center">
          {def.options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                setTrait(def.key, opt);
              }}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                selected === opt
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted'
              }`}
            >
              {opt}
            </button>
          ))}
          {!isCore && selected && (
            <button
              onClick={() => {
                clearTrait(def.key);
              }}
              className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-destructive"
              title="Clear trait"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  };

  // Core traits (always visible)
  const coreTraits = TRAIT_DEFS.filter((t) => CORE_TRAIT_KEYS.has(t.key));

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Disposition</label>

      {/* Core traits */}
      <div className="space-y-2 mb-3">{coreTraits.map(renderTraitRow)}</div>

      {/* Advanced toggle */}
      <button
        onClick={() => {
          setShowAdvanced((v) => !v);
        }}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-3 transition-colors"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? '' : '-rotate-90'}`}
        />
        Advanced traits
        {advancedSetCount > 0 && (
          <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">
            {advancedSetCount} set
          </span>
        )}
      </button>

      {/* Advanced traits by category */}
      {showAdvanced && (
        <div className="space-y-4 pl-2 border-l-2 border-border">
          {TRAIT_CATEGORIES.filter((cat) => cat.key !== 'communication' || true).map((cat) => {
            const catTraits = TRAIT_DEFS.filter(
              (t) => t.category === cat.key && !CORE_TRAIT_KEYS.has(t.key)
            );
            if (catTraits.length === 0) return null;
            return (
              <div key={cat.key}>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  {cat.label}
                </h4>
                <div className="space-y-2">{catTraits.map(renderTraitRow)}</div>
              </div>
            );
          })}

          {/* Custom trait input */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Custom
            </h4>
            <CustomTraitInput
              traits={traits}
              knownKeys={new Set(TRAIT_DEFS.map((t) => t.key))}
              onAdd={(key, value) => {
                setTrait(key, value);
              }}
              onRemove={clearTrait}
            />
          </div>
        </div>
      )}
    </div>
  );
}
