import { memo, useState, useCallback } from 'react';
import { NodeProps, NodeResizer } from 'reactflow';
import {
  Terminal,
  Code2,
  Pin,
  Globe2,
  Brain,
  Columns,
  GitBranch,
  GitMerge,
  Activity,
  LayoutDashboard,
  MessageSquare,
  PenTool,
  CandlestickChart as CandlestickIcon,
  ShieldCheck,
  GraduationCap,
  SlidersHorizontal,
  Layers,
  RefreshCcw,
  ShieldAlert,
  DollarSign,
  X,
  Minus,
  Maximize2,
} from 'lucide-react';
import type { CanvasWidgetType } from './canvas-registry';
import { TerminalWidget } from './widgets/TerminalWidget';
import { EditorWidget } from './widgets/EditorWidget';
import { FrozenOutputWidget } from './widgets/FrozenOutputWidget';
import { AgentWorldNode } from './widgets/AgentWorldNode';
import { TrainingLiveNode } from './widgets/TrainingLiveNode';
import { TaskKanbanWidget } from './widgets/TaskKanbanWidget';
import { GitPanelWidget } from './widgets/GitPanelWidget';
import { PipelineWidget } from './widgets/PipelineWidget';
import { CicdMonitorWidget } from './widgets/CicdMonitorWidget';
import { MissionCardNode } from './widgets/MissionCardNode';
import { ChatWidget } from './widgets/ChatWidget';
import { ExcalidrawWidget } from './widgets/ExcalidrawWidget';
import { TradingDashboardWidget } from '../finance/TradingDashboardWidget';
import { EntityWidget } from '../EntityWidget';

export interface CanvasWidgetConfig {
  worktreeId?: string;
  filePath?: string;
  workflowRunId?: string;
  provider?: string;
  missionCardId?: string;
  frozenContent?: {
    command: string;
    output: string;
    exitCode: number;
    timestamp: string;
  };
  excalidrawSceneJson?: string;
  excalidrawDocumentId?: string;
}

export interface CanvasWidgetData {
  widgetType: CanvasWidgetType;
  title: string;
  minimized: boolean;
  config: CanvasWidgetConfig;
  onClose?: (nodeId: string) => void;
  onFreezeOutput?: (nodeId: string, command: string, output: string, exitCode: number) => void;
  onConfigChange?: (nodeId: string, config: CanvasWidgetConfig) => void;
}

const WIDGET_ICONS: Record<CanvasWidgetType, React.ReactNode> = {
  terminal: <Terminal className="w-3.5 h-3.5" />,
  editor: <Code2 className="w-3.5 h-3.5" />,
  'frozen-output': <Pin className="w-3.5 h-3.5" />,
  'agent-world': <Globe2 className="w-3.5 h-3.5" />,
  'the-entity': <Brain className="w-3.5 h-3.5" />,
  'training-live': <Brain className="w-3.5 h-3.5" />,
  'task-kanban': <Columns className="w-3.5 h-3.5" />,
  'git-panel': <GitBranch className="w-3.5 h-3.5" />,
  pipeline: <GitMerge className="w-3.5 h-3.5" />,
  'cicd-monitor': <Activity className="w-3.5 h-3.5" />,
  'mission-card': <LayoutDashboard className="w-3.5 h-3.5" />,
  chat: <MessageSquare className="w-3.5 h-3.5" />,
  excalidraw: <PenTool className="w-3.5 h-3.5" />,
  'trading-dashboard': <CandlestickIcon className="w-3.5 h-3.5" />,
  'tee-status': <ShieldCheck className="w-3.5 h-3.5" />,
  'advanced-training': <GraduationCap className="w-3.5 h-3.5" />,
  'hyperparam-search': <SlidersHorizontal className="w-3.5 h-3.5" />,
  'batch-inference': <Layers className="w-3.5 h-3.5" />,
  'continual-learning': <RefreshCcw className="w-3.5 h-3.5" />,
  'dlp-overview': <ShieldAlert className="w-3.5 h-3.5" />,
  'cost-optimizer': <DollarSign className="w-3.5 h-3.5" />,
};

