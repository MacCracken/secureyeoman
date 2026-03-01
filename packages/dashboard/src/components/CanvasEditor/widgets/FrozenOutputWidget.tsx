interface FrozenContent {
  command: string;
  output: string;
  exitCode: number;
  timestamp: string;
}

interface Props {
  content?: FrozenContent;
}

export function FrozenOutputWidget({ content }: Props) {
  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        No pinned output
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      <div className="px-2 py-1 border-b text-[10px] text-muted-foreground flex items-center justify-between">
        <span>$ {content.command}</span>
        <span className={content.exitCode === 0 ? 'text-green-500' : 'text-destructive'}>
          exit {content.exitCode}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2 bg-background">
        <pre className="whitespace-pre-wrap text-foreground">{content.output}</pre>
      </div>
      <div className="px-2 py-0.5 border-t text-[9px] text-muted-foreground">
        {new Date(content.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}
