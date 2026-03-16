import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface SubAgentStepProps {
  subAgent: WizardState['subAgent'];
  setSubAgent: WizardState['setSubAgent'];
  goBack: () => void;
  handleClose: () => void;
  navigateTo: (path: string) => void;
}

export function SubAgentStep({
  subAgent,
  setSubAgent,
  goBack,
  handleClose,
  navigateTo,
}: SubAgentStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Sub-Agent</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={subAgent.name}
          onChange={(e) => {
            setSubAgent({ ...subAgent, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Research Agent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={subAgent.description}
          onChange={(e) => {
            setSubAgent({ ...subAgent, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What this agent specialises in"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Opens the Agents page where you can configure the full agent profile.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!subAgent.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/agents?create=true&tab=profiles&name=${encodeURIComponent(subAgent.name)}&description=${encodeURIComponent(subAgent.description)}`
            );
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
