/**
 * TrainingTab — Training dataset export, distillation, and fine-tuning UI.
 *
 * Sub-tabs:
 *   Export     — Download conversations as ShareGPT/Instruction/Raw text
 *   Distillation — Run teacher-student distillation jobs
 *   Fine-tune  — LoRA/QLoRA fine-tuning via Docker sidecar
 */

import { useState, lazy, Suspense } from 'react';
import {
  Download,
  Brain,
  Layers,
  Activity,
  Monitor,
  Loader2,
  Scale,
  ThumbsUp,
  FlaskConical,
  Rocket,
} from 'lucide-react';
import { FeatureLock } from './FeatureLock';
import type { TabType } from './training/constants';
import { ExportTab } from './training/ExportTab';
import { DistillationTab } from './training/DistillationTab';
import { FinetuneTab } from './training/FinetuneTab';
import { LiveTab } from './training/LiveTab';
import { ComputerUseTab } from './training/ComputerUseTab';

// Re-export for consumers that import from this file
export { EvalResultRadarCard } from './training/EvalResultRadarCard';

const EvaluationTab = lazy(() =>
  import('./training/EvaluationTab').then((m) => ({ default: m.EvaluationTab }))
);
const PreferencesTab = lazy(() =>
  import('./training/PreferencesTab').then((m) => ({ default: m.PreferencesTab }))
);
const ExperimentsTab = lazy(() =>
  import('./training/ExperimentsTab').then((m) => ({ default: m.ExperimentsTab }))
);
const DeploymentTab = lazy(() =>
  import('./training/DeploymentTab').then((m) => ({ default: m.DeploymentTab }))
);

export function TrainingTab() {
  const [activeTab, setActiveTab] = useState<TabType>('export');

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
    { id: 'distillation', label: 'Distillation', icon: <Brain className="w-4 h-4" /> },
    { id: 'finetune', label: 'Fine-tune', icon: <Layers className="w-4 h-4" /> },
    { id: 'live', label: 'Live', icon: <Activity className="w-4 h-4" /> },
    { id: 'computer-use', label: 'Computer Use', icon: <Monitor className="w-4 h-4" /> },
    { id: 'evaluation', label: 'Evaluation', icon: <Scale className="w-4 h-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <ThumbsUp className="w-4 h-4" /> },
    { id: 'experiments', label: 'Experiments', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'deployment', label: 'Deployment', icon: <Rocket className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab pill nav */}
      <div
        role="tablist"
        aria-label="Training views"
        className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'export' && <ExportTab />}
      {activeTab === 'distillation' && (
        <FeatureLock feature="adaptive_learning">
          <DistillationTab />
        </FeatureLock>
      )}
      {activeTab === 'finetune' && (
        <FeatureLock feature="adaptive_learning">
          <FinetuneTab />
        </FeatureLock>
      )}
      {activeTab === 'live' && <LiveTab />}
      {activeTab === 'computer-use' && <ComputerUseTab />}
      {activeTab === 'evaluation' && (
        <Suspense
          fallback={
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading evaluation...
            </div>
          }
        >
          <EvaluationTab />
        </Suspense>
      )}
      {activeTab === 'preferences' && (
        <Suspense
          fallback={
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading preferences...
            </div>
          }
        >
          <PreferencesTab />
        </Suspense>
      )}
      {activeTab === 'experiments' && (
        <Suspense
          fallback={
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading experiments...
            </div>
          }
        >
          <ExperimentsTab />
        </Suspense>
      )}
      {activeTab === 'deployment' && (
        <Suspense
          fallback={
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading deployment...
            </div>
          }
        >
          <DeploymentTab />
        </Suspense>
      )}
    </div>
  );
}
