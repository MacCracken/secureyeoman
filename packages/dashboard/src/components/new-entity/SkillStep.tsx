import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface SkillStepProps {
  skill: WizardState['skill'];
  setSkill: WizardState['setSkill'];
  goBack: () => void;
  handleClose: () => void;
  navigateTo: (path: string) => void;
}

export function SkillStep({ skill, setSkill, goBack, handleClose, navigateTo }: SkillStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Skill</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={skill.name}
          onChange={(e) => {
            setSkill({ ...skill, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Git Helper"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={skill.description}
          onChange={(e) => {
            setSkill({ ...skill, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What this skill does"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Trigger</label>
        <input
          type="text"
          value={skill.trigger}
          onChange={(e) => {
            setSkill({ ...skill, trigger: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., /git or on_push"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Action</label>
        <textarea
          value={skill.action}
          onChange={(e) => {
            setSkill({ ...skill, action: e.target.value });
          }}
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
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/skills?create=true&name=${encodeURIComponent(skill.name)}&description=${encodeURIComponent(skill.description)}&trigger=${encodeURIComponent(skill.trigger)}&action=${encodeURIComponent(skill.action)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}
