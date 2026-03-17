import type { PresenceUser } from '../../hooks/useCollabEditor.js';
import {
  Folder,
  Settings,
  Split,
  Play,
  Brain,
  Cpu,
  Bot,
  Globe,
  X,
  Plus,
  GitBranch,
  Search,
  Keyboard,
} from 'lucide-react';
import { CollabPresence } from './CollabPresence.js';
import { ModelWidget } from '../ModelWidget';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface EditorTab {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface EditorToolbarProps {
  tabs: EditorTab[];
  activeTabId: string;
  language: string;
  showExplorer: boolean;
  showChat: boolean;
  showWorld: boolean;
  settingsOpen: boolean;
  splitView: boolean;
  memoryEnabled: boolean;
  modelInfo: { current: { model: string } } | undefined;
  runDisabled: boolean;
  renamingTabId: string | null;
  renameValue: string;
  onToggleExplorer: () => void;
  onToggleChat: () => void;
  onToggleWorld: () => void;
  onToggleSettings: () => void;
  onToggleSplitView: () => void;
  onToggleMemory: () => void;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabRenameStart: (id: string, name: string) => void;
  onTabRenameChange: (value: string) => void;
  onTabRenameConfirm: () => void;
  onTabRenameCancel: () => void;
  onNewTab: () => void;
  onRun: () => void;
  onSendToChat: () => void;
  onCommandPalette: () => void;
  onToggleGit?: () => void;
  showGitButton?: boolean;
  onToggleKeybindings?: () => void;
  collabUsers?: PresenceUser[];
  collabConnected?: boolean;
}

export function EditorToolbar({
  tabs,
  activeTabId,
  language,
  showExplorer,
  showChat,
  showWorld,
  settingsOpen,
  splitView,
  memoryEnabled,
  modelInfo,
  runDisabled,
  renamingTabId,
  renameValue,
  onToggleExplorer,
  onToggleChat,
  onToggleWorld,
  onToggleSettings,
  onToggleSplitView,
  onToggleMemory,
  onTabClick,
  onTabClose,
  onTabRenameStart,
  onTabRenameChange,
  onTabRenameConfirm,
  onTabRenameCancel,
  onNewTab,
  onRun,
  onSendToChat,
  onCommandPalette,
  onToggleGit,
  showGitButton,
  onToggleKeybindings,
  collabUsers = [],
  collabConnected = false,
}: EditorToolbarProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-wrap">
      <button
        onClick={onToggleExplorer}
        className={`btn-ghost p-1 rounded ${showExplorer ? 'bg-primary/10 text-primary' : ''}`}
        title="Toggle file explorer"
      >
        <Folder className={`w-4 h-4 transition-transform`} />
      </button>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] sm:max-w-[300px]">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono whitespace-nowrap ${
              tab.id === activeTabId
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'hover:bg-muted/50 text-muted-foreground'
            }`}
            onClick={() => {
              onTabClick(tab.id);
            }}
          >
            {renamingTabId === tab.id ? (
              <input
                type="text"
                value={renameValue}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="max-w-[100px] bg-transparent border-b border-primary outline-none font-mono text-xs w-[80px]"
                onChange={(e) => {
                  onTabRenameChange(e.target.value);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onTabRenameConfirm();
                  } else if (e.key === 'Escape') {
                    onTabRenameCancel();
                  }
                }}
                onBlur={onTabRenameConfirm}
              />
            ) : (
              <span
                className="max-w-[80px] sm:max-w-[120px] truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onTabRenameStart(tab.id, tab.name);
                }}
                title="Double-click to rename"
              >
                {tab.name}
              </span>
            )}
            {tab.isDirty && renamingTabId !== tab.id && <span className="text-primary">●</span>}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="hover:text-destructive ml-1"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button onClick={onNewTab} className="btn-ghost p-1 rounded" title="New file">
          <Plus className="w-3 h-3" />
        </button>
      </div>
      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded hidden sm:inline">
        {language}
      </span>
      <div className="flex-1" />

      {/* Toolbar buttons */}
      <button
        onClick={onCommandPalette}
        className="btn-ghost p-1.5 rounded"
        title="Command Palette (Ctrl+K)"
      >
        <Search className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onToggleSettings}
        className={`btn-ghost p-1.5 rounded ${settingsOpen ? 'bg-primary/10 text-primary' : ''}`}
        title="Editor settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
      {onToggleKeybindings && (
        <button
          onClick={onToggleKeybindings}
          className="btn-ghost p-1.5 rounded"
          title="Keyboard shortcuts"
          data-testid="keybindings-btn"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        onClick={onToggleSplitView}
        className={`btn-ghost p-1.5 rounded ${splitView ? 'bg-primary/10 text-primary' : ''}`}
        title="Toggle split view"
      >
        <Split className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onRun}
        disabled={runDisabled}
        className="btn-ghost text-xs px-2 sm:px-3 py-1.5 rounded border hover:border-primary flex items-center gap-1"
        title="Run code in terminal (Ctrl+Enter)"
      >
        <Play className="w-3 h-3" />
        <span className="hidden sm:inline">Run</span>
      </button>
      <button
        onClick={onSendToChat}
        className="btn-ghost text-xs px-2 sm:px-3 py-1.5 rounded border hover:border-primary"
        title="Send selected text (or all) to chat"
      >
        <span className="hidden sm:inline">Send to Chat</span>
        <span className="sm:hidden">Send</span>
      </button>
      {/* Memory toggle */}
      <button
        onClick={onToggleMemory}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
          memoryEnabled
            ? 'bg-primary/15 border-primary/50 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        title={memoryEnabled ? 'Memory on — commands saved across sessions' : 'Memory off'}
      >
        <Brain className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">Mem</span>
      </button>

      {/* Model selector */}
      <div className="relative">
        <button
          ref={modelBtnRef}
          onClick={() => {
            setModelOpen((v) => !v);
          }}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Switch model"
        >
          <Cpu className="w-3.5 h-3.5" />
          <span className="hidden xl:inline max-w-[70px] truncate">
            {modelInfo?.current.model ?? 'Model'}
          </span>
        </button>
        {modelOpen && (
          <div className="absolute right-0 top-full mt-1 z-50">
            <ModelWidget
              onClose={() => {
                setModelOpen(false);
              }}
              onModelSwitch={() => {
                setModelOpen(false);
                void queryClient.invalidateQueries({ queryKey: ['model-info'] });
              }}
            />
          </div>
        )}
      </div>

      {/* Git toggle */}
      {showGitButton && (
        <button
          onClick={onToggleGit}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Toggle Git panel"
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Git</span>
        </button>
      )}

      {/* Collab presence */}
      <CollabPresence users={collabUsers} connected={collabConnected} />

      {/* Chat toggle */}
      <button
        onClick={onToggleChat}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
          showChat
            ? 'bg-primary/15 border-primary/50 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        title={showChat ? 'Hide chat panel' : 'Show chat panel'}
      >
        <Bot className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">Chat</span>
      </button>

      {/* Agent World toggle */}
      <button
        onClick={onToggleWorld}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
          showWorld
            ? 'bg-primary/15 border-primary/50 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground'
        }`}
        title={showWorld ? 'Hide agent world' : 'Show agent world'}
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">World</span>
      </button>
    </div>
  );
}
