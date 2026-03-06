export type CanvasWidgetType =
  | 'terminal'
  | 'editor'
  | 'frozen-output'
  | 'agent-world'
  | 'the-entity'
  | 'training-live'
  | 'task-kanban'
  | 'git-panel'
  | 'pipeline'
  | 'cicd-monitor'
  | 'chat'
  | 'mission-card'
  | 'excalidraw'
  | 'trading-dashboard'
  | 'tee-status'
  | 'advanced-training'
  | 'hyperparam-search'
  | 'batch-inference'
  | 'continual-learning'
  | 'dlp-overview'
  | 'cost-optimizer';

export interface CanvasWidgetDef {
  type: CanvasWidgetType;
  label: string;
  description: string;
  category:
    | 'development'
    | 'ai-agents'
    | 'monitoring'
    | 'pipelines'
    | 'finance'
    | 'security'
    | 'analytics';
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
    type: 'the-entity',
    label: 'The Entity',
    category: 'ai-agents',
    description: 'AI consciousness visualization — neural network particle animation reacting to AI state',
    defaultWidth: 480,
    defaultHeight: 320,
    singleton: true,
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
  {
    type: 'excalidraw',
    label: 'Excalidraw',
    category: 'development',
    description: 'Interactive whiteboard for diagrams with AI sync and KB integration',
    defaultWidth: 640,
    defaultHeight: 480,
  },
  {
    type: 'trading-dashboard',
    label: 'Trading Dashboard',
    category: 'finance',
    description: 'Candlestick chart with OHLC summary and symbol lookup',
    defaultWidth: 640,
    defaultHeight: 480,
  },
  {
    type: 'tee-status',
    label: 'TEE Status',
    category: 'monitoring',
    description: 'Confidential Computing hardware detection and provider attestation status',
    defaultWidth: 480,
    defaultHeight: 400,
  },
  {
    type: 'advanced-training',
    label: 'Advanced Training',
    category: 'ai-agents',
    description: 'Multi-method fine-tuning (SFT/DPO/RLHF) with multi-GPU and checkpoint management',
    defaultWidth: 560,
    defaultHeight: 480,
  },
  {
    type: 'hyperparam-search',
    label: 'Hyperparam Search',
    category: 'ai-agents',
    description: 'Hyperparameter search wizard with trial grid and best-trial tracking',
    defaultWidth: 560,
    defaultHeight: 460,
  },
  {
    type: 'batch-inference',
    label: 'Batch Inference',
    category: 'ai-agents',
    description: 'Batch inference job management with progress and per-prompt results',
    defaultWidth: 560,
    defaultHeight: 440,
  },
  {
    type: 'continual-learning',
    label: 'Continual Learning',
    category: 'monitoring',
    description: 'Dataset refresh, drift monitoring, and online update management',
    defaultWidth: 520,
    defaultHeight: 460,
  },
  {
    type: 'dlp-overview',
    label: 'DLP Overview',
    category: 'security',
    description: 'Data Loss Prevention classification, egress monitoring, and policy status',
    defaultWidth: 480,
    defaultHeight: 440,
  },
  {
    type: 'cost-optimizer',
    label: 'Cost Optimizer',
    category: 'analytics',
    description:
      'AI model cost analysis with routing suggestions, forecasts, and savings breakdown',
    defaultWidth: 560,
    defaultHeight: 480,
  },
];

export const CATEGORY_LABELS: Record<CanvasWidgetDef['category'], string> = {
  development: 'Development Tools',
  'ai-agents': 'AI & Agents',
  monitoring: 'Monitoring',
  pipelines: 'Pipelines',
  finance: 'Finance',
  security: 'Security',
  analytics: 'Analytics',
};
