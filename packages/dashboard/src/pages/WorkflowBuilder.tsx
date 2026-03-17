/**
 * WorkflowBuilder — Visual DAG editor using ReactFlow.
 *
 * Layout: left step-type palette | center ReactFlow canvas | right config panel.
 */

import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Save,
  Play,
  ChevronLeft,
  Loader2,
  Bot,
  Wrench,
  GitBranch,
  Shuffle,
  Database,
  Webhook,
  GitMerge,
  Users,
  Cpu,
  X,
  History,
} from 'lucide-react';
import {
  fetchWorkflow,
  createWorkflow,
  updateWorkflow,
  triggerWorkflow,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowEdge,
} from '../api/client';

const WorkflowVersionHistory = lazy(() => import('../components/workflow/WorkflowVersionHistory'));

// ── Step type metadata ────────────────────────────────────────────────

const STEP_TYPES = [
  { type: 'agent', label: 'Agent', icon: Bot, color: 'bg-blue-100 text-blue-800' },
  { type: 'tool', label: 'Tool', icon: Wrench, color: 'bg-purple-100 text-purple-800' },
  { type: 'mcp', label: 'MCP', icon: Cpu, color: 'bg-indigo-100 text-indigo-800' },
  {
    type: 'condition',
    label: 'Condition',
    icon: GitBranch,
    color: 'bg-yellow-100 text-yellow-800',
  },
  { type: 'transform', label: 'Transform', icon: Shuffle, color: 'bg-orange-100 text-orange-800' },
  { type: 'resource', label: 'Resource', icon: Database, color: 'bg-green-100 text-green-800' },
  { type: 'webhook', label: 'Webhook', icon: Webhook, color: 'bg-pink-100 text-pink-800' },
  {
    type: 'subworkflow',
    label: 'Sub-Workflow',
    icon: GitMerge,
    color: 'bg-teal-100 text-teal-800',
  },
  { type: 'swarm', label: 'Swarm', icon: Users, color: 'bg-red-100 text-red-800' },
] as const;

function stepTypeColor(type: string): string {
  return STEP_TYPES.find((s) => s.type === type)?.color ?? 'bg-gray-100 text-gray-800';
}

// ── Custom node ───────────────────────────────────────────────────────

function StepNode({ data }: { data: { label: string; type: string; selected?: boolean } }) {
  const colorClass = stepTypeColor(data.type);
  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 bg-card shadow-sm min-w-[120px] ${
        data.selected ? 'border-primary' : 'border-border'
      }`}
    >
      <div
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium mb-1 ${colorClass}`}
      >
        {data.type}
      </div>
      <div className="text-sm font-medium truncate max-w-[140px]">{data.label}</div>
    </div>
  );
}

const nodeTypes: NodeTypes = { step: StepNode };

// ── Conversion helpers ────────────────────────────────────────────────

function definitionToFlow(
  steps: WorkflowStep[],
  edges: WorkflowEdge[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = steps.map((step, i) => ({
    id: step.id,
    type: 'step',
    position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 120 },
    data: { label: step.name, type: step.type, stepData: step },
  }));

  const rfEdges: Edge[] = edges.map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
  }));

  return { nodes, edges: rfEdges };
}

function flowToDefinition(
  nodes: Node[],
  edges: Edge[],
  name: string,
  description?: string
): Partial<WorkflowDefinition> {
  const steps: WorkflowStep[] = nodes.map((n) => {
    const existing = (n.data.stepData as WorkflowStep) ?? {};
    const dependsOn = edges.filter((e) => e.target === n.id).map((e) => e.source);
    return {
      id: n.id,
      type: existing.type ?? 'agent',
      name: n.data.label ?? n.id,
      description: existing.description,
      config: existing.config ?? {},
      dependsOn,
      onError: existing.onError ?? 'fail',
      retryPolicy: existing.retryPolicy,
      fallbackStepId: existing.fallbackStepId,
      condition: existing.condition,
    };
  });

  const wfEdges: WorkflowEdge[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : undefined,
  }));

  return { name, description, steps, edges: wfEdges };
}

// ── Main Component ────────────────────────────────────────────────────

