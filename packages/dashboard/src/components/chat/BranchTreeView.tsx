import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactFlow, { type Node, type Edge, Position, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { GitBranch, X } from 'lucide-react';
import { fetchBranchTree } from '../../api/client';
import type { BranchTreeNode } from '../../types';

interface BranchTreeViewProps {
  conversationId: string;
  activeConversationId: string | null;
  onNavigate: (conversationId: string) => void;
  onClose: () => void;
}

function flattenTree(
  node: BranchTreeNode,
  parentId: string | null,
  depth: number,
  siblingIndex: number,
  activeId: string | null
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const isActive = node.conversationId === activeId;

  nodes.push({
    id: node.conversationId,
    position: { x: siblingIndex * 280, y: depth * 140 },
    data: {
      label: (
        <div className={`p-2 text-left ${isActive ? 'ring-2 ring-primary rounded' : ''}`}>
          <div className="text-xs font-medium truncate max-w-[200px]">{node.title}</div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span>{node.messageCount} msgs</span>
            {node.qualityScore != null && (
              <span className="px-1 py-0.5 rounded bg-primary/10 text-primary">
                {node.qualityScore.toFixed(2)}
              </span>
            )}
          </div>
          {node.branchLabel && (
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {node.branchLabel}
            </div>
          )}
        </div>
      ),
    },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: {
      border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
      borderRadius: '8px',
      background: 'var(--card)',
      width: 240,
    },
  });

  if (parentId) {
    edges.push({
      id: `${parentId}-${node.conversationId}`,
      source: parentId,
      target: node.conversationId,
      label: node.forkMessageIndex != null ? `msg ${node.forkMessageIndex}` : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: 'var(--muted-foreground)' },
      labelStyle: { fontSize: 10, fill: 'var(--muted-foreground)' },
    });
  }

  node.children.forEach((child, i) => {
    const childResult = flattenTree(
      child,
      node.conversationId,
      depth + 1,
      siblingIndex + i,
      activeId
    );
    nodes.push(...childResult.nodes);
    edges.push(...childResult.edges);
  });

  return { nodes, edges };
}

export function BranchTreeView({
  conversationId,
  activeConversationId,
  onNavigate,
  onClose,
}: BranchTreeViewProps) {
  const { data: tree, isLoading } = useQuery({
    queryKey: ['branch-tree', conversationId],
    queryFn: () => fetchBranchTree(conversationId),
  });

  const { nodes, edges } = useMemo(() => {
    if (!tree) return { nodes: [], edges: [] };
    return flattenTree(tree, null, 0, 0, activeConversationId);
  }, [tree, activeConversationId]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNavigate(node.id);
    },
    [onNavigate]
  );

  return (
    <div className="flex flex-col h-full border-l bg-card" data-testid="branch-tree-view">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="w-4 h-4" />
          Branch Tree
        </div>
        <button onClick={onClose} className="btn-ghost p-1 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1" data-testid="branch-tree-flow">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading tree...
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No branches found
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          />
        )}
      </div>
    </div>
  );
}
