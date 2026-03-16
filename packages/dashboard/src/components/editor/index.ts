// Barrel file for editor/ sub-components
export { MultiTerminal } from './MultiTerminal';
export type { MultiTerminalProps } from './MultiTerminal';
export { SessionsPanel, HistoryPanel, ExecutionGated } from './BottomPanels';
export {
  type MonacoEditor,
  type BottomTab,
  type EditorTab,
  LANG_MAP,
  detectLanguage,
  generateId,
  createEditorTab,
  formatDuration,
  RUN_COMMANDS,
  SESSION_STATUS_ICONS,
  SESSION_STATUS_COLORS,
} from './shared';
export { CommandPalette } from './CommandPalette';
export { ProjectExplorer } from './ProjectExplorer';
export { GitPanel } from './GitPanel';
export { EditorToolbar } from './EditorToolbar';
export { KeybindingsEditor } from './KeybindingsEditor';
export { AiPlanPanel } from './AiPlanPanel';
export type { AiPlan, PlanStep } from './AiPlanPanel';
export { SearchPanel } from './SearchPanel';
export { useAnnotationContextMenu } from './AnnotationContextMenu';
