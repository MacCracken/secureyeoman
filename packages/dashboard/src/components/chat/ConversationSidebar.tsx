import {
  Loader2,
  Plus,
  Trash2,
  MessageSquare,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import type { Personality, Conversation } from '../../types';
import { PersonalityAvatar } from '../PersonalitiesPage';

// ── ConversationSidebar ───────────────────────────────────────────────────────

export interface ConversationSidebarProps {
  conversations: Conversation[];
  conversationsLoading: boolean;
  selectedConversationId: string | null;
  editingConversationId: string | null;
  editTitle: string;
  personality: Personality | null;
  onNewChat: () => void;
  onSelectConversation: (conv: Conversation) => void;
  onDeleteConversation: (e: React.MouseEvent, id: string) => void;
  onStartRename: (e: React.MouseEvent, conv: Conversation) => void;
  onConfirmRename: (e: React.MouseEvent) => void;
  onCancelRename: (e: React.MouseEvent) => void;
  onEditTitleChange: (title: string) => void;
  onClose: () => void;
}

export function ConversationSidebar({
  conversations,
  conversationsLoading,
  selectedConversationId,
  editingConversationId,
  editTitle,
  personality,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onEditTitleChange,
  onClose,
}: ConversationSidebarProps) {
  return (
    <>
      {/* Backdrop on mobile */}
      <div
        className="fixed inset-0 bg-black/30 z-20 sm:hidden"
        onClick={onClose}
      />
      <div
        className="fixed left-0 top-0 bottom-0 w-72 bg-background z-30 border-r p-3 flex flex-col sm:static sm:w-64 sm:z-auto sm:p-0 sm:pr-3"
        data-testid="conversation-sidebar"
      >
        {/* Mobile header */}
        <div className="flex items-center justify-between mb-2 sm:hidden">
          <span className="text-sm font-semibold">Conversations</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onNewChat}
          className="flex items-center gap-2 w-full px-3 py-2 mb-2 rounded-lg btn-primary text-sm"
          data-testid="new-chat-btn"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
          {conversationsLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => {
                onSelectConversation(conv);
              }}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                selectedConversationId === conv.id
                  ? 'bg-primary/15 border-l-2 border-primary'
                  : 'hover:bg-muted/50'
              }`}
              data-testid={`conversation-item-${conv.id}`}
            >
              {personality ? (
                <div className="w-4 h-4 flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-muted text-muted-foreground">
                  <PersonalityAvatar personality={personality} size={16} />
                </div>
              ) : (
                <MessageSquare className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                {editingConversationId === conv.id ? (
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <input
                      value={editTitle}
                      onChange={(e) => {
                        onEditTitleChange(e.target.value);
                      }}
                      className="flex-1 min-w-0 text-sm bg-background border rounded px-1 py-0.5"
                      autoFocus
                      data-testid="rename-input"
                    />
                    <button
                      onClick={onConfirmRename}
                      className="text-primary hover:text-primary/80"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={onCancelRename}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span className="truncate block">{conv.title}</span>
                )}
              </div>
              {editingConversationId !== conv.id && (
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      onStartRename(e, conv);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid={`rename-btn-${conv.id}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      onDeleteConversation(e, conv.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`delete-btn-${conv.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {!conversationsLoading && conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No conversations yet
            </p>
          )}
        </div>
      </div>
    </>
  );
}
