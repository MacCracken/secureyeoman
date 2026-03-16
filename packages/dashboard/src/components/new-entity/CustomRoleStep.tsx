import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface CustomRoleStepProps {
  customRole: WizardState['customRole'];
  setCustomRole: WizardState['setCustomRole'];
  goBack: () => void;
  handleClose: () => void;
  navigateTo: (path: string) => void;
}

export function CustomRoleStep({
  customRole,
  setCustomRole,
  goBack,
  handleClose,
  navigateTo,
}: CustomRoleStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Custom Role</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Role Name *</label>
        <input
          type="text"
          value={customRole.name}
          onChange={(e) => {
            setCustomRole({ ...customRole, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Data Analyst"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={customRole.description}
          onChange={(e) => {
            setCustomRole({ ...customRole, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Role purpose and capabilities"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Opens Security Settings where you can assign permissions to this role.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!customRole.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/settings?tab=security&create=true&name=${encodeURIComponent(customRole.name)}&description=${encodeURIComponent(customRole.description)}`
            );
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
