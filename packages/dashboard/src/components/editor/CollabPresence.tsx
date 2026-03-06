/**
 * CollabPresence — compact presence indicator for the editor toolbar.
 *
 * Shows colored dots for other connected users with a tooltip-style label.
 * Renders null when no other users are connected.
 */

import { Users } from 'lucide-react';
import type { PresenceUser } from '../../hooks/useCollabEditor.js';

interface CollabPresenceProps {
  users: PresenceUser[];
  connected: boolean;
}

export function CollabPresence({ users, connected }: CollabPresenceProps) {
  if (!connected && users.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border text-muted-foreground"
      data-testid="collab-presence"
    >
      <Users className="w-3.5 h-3.5" />
      {users.length > 0 ? (
        <div className="flex items-center gap-1">
          <div className="flex -space-x-1">
            {users.slice(0, 4).map((u) => (
              <span
                key={u.clientId}
                className="w-4 h-4 rounded-full border border-background flex-shrink-0 text-[8px] font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: u.color }}
                title={u.name}
                data-testid="collab-user-dot"
              >
                {u.name.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
          {users.length > 4 && <span className="text-[10px]">+{users.length - 4}</span>}
        </div>
      ) : (
        connected && <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
      )}
    </div>
  );
}
