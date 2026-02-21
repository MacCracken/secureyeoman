/**
 * PresenceBanner — shows who else is currently editing the same document.
 *
 * Renders null when there are no other users.
 * Shows colored presence dots and a human-readable label.
 */

import type { PresenceUser } from '../hooks/useCollabEditor.js';

interface PresenceBannerProps {
  users: PresenceUser[];
}

function formatLabel(users: PresenceUser[]): string {
  if (users.length === 0) return '';
  if (users.length === 1) return `${users[0].name} is also editing this`;
  if (users.length === 2) {
    return `${users[0].name} and ${users[1].name} are also editing this`;
  }
  return `${users[0].name} and ${users.length - 1} others are also editing this`;
}

export function PresenceBanner({ users }: PresenceBannerProps): JSX.Element | null {
  if (users.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs"
      data-testid="presence-banner"
    >
      <div className="flex -space-x-1">
        {users.slice(0, 4).map((u) => (
          <span
            key={u.clientId}
            className="w-4 h-4 rounded-full border border-white flex-shrink-0"
            style={{ backgroundColor: u.color }}
            title={u.name}
            data-testid="presence-dot"
          />
        ))}
      </div>
      <span>{formatLabel(users)}</span>
    </div>
  );
}
