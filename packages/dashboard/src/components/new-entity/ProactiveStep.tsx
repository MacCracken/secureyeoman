import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface ProactiveStepProps {
  proactive: WizardState['proactive'];
  setProactive: WizardState['setProactive'];
  createTriggerMut: WizardState['createTriggerMut'];
  goBack: () => void;
  handleClose: () => void;
}

export function ProactiveStep({
  proactive,
  setProactive,
  createTriggerMut,
  goBack,
  handleClose,
}: ProactiveStepProps) {
  const set = (patch: Partial<typeof proactive>) => {
    setProactive((p) => ({ ...p, ...patch }));
  };
  const canSubmit = !!proactive.name.trim() && !!proactive.actionContent.trim();

  const handleSubmit = () => {
    const condition =
      proactive.type === 'schedule'
        ? { type: 'schedule' as const, cron: proactive.cron, timezone: 'UTC' }
        : proactive.type === 'event'
          ? { type: 'event' as const, eventType: proactive.eventType }
          : proactive.type === 'pattern'
            ? { type: 'pattern' as const, patternId: '', minConfidence: 0.7 }
            : proactive.type === 'webhook'
              ? { type: 'webhook' as const, path: '/proactive/hook', method: 'POST' as const }
              : {
                  type: 'llm' as const,
                  prompt: proactive.actionContent,
                  evaluationIntervalMs: 3600000,
                };

    const action =
      proactive.actionType === 'message'
        ? { type: 'message' as const, content: proactive.actionContent }
        : { type: 'remind' as const, content: proactive.actionContent, category: 'user_trigger' };

    createTriggerMut.mutate({
      name: proactive.name,
      enabled: true,
      type: proactive.type,
      condition,
      action,
      approvalMode: proactive.approvalMode,
      cooldownMs: 0,
      limitPerDay: 0,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Proactive Trigger</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={proactive.name}
            onChange={(e) => {
              set({ name: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="My trigger"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={proactive.type}
            onChange={(e) => {
              set({ type: e.target.value as typeof proactive.type });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
          >
            <option value="schedule">Schedule (Cron)</option>
            <option value="event">Event</option>
            <option value="pattern">Pattern</option>
            <option value="webhook">Webhook</option>
            <option value="llm">LLM</option>
          </select>
        </div>
      </div>

      {proactive.type === 'schedule' && (
        <div>
          <label className="block text-sm font-medium mb-1">Cron Expression</label>
          <input
            type="text"
            value={proactive.cron}
            onChange={(e) => {
              set({ cron: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background font-mono"
            placeholder="0 9 * * 1-5"
          />
        </div>
      )}

      {proactive.type === 'event' && (
        <div>
          <label className="block text-sm font-medium mb-1">Event Type</label>
          <input
            type="text"
            value={proactive.eventType}
            onChange={(e) => {
              set({ eventType: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="integration_disconnected"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Action Type</label>
          <select
            value={proactive.actionType}
            onChange={(e) => {
              set({ actionType: e.target.value as typeof proactive.actionType });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
          >
            <option value="message">Message</option>
            <option value="remind">Remind</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Approval Mode</label>
          <select
            value={proactive.approvalMode}
            onChange={(e) => {
              set({ approvalMode: e.target.value as typeof proactive.approvalMode });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
          >
            <option value="auto">Auto-execute</option>
            <option value="suggest">Suggest first</option>
            <option value="manual">Manual only</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Content *</label>
        <textarea
          value={proactive.actionContent}
          onChange={(e) => {
            set({ actionContent: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background font-mono text-sm resize-none"
          rows={3}
          placeholder="Enter the message or reminder content..."
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!canSubmit || createTriggerMut.isPending}
          className="btn btn-ghost"
          onClick={handleSubmit}
        >
          {createTriggerMut.isPending ? 'Creating...' : 'Create Trigger'}
        </button>
      </div>
    </div>
  );
}
