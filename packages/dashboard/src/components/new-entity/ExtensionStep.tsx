import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface ExtensionStepProps {
  extension: WizardState['extension'];
  setExtension: WizardState['setExtension'];
  registerExtensionMut: WizardState['registerExtensionMut'];
  goBack: () => void;
  handleClose: () => void;
}

export function ExtensionStep({
  extension,
  setExtension,
  registerExtensionMut,
  goBack,
  handleClose,
}: ExtensionStepProps) {
  const set = (patch: Partial<typeof extension>) => {
    setExtension((e) => ({ ...e, ...patch }));
  };
  const canSubmit =
    !!extension.id.trim() && !!extension.name.trim() && !!extension.version.trim();

  const handleSubmit = () => {
    const hooks = extension.hooksText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [point, semantics, priority] = line.split(',').map((s) => s.trim());
        return { point, semantics, priority: priority ? parseInt(priority, 10) : undefined };
      });

    registerExtensionMut.mutate({
      id: extension.id.trim(),
      name: extension.name.trim(),
      version: extension.version.trim(),
      hooks,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Extension</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Extension ID *</label>
          <input
            type="text"
            value={extension.id}
            onChange={(e) => {
              set({ id: e.target.value, error: '' });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="e.g. my-extension"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Version *</label>
          <input
            type="text"
            value={extension.version}
            onChange={(e) => {
              set({ version: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background font-mono"
            placeholder="1.0.0"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={extension.name}
          onChange={(e) => {
            set({ name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="My Extension"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Hooks</label>
        <textarea
          value={extension.hooksText}
          onChange={(e) => {
            set({ hooksText: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background font-mono text-sm resize-none"
          rows={3}
          placeholder={'pre-chat, observe, 10\npost-task, transform, 20'}
        />
        <p className="text-xs text-muted-foreground mt-1">
          One per line: point, semantics, priority (optional)
        </p>
      </div>

      {extension.error && <p className="text-xs text-destructive">{extension.error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!canSubmit || registerExtensionMut.isPending}
          className="btn btn-ghost"
          onClick={handleSubmit}
        >
          {registerExtensionMut.isPending ? 'Registering...' : 'Register Extension'}
        </button>
      </div>
    </div>
  );
}
