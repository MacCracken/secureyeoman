import { X } from 'lucide-react';
import { useWizardState } from './useWizardState';
import { SelectStep } from './SelectStep';
import { PersonalityStep } from './PersonalityStep';
import { TaskStep } from './TaskStep';
import { SkillStep } from './SkillStep';
import { ExperimentStep } from './ExperimentStep';
import { SubAgentStep } from './SubAgentStep';
import { CustomRoleStep } from './CustomRoleStep';
import { ProactiveStep } from './ProactiveStep';
import { ExtensionStep } from './ExtensionStep';
import { UserStep } from './UserStep';
import { WorkspaceStep } from './WorkspaceStep';
import { MemoryStep } from './MemoryStep';
import { IntentStep } from './IntentStep';
import type { NewEntityDialogProps } from './types';

export function NewEntityDialog({ open, onClose }: NewEntityDialogProps) {
  const w = useWizardState(onClose);

  const renderContent = () => {
    switch (w.step) {
      case 'select':
        return (
          <SelectStep setStep={w.setStep} navigateTo={w.navigateTo} />
        );
      case 'personality':
        return (
          <PersonalityStep
            personality={w.personality}
            setPersonality={w.setPersonality}
            modelsByProvider={w.modelsByProvider}
            goBack={w.goBack}
            handleClose={w.handleClose}
            navigateTo={w.navigateTo}
          />
        );
      case 'task':
        return (
          <TaskStep
            task={w.task}
            setTask={w.setTask}
            goBack={w.goBack}
            handleClose={w.handleClose}
            navigateTo={w.navigateTo}
          />
        );
      case 'skill':
        return (
          <SkillStep
            skill={w.skill}
            setSkill={w.setSkill}
            goBack={w.goBack}
            handleClose={w.handleClose}
            navigateTo={w.navigateTo}
          />
        );
      case 'experiment':
        return (
          <ExperimentStep
            experiment={w.experiment}
            setExperiment={w.setExperiment}
            goBack={w.goBack}
            handleClose={w.handleClose}
            navigateTo={w.navigateTo}
          />
        );
      case 'sub-agent':
        return (
          <SubAgentStep
            subAgent={w.subAgent}
            setSubAgent={w.setSubAgent}
            goBack={w.goBack}
            handleClose={w.handleClose}
            navigateTo={w.navigateTo}
          />
        );
      case 'custom-role':
        return (
          <CustomRoleStep
            customRole={w.customRole}
            setCustomRole={w.setCustomRole}
            goBack={w.goBack}
            handleClose={w.handleClose}
            navigateTo={w.navigateTo}
          />
        );
      case 'proactive':
        return (
          <ProactiveStep
            proactive={w.proactive}
            setProactive={w.setProactive}
            createTriggerMut={w.createTriggerMut}
            goBack={w.goBack}
            handleClose={w.handleClose}
          />
        );
      case 'extension':
        return (
          <ExtensionStep
            extension={w.extension}
            setExtension={w.setExtension}
            registerExtensionMut={w.registerExtensionMut}
            goBack={w.goBack}
            handleClose={w.handleClose}
          />
        );
      case 'user':
        return (
          <UserStep
            user={w.user}
            setUser={w.setUser}
            createUserMut={w.createUserMut}
            goBack={w.goBack}
            handleClose={w.handleClose}
          />
        );
      case 'workspace':
        return (
          <WorkspaceStep
            workspace={w.workspace}
            setWorkspace={w.setWorkspace}
            createWorkspaceMut={w.createWorkspaceMut}
            goBack={w.goBack}
            handleClose={w.handleClose}
          />
        );
      case 'memory':
        return (
          <MemoryStep
            memory={w.memory}
            setMemory={w.setMemory}
            addMemoryMut={w.addMemoryMut}
            learnKnowledgeMut={w.learnKnowledgeMut}
            goBack={w.goBack}
            handleClose={w.handleClose}
          />
        );
      case 'intent':
        return (
          <IntentStep
            intent={w.intent}
            setIntent={w.setIntent}
            createIntentMut={w.createIntentMut}
            goBack={w.goBack}
            handleClose={w.handleClose}
          />
        );
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={w.handleClose}
    >
      <div
        className="bg-background border rounded-t-2xl sm:rounded-xl p-4 sm:p-6 w-full sm:max-w-xl md:max-w-2xl shadow-xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Create New</h3>
          <button onClick={w.handleClose} className="btn-ghost p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
