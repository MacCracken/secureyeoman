import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface UserStepProps {
  user: WizardState['user'];
  setUser: WizardState['setUser'];
  createUserMut: WizardState['createUserMut'];
  goBack: () => void;
  handleClose: () => void;
}

export function UserStep({
  user,
  setUser,
  createUserMut,
  goBack,
  handleClose,
}: UserStepProps) {
  const set = (patch: Partial<typeof user>) => {
    setUser((u) => ({ ...u, ...patch }));
  };
  const canSubmit = !!user.email.trim() && !!user.displayName.trim() && !!user.password.trim();

  const handleSubmit = () => {
    createUserMut.mutate({
      email: user.email.trim(),
      displayName: user.displayName.trim(),
      password: user.password,
      isAdmin: user.isAdmin,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New User</h3>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Email *</label>
        <input
          type="email"
          value={user.email}
          onChange={(e) => {
            set({ email: e.target.value, error: '' });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="user@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Display Name *</label>
        <input
          type="text"
          value={user.displayName}
          onChange={(e) => {
            set({ displayName: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Jane Doe"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Password *</label>
        <input
          type="password"
          value={user.password}
          onChange={(e) => {
            set({ password: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="••••••••"
        />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={user.isAdmin}
          onChange={(e) => {
            set({ isAdmin: e.target.checked });
          }}
          className="rounded"
        />
        Admin
      </label>

      {user.error && <p className="text-xs text-destructive">{user.error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!canSubmit || createUserMut.isPending}
          className="btn btn-ghost"
          onClick={handleSubmit}
        >
          {createUserMut.isPending ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </div>
  );
}
