import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Plus,
  FolderPlus,
  Trash2,
  Pencil,
  Loader2,
} from 'lucide-react';
import { executeTerminalCommand } from '../../api/client';

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

interface Props {
  cwd: string;
  onOpenFile: (path: string, name: string, content: string) => void;
  onCwdChange?: (cwd: string) => void;
}

function parseListing(output: string, parentPath: string): FileNode[] {
  if (!output.trim()) return [];
  return output
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const type: 'file' | 'directory' = line.startsWith('d') ? 'directory' : 'file';
      const name = line.substring(2).trim();
      return { name, type, path: `${parentPath}/${name}` };
    })
    .filter((n) => n.name && n.name !== '.' && n.name !== '..')
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function TreeNode({
  node,
  depth,
  onOpenFile,
  onRefreshParent,
  cwd,
}: {
  node: FileNode;
  depth: number;
  onOpenFile: Props['onOpenFile'];
  onRefreshParent: () => void;
  cwd: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [createName, setCreateName] = useState('');
  const queryClient = useQueryClient();

  const { data: children, isLoading } = useQuery({
    queryKey: ['dir-contents', node.path],
    queryFn: async () => {
      const result = await executeTerminalCommand(
        `find "${node.path}" -maxdepth 1 -mindepth 1 -printf "%y %f\\n"`,
        cwd
      );
      return parseListing(result.output || '', node.path);
    },
    enabled: node.type === 'directory' && expanded,
  });

  const handleClick = useCallback(async () => {
    if (node.type === 'directory') {
      setExpanded((v) => !v);
    } else {
      const result = await executeTerminalCommand(`cat "${node.path}"`, cwd);
      onOpenFile(node.path, node.name, result.output || '');
    }
  }, [node, cwd, onOpenFile]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContext = () => {
    setContextMenu(null);
  };

  const handleDelete = async () => {
    closeContext();
    const flag = node.type === 'directory' ? '-rf' : '';
    if (!window.confirm(`Delete "${node.name}"?`)) return;
    await executeTerminalCommand(`rm ${flag} "${node.path}"`, cwd);
    onRefreshParent();
  };

  const handleRename = async (newName: string) => {
    if (!newName.trim() || newName === node.name) {
      setRenaming(false);
      return;
    }
    const parent = node.path.substring(0, node.path.lastIndexOf('/'));
    await executeTerminalCommand(`mv "${node.path}" "${parent}/${newName}"`, cwd);
    setRenaming(false);
    onRefreshParent();
  };

  const handleCreate = async (type: 'file' | 'folder', name: string) => {
    if (!name.trim()) {
      setCreating(null);
      return;
    }
    const cmd =
      type === 'folder' ? `mkdir -p "${node.path}/${name}"` : `touch "${node.path}/${name}"`;
    await executeTerminalCommand(cmd, cwd);
    setCreating(null);
    setCreateName('');
    void queryClient.invalidateQueries({ queryKey: ['dir-contents', node.path] });
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 text-xs font-mono cursor-pointer hover:bg-muted/50 rounded group`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => void handleClick()}
        onContextMenu={handleContextMenu}
        data-testid={`tree-node-${node.name}`}
      >
        {node.type === 'directory' ? (
          <>
            {expanded ? (
              <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
            )}
            <Folder className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
          </>
        ) : (
          <>
            <span className="w-3 flex-shrink-0" />
            <File className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
          </>
        )}
        {renaming ? (
           
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="flex-1 bg-transparent border-b border-primary outline-none text-xs font-mono"
            value={renameValue}
            onChange={(e) => {
              setRenameValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRename(renameValue);
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={() => void handleRename(renameValue)}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
        {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={closeContext} />
          <div
            className="fixed z-50 bg-card border rounded-md shadow-lg py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            data-testid="context-menu"
          >
            {node.type === 'directory' && (
              <>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                  onClick={() => {
                    closeContext();
                    setCreating('file');
                    setExpanded(true);
                  }}
                >
                  <Plus className="w-3 h-3" /> New File
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                  onClick={() => {
                    closeContext();
                    setCreating('folder');
                    setExpanded(true);
                  }}
                >
                  <FolderPlus className="w-3 h-3" /> New Folder
                </button>
                <div className="border-t my-1" />
              </>
            )}
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() => {
                closeContext();
                setRenaming(true);
                setRenameValue(node.name);
              }}
            >
              <Pencil className="w-3 h-3" /> Rename
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-muted"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </>
      )}

      {/* Children */}
      {expanded &&
        children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onOpenFile={onOpenFile}
            onRefreshParent={() =>
              void queryClient.invalidateQueries({ queryKey: ['dir-contents', node.path] })
            }
            cwd={cwd}
          />
        ))}

      {/* Inline create input */}
      {creating && (
        <div
          className="flex items-center gap-1 px-2 py-1"
          style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
        >
          {creating === 'folder' ? (
            <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
          ) : (
            <File className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          { }
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="flex-1 bg-transparent border-b border-primary outline-none text-xs font-mono"
            placeholder={creating === 'folder' ? 'folder name...' : 'file name...'}
            value={createName}
            onChange={(e) => {
              setCreateName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate(creating, createName);
              if (e.key === 'Escape') {
                setCreating(null);
                setCreateName('');
              }
            }}
            onBlur={() => void handleCreate(creating, createName)}
          />
        </div>
      )}
    </div>
  );
}

export function ProjectExplorer({ cwd, onOpenFile, onCwdChange }: Props) {
  const [cwdInput, setCwdInput] = useState(cwd);
  const queryClient = useQueryClient();

  const { data: rootFiles, isLoading } = useQuery({
    queryKey: ['dir-contents', cwd],
    queryFn: async () => {
      const result = await executeTerminalCommand(
        `find "${cwd}" -maxdepth 1 -mindepth 1 -printf "%y %f\\n"`,
        cwd
      );
      return parseListing(result.output || '', cwd);
    },
  });

  const handleCwdSubmit = () => {
    const trimmed = cwdInput.trim();
    if (trimmed && trimmed !== cwd) {
      onCwdChange?.(trimmed);
    }
  };

  return (
    <div className="flex flex-col h-full border-r bg-card" data-testid="project-explorer">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30">
        <Folder className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium flex-1">Explorer</span>
        <button
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['dir-contents', cwd] })}
          className="text-muted-foreground hover:text-foreground p-0.5"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* CWD input */}
      <div className="px-2 py-1.5 border-b">
        <input
          type="text"
          value={cwdInput}
          onChange={(e) => {
            setCwdInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCwdSubmit();
          }}
          onBlur={handleCwdSubmit}
          className="w-full bg-transparent border border-border rounded px-1.5 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="/path/to/folder"
          title="Working directory"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {rootFiles?.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            onOpenFile={onOpenFile}
            onRefreshParent={() =>
              void queryClient.invalidateQueries({ queryKey: ['dir-contents', cwd] })
            }
            cwd={cwd}
          />
        ))}
        {rootFiles?.length === 0 && !isLoading && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">Empty directory</div>
        )}
      </div>
    </div>
  );
}
