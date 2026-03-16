import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface ExperimentStepProps {
  experiment: WizardState['experiment'];
  setExperiment: WizardState['setExperiment'];
  goBack: () => void;
  handleClose: () => void;
  navigateTo: (path: string) => void;
}

export function ExperimentStep({
  experiment,
  setExperiment,
  goBack,
  handleClose,
  navigateTo,
}: ExperimentStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Experiment</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={experiment.name}
          onChange={(e) => {
            setExperiment({ ...experiment, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., New Voice UI"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={experiment.description}
          onChange={(e) => {
            setExperiment({ ...experiment, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What you're testing"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Creates an experiment with Control and Variant A variants (50% traffic each).
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!experiment.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/experiments?create=true&name=${encodeURIComponent(experiment.name)}&description=${encodeURIComponent(experiment.description)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}
