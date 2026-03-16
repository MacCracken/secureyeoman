import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface WorkspaceStepProps {
  workspace: WizardState['workspace'];
  setWorkspace: WizardState['setWorkspace'];
  createWorkspaceMut: WizardState['createWorkspaceMut'];
  goBack: () => void;
  handleClose: () => void;
}

export function WorkspaceStep({
  workspace,
  setWorkspace,
  createWorkspaceMut,
  goBack,
  handleClose,
}: WorkspaceStepProps) {
  const set = (patch: Partial<typeof workspace>) => {
    setWorkspace((w) => ({ ...w, ...patch }));
  };
  const canSubmit = !!workspace.name.trim();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Workspace</h3>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={workspace.name}
          onChange={(e) => {
            set({ name: e.target.value, error: '' });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g. Engineering"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={workspace.description}
          onChange={(e) => {
            set({ description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Optional description"
        />
      </div>

      {workspace.error && <p className="text-xs text-destructive">{workspace.error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!canSubmit || createWorkspaceMut.isPending}
          className="btn btn-ghost"
          onClick={() => {
            createWorkspaceMut.mutate({
              name: workspace.name.trim(),
              description: workspace.description.trim() || undefined,
            });
          }}
        >
          {createWorkspaceMut.isPending ? 'Creating...' : 'Create Workspace'}
        </button>
      </div>
    </div>
  );
}
