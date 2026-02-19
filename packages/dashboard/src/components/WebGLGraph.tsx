import { useMemo, useEffect } from 'react';
import { SigmaContainer, useLoadGraph, useRegisterEvents } from '@react-sigma/core';
import DirectedGraph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import dagre from 'dagre';
import '@react-sigma/core/lib/react-sigma.min.css';

export interface WebGLGraphNode {
  id: string;
  label: string;
  color?: string;
  size?: number;
}

export interface WebGLGraphEdge {
  source: string;
  target: string;
  color?: string;
}

export type WebGLGraphLayout = 'forceatlas2' | 'dagre';

export interface WebGLGraphProps {
  nodes: WebGLGraphNode[];
  edges: WebGLGraphEdge[];
  height?: number;
  onNodeClick?: (id: string) => void;
  className?: string;
  /** Layout algorithm. 'forceatlas2' suits network/cluster graphs; 'dagre' suits trees and DAGs. Default: 'forceatlas2'. */
  layout?: WebGLGraphLayout;
}

// ── Inner component — must live inside SigmaContainer to access context hooks ──

function GraphLoader({
  nodes,
  edges,
  onNodeClick,
  layout = 'forceatlas2',
}: {
  nodes: WebGLGraphNode[];
  edges: WebGLGraphEdge[];
  onNodeClick?: (id: string) => void;
  layout?: WebGLGraphLayout;
}) {
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    const graph = new DirectedGraph();

    for (const node of nodes) {
      graph.addNode(node.id, {
        label: node.label,
        color: node.color ?? '#6366f1',
        size: node.size ?? 6,
        x: Math.random(),
        y: Math.random(),
      });
    }

    for (const edge of edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdge(edge.source, edge.target, {
          color: edge.color ?? '#888',
        });
      }
    }

    if (graph.order > 1) {
      if (layout === 'dagre') {
        // Hierarchical top-down layout via Dagre — ideal for trees and DAGs.
        const g = new dagre.graphlib.Graph();
        g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });
        g.setDefaultEdgeLabel(() => ({}));

        for (const node of nodes) {
          g.setNode(node.id, { width: 30, height: 30 });
        }
        for (const edge of edges) {
          g.setEdge(edge.source, edge.target);
        }

        dagre.layout(g);

        for (const id of g.nodes()) {
          const pos = g.node(id);
          graph.setNodeAttribute(id, 'x', pos.x);
          graph.setNodeAttribute(id, 'y', pos.y);
        }
      } else {
        forceAtlas2.assign(graph, {
          iterations: 100,
          settings: { gravity: 1, scalingRatio: 2 },
        });
      }
    }

    loadGraph(graph);
  }, [nodes, edges, loadGraph, layout]);

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }: { node: string }) => {
        onNodeClick?.(node);
      },
    });
  }, [registerEvents, onNodeClick]);

  return null;
}

// ── Public component ──────────────────────────────────────────────

export function WebGLGraph({
  nodes,
  edges,
  height = 400,
  onNodeClick,
  className,
  layout = 'forceatlas2',
}: WebGLGraphProps) {
  const hasWebGL = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }, []);

  if (!hasWebGL) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 rounded-lg border border-border text-muted-foreground text-sm ${className ?? ''}`}
        style={{ height }}
      >
        WebGL is not available in this environment. Graph rendering requires WebGL support.
      </div>
    );
  }

  return (
    <SigmaContainer
      style={{ height, width: '100%' }}
      className={className}
      settings={{
        renderEdgeLabels: false,
        defaultNodeColor: '#6366f1',
        defaultEdgeColor: '#888',
        labelFont: 'Inter, system-ui, sans-serif',
        labelSize: 12,
        minCameraRatio: 0.1,
        maxCameraRatio: 10,
      }}
    >
      <GraphLoader nodes={nodes} edges={edges} onNodeClick={onNodeClick} layout={layout} />
    </SigmaContainer>
  );
}
