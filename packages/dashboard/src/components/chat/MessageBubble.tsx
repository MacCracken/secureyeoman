import { memo } from 'react';
import {
  User,
  Bot,
  Brain,
  Bookmark,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Wrench,
  GitBranch,
} from 'lucide-react';
import type { Personality, CreationEvent } from '../../types';
import type { ChatMessage } from '../../types';
import { sanitizeText } from '../../utils/sanitize';
import { ChatMarkdown } from '../ChatMarkdown';
import { ThinkingBlock } from '../ThinkingBlock';
import { PersonalityAvatar } from '../PersonalitiesPage';

// ── MessageBubble ─────────────────────────────────────────────────────────────

export interface MessageBubbleProps {
  msg: ChatMessage;
  index: number;
  personality: Personality | undefined;
  isExpanded: boolean;
  isRemembered: boolean;
  feedbackValue: 'positive' | 'negative' | undefined;
  isBeingEdited: boolean;
  isPending: boolean;
  onToggleBrain: (i: number) => void;
  onRemember: (i: number) => void;
  onFeedback: (i: number, type: 'positive' | 'negative') => void;
  onEditStart: (i: number) => void;
  onBranch?: (i: number) => void;
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  index,
  personality,
  isExpanded,
  isRemembered,
  feedbackValue,
  isBeingEdited,
  isPending,
  onToggleBrain,
  onRemember,
  onFeedback,
  onEditStart,
  onBranch,
}: MessageBubbleProps) {
  const hasBrainContext =
    msg.role === 'assistant' &&
    msg.brainContext &&
    (msg.brainContext.memoriesUsed > 0 || msg.brainContext.knowledgeUsed > 0);

  return (
    <div className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] sm:max-w-[75%] md:max-w-[70%] rounded-lg px-4 py-3 break-words ${
          msg.role === 'user'
            ? isBeingEdited
              ? 'bg-primary/70 text-primary-foreground ring-2 ring-primary'
              : 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          {msg.role === 'user' ? (
            <User className="w-3 h-3" aria-label="User message" />
          ) : personality ? (
            <PersonalityAvatar personality={personality} size={12} />
          ) : (
            <Bot className="w-3 h-3" aria-label="Assistant message" />
          )}
          <span className="text-xs opacity-70">
            {msg.role === 'user' ? 'You' : (personality?.name ?? 'Assistant')}
          </span>
          {msg.model && (
            <span className="text-xs opacity-50" aria-hidden="true">
              {msg.model}
            </span>
          )}
          {msg.timestamp != null && (
            <span className="text-xs opacity-40 ml-auto" aria-hidden="true">
              {new Date(msg.timestamp).toLocaleDateString([], {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}{' '}
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}

          {/* Edit button on user messages */}
          {msg.role === 'user' && !isPending && (
            <button
              onClick={() => {
                onEditStart(index);
              }}
              className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              title="Edit and resend from here"
              data-testid={`edit-msg-${index}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}

          {/* Branch button */}
          {!isPending && onBranch && (
            <button
              onClick={() => {
                onBranch(index);
              }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              title="Branch from this message"
              data-testid={`branch-msg-${index}`}
            >
              <GitBranch className="w-3 h-3" />
            </button>
          )}

          {/* Brain context indicator */}
          {hasBrainContext && (
            <button
              onClick={() => {
                onToggleBrain(index);
              }}
              className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
              data-testid={`brain-indicator-${index}`}
              title="Brain context was used"
            >
              <Brain className="w-3 h-3" />
              <span>{msg.brainContext!.memoriesUsed + msg.brainContext!.knowledgeUsed}</span>
            </button>
          )}
        </div>

        {/* Brain context snippets popover */}
        {isExpanded && msg.brainContext && (
          <div
            className="mb-2 p-2 rounded bg-background/80 border text-xs space-y-1"
            data-testid={`brain-context-${index}`}
          >
            <div className="font-medium flex items-center gap-1">
              <Brain className="w-3 h-3" /> Brain Context
            </div>
            <div className="text-muted-foreground">
              {msg.brainContext.memoriesUsed} memories, {msg.brainContext.knowledgeUsed} knowledge
            </div>
            {msg.brainContext.contextSnippets.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                {msg.brainContext.contextSnippets.map((s, j) => (
                  <li key={j}>{sanitizeText(s)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Citation Sources (Phase 110) */}
        {msg.role === 'assistant' &&
          msg.citationsMeta?.sources &&
          msg.citationsMeta.sources.length > 0 && (
            <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sources</p>
              <ol className="text-xs space-y-1">
                {msg.citationsMeta.sources.map((src) => (
                  <li key={src.index} className="flex items-start gap-1.5">
                    <span className="font-mono text-blue-600 dark:text-blue-400 shrink-0">
                      [{src.index}]
                    </span>
                    <span>
                      {src.type === 'web_search' && src.url ? (
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {src.sourceLabel}
                        </a>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">{src.sourceLabel}</span>
                      )}
                      {src.documentTitle && (
                        <span className="text-gray-400 ml-1">({src.documentTitle})</span>
                      )}
                      <span
                        className={`ml-1 px-1 rounded text-[10px] ${
                          src.type === 'web_search'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : src.type === 'document_chunk'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                              : src.type === 'memory'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {src.type.replace('_', ' ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              {msg.groundingScore != null && (
                <div className="mt-1 flex items-center gap-1 text-xs">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      msg.groundingScore >= 0.7
                        ? 'bg-green-500'
                        : msg.groundingScore >= 0.4
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                  />
                  <span className="text-gray-500">
                    Grounding: {(msg.groundingScore * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          )}

        {/* Phase 1 — Thinking */}
        {msg.role === 'assistant' && msg.thinkingContent && (
          <ThinkingBlock thinking={msg.thinkingContent} />
        )}

        {/* Phase 2 — Tool use (badges + creation outcomes), shown before the response */}
        {msg.role === 'assistant' &&
          ((msg.toolCalls?.length ?? 0) > 0 || (msg.creationEvents?.length ?? 0) > 0) && (
            <div
              className={`space-y-1 mb-2 ${msg.thinkingContent ? 'border-t border-muted-foreground/15 pt-2 mt-1' : ''}`}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-1">
                <Wrench className="w-3 h-3 shrink-0" />
                <span>Tools used</span>
              </div>
              {/* Tool call badges */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {msg.toolCalls.map((tc, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      {tc.isMcp && tc.serverName ? `${tc.serverName}: ${tc.toolName}` : tc.label}
                    </span>
                  ))}
                </div>
              )}
              {/* Creation outcomes */}
              {msg.creationEvents?.map((ev: CreationEvent, j: number) => (
                <div
                  key={j}
                  className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-md border border-primary/20"
                  data-testid={`creation-event-${index}-${j}`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>
                    {ev.label} {ev.action ?? 'Created'}:{' '}
                    <strong className="font-medium">{sanitizeText(ev.name)}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}

        {/* Phase 3 — Response */}
        {msg.role === 'assistant' ? (
          <div
            className={
              msg.thinkingContent ||
              (msg.toolCalls?.length ?? 0) > 0 ||
              (msg.creationEvents?.length ?? 0) > 0
                ? 'border-t border-muted-foreground/15 pt-2 mt-1'
                : ''
            }
          >
            <ChatMarkdown content={sanitizeText(msg.content)} size="sm" />
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{sanitizeText(msg.content)}</p>
        )}

        <div className="flex items-center gap-2 mt-1">
          {msg.tokensUsed !== undefined && (
            <span className="text-xs opacity-50" aria-hidden="true">
              {msg.tokensUsed} tokens
            </span>
          )}

          {/* Remember button on assistant messages */}
          {msg.role === 'assistant' && (
            <button
              onClick={() => {
                onRemember(index);
              }}
              disabled={isRemembered}
              className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors ${
                isRemembered ? 'text-primary opacity-70' : 'opacity-40 hover:opacity-70'
              }`}
              data-testid={`remember-btn-${index}`}
              title={isRemembered ? 'Remembered' : 'Remember this response'}
            >
              <Bookmark className={`w-3 h-3 ${isRemembered ? 'fill-current' : ''}`} />
              {isRemembered ? 'Remembered' : 'Remember'}
            </button>
          )}

          {/* Feedback buttons on assistant messages */}
          {msg.role === 'assistant' && (
            <>
              <button
                onClick={() => {
                  onFeedback(index, 'positive');
                }}
                disabled={feedbackValue !== undefined}
                className={`inline-flex items-center p-0.5 rounded hover:bg-primary/10 transition-colors ${
                  feedbackValue === 'positive'
                    ? 'text-green-400 opacity-90'
                    : 'opacity-30 hover:opacity-60'
                }`}
                data-testid={`feedback-up-${index}`}
                title="Good response"
              >
                <ThumbsUp
                  className={`w-3 h-3 ${feedbackValue === 'positive' ? 'fill-current' : ''}`}
                />
              </button>
              <button
                onClick={() => {
                  onFeedback(index, 'negative');
                }}
                disabled={feedbackValue !== undefined}
                className={`inline-flex items-center p-0.5 rounded hover:bg-primary/10 transition-colors ${
                  feedbackValue === 'negative'
                    ? 'text-red-400 opacity-90'
                    : 'opacity-30 hover:opacity-60'
                }`}
                data-testid={`feedback-down-${index}`}
                title="Poor response"
              >
                <ThumbsDown
                  className={`w-3 h-3 ${feedbackValue === 'negative' ? 'fill-current' : ''}`}
                />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
