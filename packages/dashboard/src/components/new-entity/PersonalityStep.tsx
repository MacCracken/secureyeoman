import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface PersonalityStepProps {
  personality: WizardState['personality'];
  setPersonality: WizardState['setPersonality'];
  modelsByProvider: WizardState['modelsByProvider'];
  goBack: () => void;
  handleClose: () => void;
  navigateTo: (path: string) => void;
}

export function PersonalityStep({
  personality,
  setPersonality,
  modelsByProvider,
  goBack,
  handleClose,
  navigateTo,
}: PersonalityStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Personality</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={personality.name}
          onChange={(e) => {
            setPersonality({ ...personality, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Coding Assistant"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={personality.description}
          onChange={(e) => {
            setPersonality({ ...personality, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Optional description"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Model</label>
        {Object.keys(modelsByProvider).length > 0 ? (
          <select
            value={personality.model}
            onChange={(e) => {
              setPersonality({ ...personality, model: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
          >
            <option value="">Default (system)</option>
            {Object.entries(modelsByProvider).map(([provider, models]) => (
              <optgroup key={provider} label={provider}>
                {models.map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.model}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={personality.model}
            onChange={(e) => {
              setPersonality({ ...personality, model: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="e.g., claude-3-5-sonnet-20241022"
          />
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!personality.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/personality?create=true&name=${encodeURIComponent(personality.name)}&description=${encodeURIComponent(personality.description)}&model=${encodeURIComponent(personality.model)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}
