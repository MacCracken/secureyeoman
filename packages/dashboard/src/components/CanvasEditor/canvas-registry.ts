export type CanvasWidgetType =
  | 'terminal'
  | 'editor'
  | 'frozen-output'
  | 'agent-world'
  | 'training-live'
  | 'task-kanban'
  | 'git-panel'
  | 'pipeline'
  | 'cicd-monitor'
  | 'chat'
  | 'mission-card';

export interface CanvasWidgetDef {
  type: CanvasWidgetType;
  label: string;
  description: string;
  category: 'development' | 'ai-agents' | 'monitoring' | 'pipelines';
  defaultWidth: number;
  defaultHeight: number;
  singleton?: boolean;
}

export const CANVAS_WIDGET_REGISTRY: readonly CanvasWidgetDef[] = [
  {
    type: 'terminal',
    label: 'Terminal',
    category: 'development',
    description: 'Shell execution with tech-stack detection',
    defaultWidth: 560,
    defaultHeight: 380,
  },
  {
    type: 'editor',
    label: 'Code Editor',
    category: 'development',
    description: 'Monaco editor with file path tracking',
    defaultWidth: 680,
    defaultHeight: 460,
  },
  {
    type: 'frozen-output',
    label: 'Pinned Output',
    category: 'development',
    description: 'Read-only snapshot of terminal output',
    defaultWidth: 480,
    defaultHeight: 300,
  },
  {
    type: 'agent-world',
    label: 'Agent World',
    category: 'ai-agents',
    description: 'Live ASCII personality activity view',
    defaultWidth: 680,
    defaultHeight: 420,
  },
  {
    type: 'chat',
    label: 'Chat',
    category: 'ai-agents',
    description: 'Inline AI chat assistant',
    defaultWidth: 480,
    defaultHeight: 500,
  },
  {
    type: 'task-kanban',
    label: 'Task Kanban',
    category: 'ai-agents',
    description: 'Stage-aware task board',
    defaultWidth: 680,
    defaultHeight: 400,
  },
  {
    type: 'training-live',
    label: 'Training Live',
    category: 'monitoring',
    description: 'Real-time training loss and reward charts',
    defaultWidth: 560,
    defaultHeight: 380,
  },
  {
    type: 'mission-card',
    label: 'Mission Card',
    category: 'monitoring',
    description: 'Any Mission Control section widget',
    defaultWidth: 480,
    defaultHeight: 320,
  },
  {
    type: 'git-panel',
    label: 'Git Panel',
    category: 'pipelines',
    description: 'Git status, diff, commit, and branch management',
    defaultWidth: 480,
    defaultHeight: 400,
  },
  {
    type: 'pipeline',
    label: 'Pipeline Viewer',
    category: 'pipelines',
    description: 'Live workflow run DAG visualization',
    defaultWidth: 560,
    defaultHeight: 380,
  },
  {
    type: 'cicd-monitor',
    label: 'CI/CD Monitor',
    category: 'pipelines',
    description: 'CI/CD pipeline status board',
    defaultWidth: 560,
    defaultHeight: 360,
  },
];

export const CATEGORY_LABELS: Record<CanvasWidgetDef['category'], string> = {
  development: 'Development Tools',
  'ai-agents': 'AI & Agents',
  monitoring: 'Monitoring',
  pipelines: 'Pipelines',
};
