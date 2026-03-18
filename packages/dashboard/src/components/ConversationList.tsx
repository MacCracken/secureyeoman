import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Download,
  Share2,
  Link,
  FileText,
  FileJson,
  FileType,
} from 'lucide-react';
import {
  fetchConversations,
  deleteConversation,
  renameConversation,
  exportConversation,
  createShareLink,
  type Conversation,
  type ConversationExportFormat,
} from '../api/client';

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function ConversationList({
  activeConversationId,
  onSelect,
  onNew,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: ConversationListProps) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const { data } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => fetchConversations({ limit: 100 }),
    refetchInterval: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_result, deletedId) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (activeConversationId === deletedId) {
        onSelect(null);
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(id, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setEditingId(null);
    },
  });

  const [exportMenuId, setExportMenuId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuId) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [exportMenuId]);

  // Auto-dismiss share toast
  useEffect(() => {
    if (!shareToast) return;
    const timer = setTimeout(() => {
      setShareToast(null);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [shareToast]);

  const handleExport = useCallback(async (id: string, format: ConversationExportFormat) => {
    setExportMenuId(null);
    try {
      await exportConversation(id, format);
    } catch {
      // Export failed — silently ignore as the download simply won't appear
    }
  }, []);

  const shareMutation = useMutation({
    mutationFn: (id: string) => createShareLink(id),
    onSuccess: (data) => {
      const fullUrl = `${window.location.origin}${data.url}`;
      void navigator.clipboard.writeText(fullUrl).then(() => {
        setShareToast('Share link copied to clipboard!');
      });
    },
  });

  const handleStartRename = useCallback((conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  }, []);

  const handleSubmitRename = useCallback(() => {
    if (editingId && editTitle.trim()) {
      renameMutation.mutate({ id: editingId, title: editTitle.trim() });
    }
  }, [editingId, editTitle, renameMutation]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditTitle('');
  }, []);

  // Close mobile panel on selection
  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id);
      onMobileClose();
    },
    [onSelect, onMobileClose]
  );

  const handleNew = useCallback(() => {
    onNew();
    onMobileClose();
  }, [onNew, onMobileClose]);

  // Close on escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [mobileOpen, onMobileClose]);

  const conversations = data?.conversations ?? [];

  const listContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <span className="text-sm font-medium">Conversations</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNew}
            className="btn-ghost p-1.5 rounded"
            aria-label="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* Hide collapse on mobile — use backdrop dismiss instead */}
          <button
            onClick={onToggleCollapse}
            className="btn-ghost p-1.5 rounded hidden md:flex"
            aria-label="Collapse"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onMobileClose}
            className="btn-ghost p-1.5 rounded md:hidden"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No conversations yet
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
              activeConversationId === conv.id
                ? 'bg-primary/15 border-l-2 border-primary'
                : 'hover:bg-muted/50'
            }`}
            onClick={() => {
              if (editingId !== conv.id) handleSelect(conv.id);
            }}
          >
            {conv.parentConversationId ? (
              <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            )}

            {editingId === conv.id ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmitRename();
                    if (e.key === 'Escape') handleCancelRename();
                  }}
                  className="flex-1 min-w-0 text-xs bg-background border rounded px-1.5 py-1"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubmitRename();
                  }}
                  className="p-1"
                >
                  <Check className="w-3.5 h-3.5 text-success" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelRename();
                  }}
                  className="p-1"
                >
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{conv.title}</p>
                  <p className="text-[10px] text-muted-foreground">{conv.messageCount} msgs</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 md:transition-opacity">
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExportMenuId(exportMenuId === conv.id ? null : conv.id);
                      }}
                      className="p-1 hover:text-primary"
                      aria-label="Export"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {exportMenuId === conv.id && (
                      <div
                        ref={exportMenuRef}
                        className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border bg-popover shadow-md"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <button
                          onClick={() => {
                            void handleExport(conv.id, 'markdown');
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                        >
                          <FileText className="w-3 h-3" />
                          Markdown
                        </button>
                        <button
                          onClick={() => {
                            void handleExport(conv.id, 'json');
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                        >
                          <FileJson className="w-3 h-3" />
                          JSON
                        </button>
                        <button
                          onClick={() => {
                            void handleExport(conv.id, 'text');
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                        >
                          <FileType className="w-3 h-3" />
                          Plain Text
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      shareMutation.mutate(conv.id);
                    }}
                    className="p-1 hover:text-primary"
                    aria-label="Share"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(conv);
                    }}
                    className="p-1 hover:text-primary"
                    aria-label="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(conv.id);
                    }}
                    className="p-1 hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Share toast */}
      {shareToast && (
        <div className="absolute bottom-2 left-2 right-2 z-50 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground shadow-md flex items-center gap-2">
          <Link className="w-3.5 h-3.5 flex-shrink-0" />
          {shareToast}
        </div>
      )}
    </>
  );

  // ── Mobile: slide-over drawer ────────────────────────────────
  // Rendered as a fixed overlay on small screens
  const mobileDrawer = (
    <>
      {/* Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onMobileClose} />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card border-r flex flex-col transform transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {listContent}
      </div>
    </>
  );

  // ── Desktop collapsed: icon rail ─────────────────────────────
  if (collapsed) {
    return (
      <>
        {mobileDrawer}
        <div className="hidden md:flex flex-col items-center py-2 border-r w-10 flex-shrink-0">
          <button
            onClick={onToggleCollapse}
            className="btn-ghost p-1.5 rounded mb-2"
            aria-label="Expand conversations"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onNew}
            className="btn-ghost p-1.5 rounded mb-2"
            aria-label="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
          {conversations.slice(0, 10).map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                onSelect(conv.id);
              }}
              className={`p-1.5 rounded mb-0.5 transition-colors ${
                activeConversationId === conv.id ? 'bg-primary/15 text-primary' : 'btn-ghost'
              }`}
              aria-label={conv.title}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </>
    );
  }

  // ── Desktop expanded: sidebar panel ──────────────────────────
  return (
    <>
      {mobileDrawer}
      <div className="hidden md:flex flex-col border-r w-64 flex-shrink-0 overflow-hidden">
        {listContent}
      </div>
    </>
  );
}
