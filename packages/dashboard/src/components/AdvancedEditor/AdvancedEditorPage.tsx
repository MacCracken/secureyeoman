import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
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
import {
  Plus,
  Save,
  ArrowLeft,
  LayoutDashboard,
  ChevronDown,
  Download,
  Upload,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CanvasWidget, type CanvasWidgetData, type CanvasWidgetConfig } from './CanvasWidget';
import { WidgetCatalog } from './WidgetCatalog';
import { CANVAS_WIDGET_REGISTRY, type CanvasWidgetType } from './canvas-registry';
import {
  loadCanvasLayout,
  saveCanvasLayout,
  loadNamedLayouts,
  saveNamedLayout,
  deleteNamedLayout,
  getActiveLayoutName,
  setActiveLayoutName,
  exportLayoutAsJson,
  importLayoutFromJson,
  PRESET_LAYOUTS,
  type PresetName,
  type CanvasLayout,
} from './canvas-layout';
import { canvasEventBus, CANVAS_EVENTS } from './canvas-event-bus';
import { useCanvasShortcuts } from './useCanvasShortcuts';

const nodeTypes = { canvasWidget: CanvasWidget };

function generateNodeId() {
  return `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function AdvancedEditorInner() {
  const { getViewport, setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasWidgetData>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [activeLayout, setActiveLayout] = useState<string | null>(() => getActiveLayoutName());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track selected node
  const selectedNodeId = useMemo(() => {
    return nodes.find((n) => n.selected)?.id ?? null;
  }, [nodes]);

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

  // Listen for CREATE_WIDGET events from the event bus
  useEffect(() => {
    return canvasEventBus.on(CANVAS_EVENTS.CREATE_WIDGET, (event) => {
      const widgetType = event.payload.widgetType as CanvasWidgetType | undefined;
      if (widgetType) {
        addWidget(widgetType, event.payload.config as CanvasWidgetConfig | undefined);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Emit to event bus so other widgets can react
      canvasEventBus.emit({
        type: CANVAS_EVENTS.TERMINAL_OUTPUT,
        sourceId,
        payload: { command, output, exitCode },
      });

      if (exitCode !== 0) {
        canvasEventBus.emit({
          type: CANVAS_EVENTS.TERMINAL_ERROR,
          sourceId,
          payload: { command, error: output, exitCode },
        });
      }

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
    (type: CanvasWidgetType, initialConfig?: CanvasWidgetConfig) => {
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
          config: initialConfig ?? {},
          onClose: handleClose,
          onFreezeOutput: handleFreezeOutput,
          onConfigChange: handleConfigChange,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [getViewport, setNodes, handleClose, handleFreezeOutput, handleConfigChange]
  );

  // ── Layout management ───────────────────────────────────────────────

  const applyLayout = useCallback(
    (layout: CanvasLayout) => {
      setNodes(layout.nodes);
      setTimeout(() => {
        setViewport(layout.viewport);
      }, 50);
    },
    [setNodes, setViewport]
  );

  const handleSaveAsLayout = useCallback(() => {
    const name = prompt('Layout name:');
    if (!name?.trim()) return;
    const viewport = getViewport();
    const layout: CanvasLayout = { version: 1, nodes, viewport };
    saveNamedLayout(name.trim(), layout);
    setActiveLayout(name.trim());
    setActiveLayoutName(name.trim());
    setLayoutMenuOpen(false);
  }, [nodes, getViewport]);

  const handleLoadLayout = useCallback(
    (name: string) => {
      const layouts = loadNamedLayouts();
      const layout = layouts[name];
      if (layout) {
        applyLayout(layout);
        saveCanvasLayout(layout);
        setActiveLayout(name);
        setActiveLayoutName(name);
      }
      setLayoutMenuOpen(false);
    },
    [applyLayout]
  );

  const handleDeleteLayout = useCallback(
    (name: string) => {
      deleteNamedLayout(name);
      if (activeLayout === name) {
        setActiveLayout(null);
        setActiveLayoutName(null);
      }
      // Force re-render of menu
      setLayoutMenuOpen(false);
    },
    [activeLayout]
  );

  const handleLoadPreset = useCallback(
    (preset: PresetName) => {
      const layout = PRESET_LAYOUTS[preset];
      applyLayout(layout);
      saveCanvasLayout(layout);
      setActiveLayout(`Preset: ${preset}`);
      setActiveLayoutName(null);
      setLayoutMenuOpen(false);
    },
    [applyLayout]
  );

  const handleExportLayout = useCallback(() => {
    const viewport = getViewport();
    const layout: CanvasLayout = { version: 1, nodes, viewport };
    const json = exportLayoutAsJson(layout);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas-layout-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLayoutMenuOpen(false);
  }, [nodes, getViewport]);

  const handleImportLayout = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const layout = importLayoutFromJson(reader.result as string);
        if (layout) {
          applyLayout(layout);
          saveCanvasLayout(layout);
          setActiveLayout(file.name.replace('.json', ''));
        }
      };
      reader.readAsText(file);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
      setLayoutMenuOpen(false);
    },
    [applyLayout]
  );

  // ── Focus node (for keyboard shortcuts) ─────────────────────────────

  const focusNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
    },
    [setNodes]
  );

  // ── Keyboard shortcuts ──────────────────────────────────────────────

  useCanvasShortcuts({
    nodes,
    focusNode,
    closeNode: handleClose,
    toggleCatalog: () => {
      setCatalogOpen((v) => !v);
    },
    saveLayout: doSave,
    selectedNodeId,
  });

  // Named layouts for the menu
  const namedLayouts = useMemo(() => loadNamedLayouts(), [layoutMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
          title="Add Widget (Cmd+N)"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Widget
        </button>

        {/* Layout Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              setLayoutMenuOpen((v) => !v);
            }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-muted"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            {activeLayout ?? 'Layouts'}
            <ChevronDown className="w-3 h-3" />
          </button>
          {layoutMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-card border rounded-lg shadow-lg z-50 py-1 text-xs">
              {/* Presets */}
              <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Presets
              </div>
              {(['Dev', 'Ops', 'Chat'] as PresetName[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    handleLoadPreset(p);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted"
                >
                  {p}
                </button>
              ))}

              {/* Saved Layouts */}
              {Object.keys(namedLayouts).length > 0 && (
                <>
                  <div className="border-t my-1" />
                  <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Saved
                  </div>
                  {Object.keys(namedLayouts).map((name) => (
                    <div key={name} className="flex items-center group">
                      <button
                        onClick={() => {
                          handleLoadLayout(name);
                        }}
                        className="flex-1 text-left px-3 py-1.5 hover:bg-muted truncate"
                      >
                        {name}
                      </button>
                      <button
                        onClick={() => {
                          handleDeleteLayout(name);
                        }}
                        className="px-2 py-1 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded"
                        title="Delete layout"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Actions */}
              <div className="border-t my-1" />
              <button
                onClick={handleSaveAsLayout}
                className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"
              >
                <Save className="w-3 h-3" />
                Save Current As...
              </button>
              <button
                onClick={handleExportLayout}
                className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"
              >
                <Download className="w-3 h-3" />
                Export as JSON
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"
              >
                <Upload className="w-3 h-3" />
                Import from JSON
              </button>
            </div>
          )}
        </div>

        <div className="flex-1" />
        <button
          onClick={doSave}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-muted"
          title="Save (Cmd+S)"
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

      {/* Hidden file input for layout import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportLayout}
      />

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

      {/* Close layout menu when clicking outside */}
      {layoutMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setLayoutMenuOpen(false);
          }}
        />
      )}
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
