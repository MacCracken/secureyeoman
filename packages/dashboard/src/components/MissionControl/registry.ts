export type MissionCardId =
  | 'kpi-bar'
  | 'resource-monitoring'
  | 'active-tasks'
  | 'workflow-runs'
  | 'agent-health'
  | 'system-health'
  | 'integration-grid'
  | 'security-events'
  | 'audit-stream'
  | 'system-topology'
  | 'cost-breakdown'
  | 'agent-world';

export interface CardDef {
  id: MissionCardId;
  label: string;
  description: string;
  defaultVisible: boolean;
  pinned?: boolean;
  minColSpan: 3 | 4 | 6 | 12;
  defaultColSpan: 3 | 4 | 6 | 12;
}

export const CARD_REGISTRY: readonly CardDef[] = [
  { id: 'kpi-bar',             label: 'Key Metrics Bar',       description: 'At-a-glance KPI stats',             defaultVisible: true,  pinned: true, minColSpan: 12, defaultColSpan: 12 },
  { id: 'resource-monitoring', label: 'Resource Monitoring',   description: 'CPU, memory, token usage over time', defaultVisible: true,               minColSpan: 6,  defaultColSpan: 12 },
  { id: 'active-tasks',        label: 'Active Tasks',          description: 'Currently running agent tasks',      defaultVisible: true,               minColSpan: 4,  defaultColSpan: 4  },
  { id: 'workflow-runs',       label: 'Workflow Runs',         description: 'Recent workflow executions',         defaultVisible: true,               minColSpan: 4,  defaultColSpan: 4  },
  { id: 'agent-health',        label: 'Agent Health',          description: 'Personality heartbeat overview',     defaultVisible: true,               minColSpan: 4,  defaultColSpan: 4  },
  { id: 'system-health',       label: 'System Health',         description: 'MCP servers and heartbeat tasks',    defaultVisible: true,               minColSpan: 3,  defaultColSpan: 3  },
  { id: 'integration-grid',    label: 'Integration Status',    description: 'Connected integration health',       defaultVisible: true,               minColSpan: 3,  defaultColSpan: 3  },
  { id: 'security-events',     label: 'Security Events',       description: 'Recent security incidents',          defaultVisible: true,               minColSpan: 3,  defaultColSpan: 3  },
  { id: 'audit-stream',        label: 'Audit Stream',          description: 'Live audit log entries',             defaultVisible: true,               minColSpan: 3,  defaultColSpan: 3  },
  { id: 'system-topology',     label: 'System Topology',       description: 'Service dependency graph',           defaultVisible: true,               minColSpan: 6,  defaultColSpan: 6  },
  { id: 'cost-breakdown',      label: 'Cost Breakdown',        description: 'Token spend by model and provider',  defaultVisible: true,               minColSpan: 6,  defaultColSpan: 6  },
  { id: 'agent-world',         label: 'Agent World',           description: 'Live ASCII personality activity',    defaultVisible: false,              minColSpan: 12, defaultColSpan: 12 },
];