function WidgetContent({ data, nodeId }: { data: CanvasWidgetData; nodeId: string }) {
  const { widgetType, config } = data;

  const onFreezeOutput = data.onFreezeOutput
    ? (cmd: string, out: string, code: number) => {
        data.onFreezeOutput!(nodeId, cmd, out, code);
      }
    : undefined;

  const onConfigChange = data.onConfigChange
    ? (cfg: CanvasWidgetConfig) => {
        data.onConfigChange!(nodeId, cfg);
      }
    : undefined;

  switch (widgetType) {
    case 'terminal':
      return <TerminalWidget worktreeId={config.worktreeId} onFreezeOutput={onFreezeOutput} />;
    case 'editor':
      return (
        <EditorWidget
          filePath={config.filePath}
          onConfigChange={(fp) => onConfigChange?.({ ...config, filePath: fp })}
        />
      );
    case 'frozen-output':
      return <FrozenOutputWidget content={config.frozenContent} />;
    case 'agent-world':
      return <AgentWorldNode />;
    case 'the-entity':
      return <EntityWidget state="thinking" height={280} showLabel />;
    case 'training-live':
      return <TrainingLiveNode />;
    case 'task-kanban':
      return <TaskKanbanWidget />;
    case 'git-panel':
      return <GitPanelWidget worktreeId={config.worktreeId} />;
    case 'pipeline':
      return (
        <PipelineWidget
          workflowRunId={config.workflowRunId}
          onConfigChange={(id) => onConfigChange?.({ ...config, workflowRunId: id })}
        />
      );
    case 'cicd-monitor':
      return <CicdMonitorWidget provider={config.provider} />;
    case 'mission-card':
      return (
        <MissionCardNode
          cardId={config.missionCardId}
          onConfigChange={(cfg) => onConfigChange?.({ ...config, ...cfg })}
        />
      );
    case 'chat':
      return <ChatWidget />;
    case 'excalidraw':
      return (
        <ExcalidrawWidget
          sceneJson={config.excalidrawSceneJson}
          documentId={config.excalidrawDocumentId}
          nodeId={nodeId}
          onConfigChange={(cfg) => onConfigChange?.({ ...config, ...cfg })}
        />
      );
    case 'trading-dashboard':
      return (
        <TradingDashboardWidget
          nodeId={nodeId}
          onConfigChange={(cfg) => onConfigChange?.({ ...config, ...cfg })}
        />
      );
    case 'tee-status':
      return <div className="p-4 text-muted-foreground text-sm">TEE Status</div>;
    case 'advanced-training':
      return <div className="p-4 text-muted-foreground text-sm">Advanced Training</div>;
    case 'hyperparam-search':
      return <div className="p-4 text-muted-foreground text-sm">Hyperparam Search</div>;
    case 'batch-inference':
      return <div className="p-4 text-muted-foreground text-sm">Batch Inference</div>;
    case 'continual-learning':
      return <div className="p-4 text-muted-foreground text-sm">Continual Learning</div>;
    case 'dlp-overview':
      return <div className="p-4 text-muted-foreground text-sm">DLP Overview</div>;
    case 'cost-optimizer':
      return <div className="p-4 text-muted-foreground text-sm">Cost Optimizer</div>;
    default:
      return <div className="p-4 text-muted-foreground text-sm">Unknown widget type</div>;
  }
}

export const CanvasWidget = memo(function CanvasWidget({
  id,
  data,
  selected,
}: NodeProps<CanvasWidgetData>) {
  const [minimized, setMinimized] = useState(data.minimized ?? false);
  const [fullscreen, setFullscreen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(data.title);

  const handleClose = useCallback(() => {
    data.onClose?.(id);
  }, [id, data]);

  const handleMinimize = useCallback(() => {
    setMinimized((v) => !v);
  }, []);

  const handleFullscreen = useCallback(() => {
    setFullscreen((v) => !v);
  }, []);

  const titleBar = (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/60 border-b select-none cursor-grab active:cursor-grabbing"
      onDoubleClick={handleFullscreen}
    >
      <span className="text-muted-foreground">{WIDGET_ICONS[data.widgetType]}</span>
      {editingTitle ? (
        <input
          autoFocus
          className="flex-1 text-xs font-medium bg-transparent border-b border-primary outline-none min-w-0"
          value={titleInput}
          onChange={(e) => {
            setTitleInput(e.target.value);
          }}
          onBlur={() => {
            setEditingTitle(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setEditingTitle(false);
          }}
        />
      ) : (
        <span
          className="flex-1 text-xs font-medium truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingTitle(true);
          }}
        >
          {titleInput}
        </span>
      )}
      <button
        onClick={handleMinimize}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        title={minimized ? 'Expand' : 'Minimize'}
      >
        <Minus className="w-3 h-3" />
      </button>
      <button
        onClick={handleFullscreen}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        title="Fullscreen"
      >
        <Maximize2 className="w-3 h-3" />
      </button>
      <button
        onClick={handleClose}
        className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
        title="Close"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${titleInput} — fullscreen`}
        className="fixed inset-0 z-[9999] bg-background flex flex-col"
        style={{ pointerEvents: 'all' }}
      >
        {titleBar}
        <div className="flex-1 overflow-auto">
          <WidgetContent data={data} nodeId={id} />
        </div>
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        color="var(--color-primary, #6366f1)"
        isVisible={selected}
        minWidth={240}
        minHeight={minimized ? 36 : 160}
      />
      <div
        className="bg-card border rounded-lg shadow-md flex flex-col overflow-hidden"
        style={{ width: '100%', height: '100%', minWidth: 240 }}
      >
        {titleBar}
        {!minimized && (
          <div className="flex-1 overflow-auto">
            <WidgetContent data={data} nodeId={id} />
          </div>
        )}
      </div>
    </>
  );
});
