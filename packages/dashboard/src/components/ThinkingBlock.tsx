import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

interface ThinkingBlockProps {
  thinking: string;
  live?: boolean;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function iterationCount(text: string): number {
  // Count separator markers inserted between iterations
  return (text.match(/\n\n---\n\n/g) ?? []).length + 1;
}

export function ThinkingBlock({ thinking, live }: ThinkingBlockProps) {
  const [open, setOpen] = useState(live ?? false);

  // Auto-open while streaming, auto-collapse on completion
  useEffect(() => {
    if (live) {
      setOpen(true);
    } else if (thinking) {
      setOpen(false);
    }
  }, [live, thinking]);

  if (!thinking) return null;

  const words = wordCount(thinking);
  const iters = iterationCount(thinking);

  return (
    <div className="mb-2 border-l-2 border-muted-foreground/30 pl-3 rounded-r bg-muted/30">
      <button
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 py-1.5 w-full text-left"
        aria-expanded={open}
      >
        <Brain
          className={`w-3 h-3 text-muted-foreground/70 shrink-0 ${live ? 'animate-pulse' : ''}`}
        />
        <span className="text-xs text-muted-foreground/80 font-medium">
          {live ? 'Thinking…' : `Thought for ~${words} words`}
          {!live && iters > 1 && ` (${iters} iterations)`}
        </span>
        <span className="ml-auto text-muted-foreground/50">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
      </button>

      {open && (
        <div className="text-xs text-muted-foreground/70 whitespace-pre-wrap max-h-64 overflow-y-auto pb-2 pr-1 font-mono leading-relaxed">
          {thinking}
        </div>
      )}
    </div>
  );
}
