import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, Zap, ListTodo, FlaskConical, ChevronDown, X } from 'lucide-react';
import { fetchModelInfo } from '../api/client';

type DialogStep = 'select' | 'personality' | 'task' | 'skill' | 'experiment';

interface NewEntityDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewEntityDialog({ open, onClose }: NewEntityDialogProps) {
  const [step, setStep] = useState<DialogStep>('select');
  const [personality, setPersonality] = useState({ name: '', description: '', model: '' });
  const [task, setTask] = useState({ name: '', type: 'execute', description: '', input: '' });
  const [skill, setSkill] = useState({ name: '', description: '', trigger: '', action: '' });
  const [experiment, setExperiment] = useState({ name: '', description: '' });

  const { data: modelInfo } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: fetchModelInfo,
  });

  const modelsByProvider = modelInfo?.available ?? {};

  const reset = () => {
    setStep('select');
    setPersonality({ name: '', description: '', model: '' });
    setTask({ name: '', type: 'execute', description: '', input: '' });
    setSkill({ name: '', description: '', trigger: '', action: '' });
    setExperiment({ name: '', description: '' });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const goBack = () => setStep('select');

  const navigateTo = (path: string) => {
    handleClose();
    window.location.href = path;
  };

  const renderSelect = () => (
    <div className="grid grid-cols-2 gap-3">
      {[
        {
          key: 'personality',
          icon: Brain,
          label: 'Personality',
          desc: 'Create a new AI personality',
        },
        { key: 'task', icon: ListTodo, label: 'Task', desc: 'Schedule a new task' },
        { key: 'skill', icon: Zap, label: 'Skill', desc: 'Create a new skill' },
        { key: 'experiment', icon: FlaskConical, label: 'Experiment', desc: 'Try a new feature' },
      ].map(({ key, icon: Icon, label, desc }) => (
        <button
          key={key}
          onClick={() => setStep(key as DialogStep)}
          className="p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left"
        >
          <Icon className="w-6 h-6 mb-2 text-primary" />
          <div className="font-medium">{label}</div>
          <div className="text-xs text-muted">{desc}</div>
        </button>
      ))}
    </div>
  );

  const renderPersonality = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Personality</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={personality.name}
          onChange={(e) => setPersonality({ ...personality, name: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Coding Assistant"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={personality.description}
          onChange={(e) => setPersonality({ ...personality, description: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Optional description"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Model</label>
        {Object.keys(modelsByProvider).length > 0 ? (
          <select
            value={personality.model}
            onChange={(e) => setPersonality({ ...personality, model: e.target.value })}
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
            onChange={(e) => setPersonality({ ...personality, model: e.target.value })}
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
          className="btn btn-primary"
          onClick={() =>
            navigateTo(
              `/personality?create=true&name=${encodeURIComponent(personality.name)}&description=${encodeURIComponent(personality.description)}&model=${encodeURIComponent(personality.model)}`
            )
          }
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderTask = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Task</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={task.name}
          onChange={(e) => setTask({ ...task, name: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Run backup"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={task.type}
          onChange={(e) => setTask({ ...task, type: e.target.value })}
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
          onChange={(e) => setTask({ ...task, description: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Optional description"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Input (JSON)</label>
        <textarea
          value={task.input}
          onChange={(e) => setTask({ ...task, input: e.target.value })}
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
          className="btn btn-primary"
          onClick={() =>
            navigateTo(
              `/tasks?create=true&name=${encodeURIComponent(task.name)}&type=${encodeURIComponent(task.type)}&description=${encodeURIComponent(task.description)}&input=${encodeURIComponent(task.input)}`
            )
          }
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderSkill = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Skill</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={skill.name}
          onChange={(e) => setSkill({ ...skill, name: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Git Helper"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={skill.description}
          onChange={(e) => setSkill({ ...skill, description: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What this skill does"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Trigger</label>
        <input
          type="text"
          value={skill.trigger}
          onChange={(e) => setSkill({ ...skill, trigger: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., /git or on_push"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Action</label>
        <textarea
          value={skill.action}
          onChange={(e) => setSkill({ ...skill, action: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background font-mono text-sm"
          rows={3}
          placeholder="What the skill does..."
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!skill.name.trim()}
          className="btn btn-primary"
          onClick={() =>
            navigateTo(
              `/skills?create=true&name=${encodeURIComponent(skill.name)}&description=${encodeURIComponent(skill.description)}&trigger=${encodeURIComponent(skill.trigger)}&action=${encodeURIComponent(skill.action)}`
            )
          }
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderExperiment = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Experiment</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={experiment.name}
          onChange={(e) => setExperiment({ ...experiment, name: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., New Voice UI"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={experiment.description}
          onChange={(e) => setExperiment({ ...experiment, description: e.target.value })}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What you're testing"
        />
      </div>
      <p className="text-xs text-muted">
        Creates an experiment with Control and Variant A variants (50% traffic each).
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!experiment.name.trim()}
          className="btn btn-primary"
          onClick={() =>
            navigateTo(
              `/experiments?create=true&name=${encodeURIComponent(experiment.name)}&description=${encodeURIComponent(experiment.description)}`
            )
          }
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case 'select':
        return renderSelect();
      case 'personality':
        return renderPersonality();
      case 'task':
        return renderTask();
      case 'skill':
        return renderSkill();
      case 'experiment':
        return renderExperiment();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-background border rounded-lg p-6 w-full max-w-md shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Create New</h3>
          <button onClick={handleClose} className="btn-ghost p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
