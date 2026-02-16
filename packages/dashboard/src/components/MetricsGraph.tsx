/**
 * Metrics Graph Component
 *
 * Visualizes system activity using ReactFlow
 */

import { useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Handle,
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Shield, Activity, Database, Cpu, Network, Server, Link } from 'lucide-react';
import type { MetricsSnapshot, HealthStatus, McpServerConfig } from '../types';

interface MetricsGraphProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
  mcpServers?: McpServerConfig[];
  onNodeClick?: (nodeId: string) => void;
}

// Custom node component with explicit handles for all four sides
function SystemNode({ data }: { data: { label: string; value: string | number; icon: React.ReactNode; status: 'ok' | 'warning' | 'error' } }) {
  const statusColor = {
    ok: 'bg-success/20 border-success',
    warning: 'bg-warning/20 border-warning',
    error: 'bg-destructive/20 border-destructive',
  }[data.status];

  return (
    <div className={`px-3 py-2 sm:px-4 sm:py-3 rounded-lg border-2 ${statusColor} min-w-[120px] sm:min-w-[140px] cursor-pointer`}>
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
      <div className="flex items-center gap-2 mb-1">
        <div className="text-muted-foreground">{data.icon}</div>
        <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">{data.label}</span>
      </div>
      <div className="text-base sm:text-lg font-bold">{data.value}</div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  system: SystemNode,
};

export function MetricsGraph({ metrics, health, mcpServers, onNodeClick }: MetricsGraphProps) {
  const dbConnected = health?.checks?.database ?? false;
  const auditValid = health?.checks?.auditChain ?? false;
  const coreOk = health?.status === 'ok';
  const enabledMcp = mcpServers?.filter((s) => s.enabled).length ?? 0;
  const totalMcp = mcpServers?.length ?? 0;

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [
      // Central Agent Node
      {
        id: 'agent',
        type: 'system',
        position: { x: 280, y: 150 },
        data: {
          label: 'Agent Core',
          value: coreOk ? `${metrics?.tasks?.inProgress ?? 0} active` : 'Degraded',
          icon: <Shield className="w-4 h-4" />,
          status: coreOk ? 'ok' : 'error',
        },
      },
      // Task Queue
      {
        id: 'tasks',
        type: 'system',
        position: { x: 50, y: 50 },
        data: {
          label: 'Task Queue',
          value: metrics?.tasks?.queueDepth ?? 0,
          icon: <Activity className="w-4 h-4" />,
          status: (metrics?.tasks?.queueDepth ?? 0) > 10 ? 'warning' : 'ok',
        },
      },
      // Database (Postgres)
      {
        id: 'database',
        type: 'system',
        position: { x: 510, y: 50 },
        data: {
          label: 'Postgres',
          value: dbConnected ? 'Connected' : 'Down',
          icon: <Server className="w-4 h-4" />,
          status: dbConnected ? 'ok' : 'error',
        },
      },
      // Audit Chain
      {
        id: 'audit',
        type: 'system',
        position: { x: 510, y: 150 },
        data: {
          label: 'Audit Chain',
          value: metrics?.security?.auditEntriesTotal ?? 0,
          icon: <Database className="w-4 h-4" />,
          status: auditValid ? 'ok' : 'error',
        },
      },
      // Resources
      {
        id: 'resources',
        type: 'system',
        position: { x: 50, y: 250 },
        data: {
          label: 'Memory',
          value: `${(metrics?.resources?.memoryUsedMb ?? 0).toFixed(0)} MB`,
          icon: <Cpu className="w-4 h-4" />,
          status: (metrics?.resources?.memoryPercent ?? 0) > 80 ? 'warning' : 'ok',
        },
      },
      // Security
      {
        id: 'security',
        type: 'system',
        position: { x: 510, y: 250 },
        data: {
          label: 'Security',
          value: (metrics?.security?.blockedRequestsTotal ?? 0) + (metrics?.security?.injectionAttemptsTotal ?? 0),
          icon: <Network className="w-4 h-4" />,
          status: (metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? 'warning' : 'ok',
        },
      },
      // MCP Servers
      {
        id: 'mcp',
        type: 'system',
        position: { x: 50, y: 150 },
        data: {
          label: 'MCP Servers',
          value: `${enabledMcp}/${totalMcp}`,
          icon: <Link className="w-4 h-4" />,
          status: totalMcp === 0 ? 'warning' : enabledMcp > 0 ? 'ok' : 'error',
        },
      },
    ];

    const edges: Edge[] = [
      // Tasks → Agent
      {
        id: 'tasks-agent',
        source: 'tasks',
        target: 'agent',
        animated: (metrics?.tasks?.inProgress ?? 0) > 0,
        style: { stroke: '#0ea5e9' },
      },
      // Agent → Database
      {
        id: 'agent-database',
        source: 'agent',
        target: 'database',
        sourceHandle: undefined,
        targetHandle: undefined,
        animated: dbConnected,
        style: { stroke: dbConnected ? '#22c55e' : '#ef4444', strokeWidth: 2 },
      },
      // Agent → Audit (via database)
      {
        id: 'database-audit',
        source: 'database',
        target: 'audit',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        animated: auditValid && dbConnected,
        style: { stroke: auditValid ? '#22c55e' : '#ef4444' },
      },
      // MCP → Agent
      {
        id: 'mcp-agent',
        source: 'mcp',
        target: 'agent',
        animated: enabledMcp > 0,
        style: { stroke: enabledMcp > 0 ? '#8b5cf6' : '#6b7280' },
      },
      // Resources → Agent
      {
        id: 'resources-agent',
        source: 'resources',
        target: 'agent',
        sourceHandle: undefined,
        targetHandle: undefined,
        style: { stroke: (metrics?.resources?.memoryPercent ?? 0) > 80 ? '#f59e0b' : '#6b7280' },
      },
      // Agent → Security
      {
        id: 'agent-security',
        source: 'agent',
        target: 'security',
        sourceHandle: undefined,
        targetHandle: undefined,
        animated: (metrics?.security?.injectionAttemptsTotal ?? 0) > 0,
        style: { stroke: (metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? '#ef4444' : '#f59e0b' },
      },
    ];

    return { nodes, edges };
  }, [metrics, coreOk, dbConnected, auditValid, enabledMcp, totalMcp]);

  return (
    <div className="h-[280px] sm:h-[350px] lg:h-[400px] w-full rounded-lg border bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#888" gap={16} size={1} />
        <Controls showInteractive={false} className="!left-1 !bottom-1 sm:!left-2 sm:!bottom-2" />
        <MiniMap
          nodeColor={(node) => {
            const status = node.data?.status as string;
            if (status === 'error') return '#ef4444';
            if (status === 'warning') return '#f59e0b';
            return '#22c55e';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
          className="hidden sm:block"
        />
      </ReactFlow>
    </div>
  );
}
