// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetricsGraph } from './MetricsGraph';
import { createMetricsSnapshot } from '../test/mocks';
import type { HealthStatus, McpServerConfig } from '../types';

// ── Mock ReactFlow ──────────────────────────────────────────────────
// ReactFlow relies on browser layout APIs unavailable in jsdom.
// We mock it to capture the onNodeClick handler and verify node rendering.

let capturedOnNodeClick: ((event: unknown, node: { id: string }) => void) | undefined;

vi.mock('reactflow', () => {
  const Position = { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' };
  return {
    default: ({
      nodes,
      onNodeClick,
      nodeTypes,
    }: {
      nodes: { id: string; data: { label: string; icon: React.ReactNode; status: string } }[];
      onNodeClick?: (event: unknown, node: { id: string }) => void;
      nodeTypes: Record<string, React.ComponentType<{ data: unknown }>>;
      [key: string]: unknown;
    }) => {
      capturedOnNodeClick = onNodeClick;
      const SystemNode = nodeTypes.system;
      return (
        <div data-testid="reactflow">
          {nodes.map((n) => (
            <div key={n.id} data-testid={`node-${n.id}`}>
              <SystemNode data={n.data} />
            </div>
          ))}
        </div>
      );
    },
    Handle: () => null,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Position,
  };
});

vi.mock('reactflow/dist/style.css', () => ({}));

// ── Fixtures ────────────────────────────────────────────────────────

function createHealth(overrides?: Partial<HealthStatus>): HealthStatus {
  return {
    status: 'ok',
    version: '1.0.0',
    uptime: 3_600_000,
    checks: { database: true, auditChain: true },
    ...overrides,
  };
}

function createMcpServers(): McpServerConfig[] {
  return [
    {
      id: 'mcp-1',
      name: 'Git Server',
      description: 'Git tools',
      transport: 'stdio',
      command: 'git-mcp',
      args: [],
      url: null,
      env: {},
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────

describe('MetricsGraph', () => {
  beforeEach(() => {
    capturedOnNodeClick = undefined;
  });

  it('renders all 7 system nodes', () => {
    render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth()}
        mcpServers={createMcpServers()}
      />
    );

    expect(screen.getByText('Agent Core')).toBeInTheDocument();
    expect(screen.getByText('Task Queue')).toBeInTheDocument();
    expect(screen.getByText('Postgres')).toBeInTheDocument();
    expect(screen.getByText('Audit Chain')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
  });

  it('fires onNodeClick with the correct node id', () => {
    const handler = vi.fn();
    render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth()}
        mcpServers={createMcpServers()}
        onNodeClick={handler}
      />
    );

    expect(capturedOnNodeClick).toBeDefined();

    // Simulate ReactFlow calling the onNodeClick callback
    capturedOnNodeClick!({}, { id: 'database' });
    expect(handler).toHaveBeenCalledWith('database');

    capturedOnNodeClick!({}, { id: 'agent' });
    expect(handler).toHaveBeenCalledWith('agent');

    capturedOnNodeClick!({}, { id: 'mcp' });
    expect(handler).toHaveBeenCalledWith('mcp');
  });

  it('does not throw when onNodeClick is not provided', () => {
    render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth()}
        mcpServers={createMcpServers()}
      />
    );

    expect(capturedOnNodeClick).toBeDefined();
    expect(() => {
      capturedOnNodeClick!({}, { id: 'agent' });
    }).not.toThrow();
  });

  it('applies cursor-pointer class to system nodes', () => {
    const { container } = render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth()}
        mcpServers={createMcpServers()}
      />
    );

    const nodeElements = container.querySelectorAll('.cursor-pointer');
    expect(nodeElements.length).toBe(7);
  });

  it('shows "Connected" for database when health check passes', () => {
    render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth()}
        mcpServers={createMcpServers()}
      />
    );
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows "Down" for database when health check fails', () => {
    render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth({ checks: { database: false, auditChain: true } })}
        mcpServers={createMcpServers()}
      />
    );
    expect(screen.getByText('Down')).toBeInTheDocument();
  });

  it('shows "Degraded" for agent core when health is not ok', () => {
    render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth({ status: 'degraded' })}
        mcpServers={createMcpServers()}
      />
    );
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('shows MCP server count', () => {
    render(
      <MetricsGraph
        metrics={createMetricsSnapshot()}
        health={createHealth()}
        mcpServers={createMcpServers()}
      />
    );
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });
});
