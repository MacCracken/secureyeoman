/**
 * AutomationPage — Unified Tasks + Workflows management view.
 * Consolidates the former separate /tasks and /workflows sidebar entries into a
 * single page with a Tasks | Workflows tab switcher.
 */

import { useState } from 'react';
import { Layers } from 'lucide-react';
import { TaskHistory } from '../components/TaskHistory';
import { WorkflowsPage } from './WorkflowsPage';

type AutoTab = 'tasks' | 'workflows';

const TAB_LABELS: Record<AutoTab, string> = {
  tasks: 'Tasks',
  workflows: 'Workflows',
};

export function AutomationPage() {
  // Use local state to avoid URL param conflicts with TaskHistory's internal ?view= param.
  const [activeTab, setActiveTab] = useState<AutoTab>('tasks');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page header with tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6" />
            Automation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage tasks and automated workflows
          </p>
        </div>
        <div
          className="flex items-center gap-1 bg-muted/50 border rounded-lg p-1 self-start sm:self-auto"
          role="tablist"
          aria-label="Automation views"
        >
          {(['tasks', 'workflows'] as AutoTab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Subviews — each renders its full self-contained component */}
      {activeTab === 'tasks' && <TaskHistory />}
      {activeTab === 'workflows' && <WorkflowsPage />}
    </div>
  );
}
