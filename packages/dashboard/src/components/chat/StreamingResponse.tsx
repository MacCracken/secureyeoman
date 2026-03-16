import { Bot, Wrench, Sparkles } from 'lucide-react';
import { ThinkingBlock } from '../ThinkingBlock';
import type { Personality } from '../../types';

// ── StreamingResponse ─────────────────────────────────────────────────────────

interface ActiveToolCall {
  toolName: string;
  label: string;
  isMcp?: boolean;
  serverName?: string;
}

export interface StreamingResponseProps {
  personality: Personality | null;
  streamingThinking: string | null;
  streamingContent: string | null;
  activeToolCalls: ActiveToolCall[];
  hadActiveTools: boolean;
}

export function StreamingResponse({
  personality,
  streamingThinking,
  streamingContent,
  activeToolCalls,
  hadActiveTools,
}: StreamingResponseProps) {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-muted rounded-lg px-4 py-3 max-w-[90%] sm:max-w-[75%] break-words">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-3 h-3" />
          <span className="text-xs opacity-70">{personality?.name ?? 'Assistant'}</span>
        </div>

        {/* Phase 1 — Live thinking */}
        {streamingThinking && <ThinkingBlock thinking={streamingThinking} live={true} />}

        {/* Phase 2 — Active tool calls */}
        {activeToolCalls.length > 0 && (
          <div
            className={`mb-2 ${streamingThinking ? 'border-t border-muted-foreground/15 pt-2 mt-1' : ''}`}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-1.5">
              <Wrench className="w-3 h-3 shrink-0" />
              <span>Using tools</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {activeToolCalls.map((tc) => (
                <span
                  key={tc.toolName}
                  className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full animate-pulse"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  {tc.isMcp ? `${tc.serverName}: ${tc.toolName}` : tc.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Phase 3 — Response */}
        {streamingContent ? (
          <div
            className={
              streamingThinking || hadActiveTools
                ? 'border-t border-muted-foreground/15 pt-2 mt-1'
                : ''
            }
          >
            <div className="text-sm whitespace-pre-wrap">{streamingContent}</div>
          </div>
        ) : (
          !streamingThinking &&
          activeToolCalls.length === 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground animate-pulse">Thinking</span>
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
