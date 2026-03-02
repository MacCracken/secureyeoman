import { useCallback, useRef, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Node,
  type OnNodesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus, Save, ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CanvasWidget, type CanvasWidgetData, type CanvasWidgetConfig } from './CanvasWidget';
import { WidgetCatalog } from './WidgetCatalog';
import { CANVAS_WIDGET_REGISTRY, type CanvasWidgetType } from './canvas-registry';
import { loadCanvasLayout, saveCanvasLayout } from './canvas-layout';

const nodeTypes = { canvasWidget: CanvasWidget };

function generateNodeId() {
  return `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function AdvancedEditorInner() {
  const { getViewport, setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasWidgetData>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  // Load layout on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const layout = loadCanvasLayout();
    if (layout.nodes.length > 0) {
      setNodes(layout.nodes);
    }
    setTimeout(() => {
      setViewport(layout.viewport);
    }, 50);
  }, [setNodes, setViewport]);

  const doSave = useCallback(() => {
    const viewport = getViewport();
    saveCanvasLayout({ version: 1, nodes, viewport });
  }, [nodes, getViewport]);

  // Auto-save on node change (debounced)
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(doSave, 1000);
    },
    [onNodesChange, doSave]
  );

  const handleClose = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    },
    [setNodes]
  );

  const handleFreezeOutput = useCallback(
    (sourceId: string, command: string, output: string, exitCode: number) => {
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const id = generateNodeId();
      const x = (sourceNode?.position.x ?? 200) + 40;
      const y = (sourceNode?.position.y ?? 200) + 40;
      const newNode: Node<CanvasWidgetData> = {
        id,
        type: 'canvasWidget',
        position: { x, y },
        style: { width: 480, height: 300 },
        data: {
          widgetType: 'frozen-output',
          title: `Output: ${command.slice(0, 24)}`,
          minimized: false,
          config: {
            frozenContent: {
              command,
              output,
              exitCode,
              timestamp: new Date().toISOString(),
            },
          },
          onClose: handleClose,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [nodes, setNodes, handleClose]
  );

  const handleConfigChange = useCallback(
    (nodeId: string, config: CanvasWidgetConfig) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n))
      );
    },
    [setNodes]
  );

  const addWidget = useCallback(
    (type: CanvasWidgetType) => {
      const def = CANVAS_WIDGET_REGISTRY.find((d) => d.type === type);
      if (!def) return;
      const viewport = getViewport();
      const centerX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
      const centerY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;
      const offset = (Math.random() - 0.5) * 80;
      const id = generateNodeId();
      const newNode: Node<CanvasWidgetData> = {
        id,
        type: 'canvasWidget',
        position: {
          x: centerX - def.defaultWidth / 2 + offset,
          y: centerY - def.defaultHeight / 2 + offset,
        },
        style: { width: def.defaultWidth, height: def.defaultHeight },
        data: {
          widgetType: type,
          title: def.label,
          minimized: false,
          config: {},
          onClose: handleClose,
          onFreezeOutput: handleFreezeOutput,
          onConfigChange: handleConfigChange,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [getViewport, setNodes, handleClose, handleFreezeOutput, handleConfigChange]
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-background z-40">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b z-10 shrink-0">
        <span className="font-semibold text-sm flex items-center gap-1.5">
          <LayoutDashboard className="w-4 h-4" />
          Canvas
        </span>
        <div className="w-px h-4 bg-border mx-1" />
        <button
          onClick={() => {
            setCatalogOpen((v) => !v);
          }}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Widget
        </button>
        <div className="flex-1" />
        <button
          onClick={doSave}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-muted"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
        <Link
          to="/editor"
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-muted"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Basic Editor
        </Link>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          onNodesChange={handleNodesChange}
          nodeTypes={nodeTypes}
          fitView={false}
          minZoom={0.1}
          maxZoom={2}
          deleteKeyCode="Delete"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="hsl(var(--border))" />
          <Controls position="bottom-left" />
        </ReactFlow>

        {catalogOpen && (
          <WidgetCatalog
            onAdd={addWidget}
            onClose={() => {
              setCatalogOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

export function AdvancedEditorPage() {
  return (
    <ReactFlowProvider>
      <AdvancedEditorInner />
    </ReactFlowProvider>
  );
}
