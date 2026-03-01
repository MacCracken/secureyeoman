import { useState, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Puzzle, FlaskConical, BookOpen, Brain, Lock, BarChart2, Bell } from 'lucide-react';
import { ExtensionsPage } from './ExtensionsPage';
import { ExperimentsPage } from './ExperimentsPage';
import { StorybookPage } from './StorybookPage';
import { TrainingTab } from './TrainingTab';
import { GatewayAnalyticsTab } from './gateway/GatewayAnalyticsTab';
import { fetchSecurityPolicy } from '../api/client';

const AlertRulesTab = lazy(() =>
  import('./telemetry/AlertRulesTab').then((m) => ({ default: m.AlertRulesTab }))
);

type DevTab = 'extensions' | 'experiments' | 'storybook' | 'training' | 'gateway' | 'alerts';

export function DeveloperPage() {
  const [activeTab, setActiveTab] = useState<DevTab>('extensions');

  const { data: policy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    retry: false,
  });

  const trainingEnabled = policy?.allowTrainingExport ?? false;

  const tabs: { id: DevTab; label: string; icon: React.ReactNode; hidden?: boolean }[] = [
    { id: 'extensions', label: 'Extensions', icon: <Puzzle className="w-4 h-4" /> },
    { id: 'experiments', label: 'Experiments', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'storybook', label: 'Storybook', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'training', label: 'Training', icon: <Brain className="w-4 h-4" />, hidden: !trainingEnabled },
    { id: 'gateway', label: 'Gateway Analytics', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'alerts', label: 'Alert Rules', icon: <Bell className="w-4 h-4" /> },
  ];

  const visibleTabs = tabs.filter((t) => !t.hidden);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Developers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Extensions, experiments, component tools, and training data export
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
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

      {activeTab === 'extensions' ? (
        <ExtensionsPage />
      ) : activeTab === 'experiments' ? (
        <ExperimentsPage />
      ) : activeTab === 'training' ? (
        trainingEnabled ? (
          <TrainingTab />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Lock className="w-8 h-8" />
            <p className="text-sm">Training export is disabled. Enable it in Security settings.</p>
          </div>
        )
      ) : activeTab === 'gateway' ? (
        <GatewayAnalyticsTab />
      ) : activeTab === 'alerts' ? (
        <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}>
          <AlertRulesTab />
        </Suspense>
      ) : (
        <StorybookPage />
      )}
    </div>
  );
}
