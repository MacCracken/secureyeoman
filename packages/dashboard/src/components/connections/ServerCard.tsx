import { Terminal, Globe, Power, PowerOff, Trash2 } from 'lucide-react';
import type { McpServerConfig } from '../../types';

export function ServerCard({
  server,
  toolCount,
  onDelete,
  onToggle,
  isToggling,
  isDeleting,
}: {
  server: McpServerConfig;
  toolCount: number;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
  isDeleting: boolean;
}) {
  const transportIcon =
    server.transport === 'stdio' ? <Terminal className="w-5 h-5" /> : <Globe className="w-5 h-5" />;

  return (
    <div className={`card p-3 sm:p-4 ${!server.enabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="p-1.5 sm:p-2 rounded-lg bg-surface text-muted-foreground shrink-0">
          {transportIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-sm truncate">{server.name}</h3>
            <button
              onClick={() => {
                onToggle(!server.enabled);
              }}
              disabled={isToggling}
              className={`text-xs flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full transition-colors ${
                server.enabled
                  ? 'text-green-400 hover:bg-green-400/10'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {server.enabled ? (
                <>
                  <Power className="w-3 h-3" /> Enabled
                </>
              ) : (
                <>
                  <PowerOff className="w-3 h-3" /> Disabled
                </>
              )}
            </button>
          </div>
          {server.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{server.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-xs text-muted-foreground">
            <span className="px-1.5 py-0.5 rounded bg-muted/50">{server.transport}</span>
            {server.transport === 'stdio' && server.command && (
              <span className="truncate font-mono max-w-[120px] sm:max-w-[200px]">
                {server.command}
              </span>
            )}
            {server.transport !== 'stdio' && server.url && (
              <span className="truncate font-mono max-w-[120px] sm:max-w-[200px]">
                {server.url}
              </span>
            )}
            <span className="shrink-0">{toolCount} tools</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          Remove
        </button>
      </div>
    </div>
  );
}
