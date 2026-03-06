// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CollabPresence } from './CollabPresence';
import type { PresenceUser } from '../../hooks/useCollabEditor';

describe('CollabPresence', () => {
  it('renders null when not connected and no users', () => {
    const { container } = render(<CollabPresence users={[]} connected={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows green dot when connected with no other users', () => {
    render(<CollabPresence users={[]} connected={true} />);
    expect(screen.getByTestId('collab-presence')).toBeInTheDocument();
  });

  it('shows user dots for presence users', () => {
    const users: PresenceUser[] = [
      { clientId: 'c1', name: 'Alice', color: '#6366f1' },
      { clientId: 'c2', name: 'Bob', color: '#ec4899' },
    ];
    render(<CollabPresence users={users} connected={true} />);
    const dots = screen.getAllByTestId('collab-user-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveTextContent('A');
    expect(dots[1]).toHaveTextContent('B');
  });

  it('limits displayed dots to 4 and shows overflow count', () => {
    const users: PresenceUser[] = Array.from({ length: 6 }, (_, i) => ({
      clientId: `c${i}`,
      name: `User ${i}`,
      color: '#6366f1',
    }));
    render(<CollabPresence users={users} connected={true} />);
    const dots = screen.getAllByTestId('collab-user-dot');
    expect(dots).toHaveLength(4);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