export function WorkflowBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [wfName, setWfName] = useState('Untitled Workflow');
  const [wfDescription, setWfDescription] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load existing definition
  const { data: existingData, isLoading } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => fetchWorkflow(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existingData?.definition) {
      const def = existingData.definition;
      setWfName(def.name);
      setWfDescription(def.description ?? '');
      setIsEnabled(def.isEnabled);
      const { nodes: n, edges: e } = definitionToFlow(def.steps, def.edges);
      setNodes(n);
      setEdges(e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingData]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges]
  );

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = flowToDefinition(nodes, edges, wfName, wfDescription);
      payload.isEnabled = isEnabled;
      if (isNew) {
        return createWorkflow(payload);
      } else {
        return updateWorkflow(id, payload);
      }
    },
    onSuccess: (result) => {
      setToast('Saved successfully');
      if (isNew && result.definition?.id) {
        void navigate(`/workflows/${result.definition.id}/builder`, { replace: true });
      }
      setTimeout(() => {
        setToast(null);
      }, 3000);
    },
    onError: (err) => {
      setToast(err instanceof Error ? err.message : 'Save failed');
      setTimeout(() => {
        setToast(null);
      }, 4000);
    },
  });

  // Run mutation
  const runMutation = useMutation({
    mutationFn: async () => {
      if (isNew) throw new Error('Save the workflow first before running');
      return triggerWorkflow(id);
    },
    onSuccess: (result) => {
      void navigate(`/workflows/runs/${result.run.id}`);
    },
    onError: (err) => {
      setToast(err instanceof Error ? err.message : 'Failed to run');
      setTimeout(() => {
        setToast(null);
      }, 4000);
    },
  });

  // Add a new step node by dragging from palette
  function addStepNode(type: string, label: string) {
    const newId = `${type}-${Date.now()}`;
    const newNode: Node = {
      id: newId,
      type: 'step',
      position: { x: 100 + nodes.length * 20, y: 100 + nodes.length * 20 },
      data: {
        label,
        type,
        stepData: {
          id: newId,
          type,
          name: label,
          config: {},
          dependsOn: [],
          onError: 'fail',
        },
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <button
          onClick={() => void navigate('/workflows')}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input
          value={wfName}
          onChange={(e) => {
            setWfName(e.target.value);
          }}
          className="flex-1 max-w-xs px-3 py-1.5 rounded-md border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Workflow name"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => {
              setIsEnabled(e.target.checked);
            }}
            className="rounded"
          />
          Enabled
        </label>
        <div className="flex items-center gap-2 ml-auto">
          {toast && <span className="text-xs text-muted-foreground">{toast}</span>}
          {!isNew && (
            <button
              onClick={() => {
                setShowHistory((v) => !v);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                showHistory ? 'bg-muted border-primary' : 'hover:bg-muted/50'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
          )}
          <button
            onClick={() => {
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save
          </button>
          <button
            onClick={() => {
              runMutation.mutate();
            }}
            disabled={runMutation.isPending || isNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {runMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Run
          </button>
        </div>
      </div>

      {/* Main area: palette + canvas + config panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left palette */}
        <div className="w-44 border-r bg-card shrink-0 overflow-y-auto p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Step Types
          </p>
          {STEP_TYPES.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              onClick={() => {
                addStepNode(type, label);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-sm transition-colors text-left"
            >
              <span className={`p-1 rounded text-xs ${color}`}>
                <Icon className="w-3 h-3" />
              </span>
              {label}
            </button>
          ))}
        </div>

        {/* Center canvas */}
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNode(node);
            }}
            onPaneClick={() => {
              setSelectedNode(null);
            }}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* Right config panel */}
        {selectedNode && (
          <div className="w-72 border-l bg-card shrink-0 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Step Config</h3>
              <button
                onClick={() => {
                  setSelectedNode(null);
                }}
                className="p-1 rounded hover:bg-muted/50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">ID</label>
                <p className="text-xs mt-0.5 font-mono text-muted-foreground">{selectedNode.id}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <span
                  className={`block w-fit mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${stepTypeColor(selectedNode.data.type)}`}
                >
                  {selectedNode.data.type}
                </span>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  value={selectedNode.data.label ?? ''}
                  onChange={(e) => {
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, data: { ...n.data, label: e.target.value } }
                          : n
                      )
                    );
                    setSelectedNode((prev) =>
                      prev ? { ...prev, data: { ...prev.data, label: e.target.value } } : null
                    );
                  }}
                  className="mt-1 w-full px-2 py-1.5 rounded border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Config (JSON)</label>
                <textarea
                  rows={6}
                  value={JSON.stringify(selectedNode.data.stepData?.config ?? {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id
                            ? {
                                ...n,
                                data: {
                                  ...n.data,
                                  stepData: { ...(n.data.stepData ?? {}), config: parsed },
                                },
                              }
                            : n
                        )
                      );
                    } catch {
                      // ignore invalid JSON while typing
                    }
                  }}
                  className="mt-1 w-full px-2 py-1.5 rounded border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">On Error</label>
                <select
                  value={selectedNode.data.stepData?.onError ?? 'fail'}
                  onChange={(e) => {
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === selectedNode.id
                          ? {
                              ...n,
                              data: {
                                ...n.data,
                                stepData: { ...(n.data.stepData ?? {}), onError: e.target.value },
                              },
                            }
                          : n
                      )
                    );
                  }}
                  className="mt-1 w-full px-2 py-1.5 rounded border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="fail">Fail</option>
                  <option value="continue">Continue</option>
                  <option value="skip">Skip</option>
                  <option value="fallback">Fallback</option>
                </select>
              </div>

              <button
                onClick={() => {
                  setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                  setEdges((eds) =>
                    eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
                  );
                  setSelectedNode(null);
                }}
                className="w-full px-3 py-1.5 rounded-md border border-destructive text-destructive text-sm hover:bg-destructive/10 transition-colors"
              >
                Delete Step
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Version history drawer */}
      {showHistory && id && (
        <div className="border-t bg-card shrink-0 overflow-y-auto max-h-[40vh] p-4">
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">Loading history...</div>}
          >
            <WorkflowVersionHistory workflowId={id} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
