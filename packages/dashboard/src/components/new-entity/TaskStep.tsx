import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface TaskStepProps {
  task: WizardState['task'];
  setTask: WizardState['setTask'];
  goBack: () => void;
  handleClose: () => void;
  navigateTo: (path: string) => void;
}

export function TaskStep({ task, setTask, goBack, handleClose, navigateTo }: TaskStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Task</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={task.name}
          onChange={(e) => {
            setTask({ ...task, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Run backup"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={task.type}
          onChange={(e) => {
            setTask({ ...task, type: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
        >
          <option value="execute">Execute</option>
          <option value="query">Query</option>
          <option value="file">File</option>
          <option value="network">Network</option>
          <option value="system">System</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={task.description}
          onChange={(e) => {
            setTask({ ...task, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Optional description"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Input (JSON)</label>
        <textarea
          value={task.input}
          onChange={(e) => {
            setTask({ ...task, input: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background font-mono text-sm"
          rows={3}
          placeholder='{"key": "value"}'
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!task.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/automation?create=true&name=${encodeURIComponent(task.name)}&type=${encodeURIComponent(task.type)}&description=${encodeURIComponent(task.description)}&input=${encodeURIComponent(task.input)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}
