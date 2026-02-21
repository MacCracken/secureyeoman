import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PresenceBanner } from './PresenceBanner';
import type { PresenceUser } from '../hooks/useCollabEditor';

const makeUser = (n: number): PresenceUser => ({
  clientId: `c${n}`,
  name: `User${n}`,
  color: '#ff0000',
});

describe('PresenceBanner', () => {
  it('renders null when there are no users', () => {
    const { container } = render(<PresenceBanner users={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows single user correctly', () => {
    render(<PresenceBanner users={[makeUser(1)]} />);
    expect(screen.getByText('User1 is also editing this')).toBeInTheDocument();
  });

  it('shows two users correctly', () => {
    render(<PresenceBanner users={[makeUser(1), makeUser(2)]} />);
    expect(screen.getByText('User1 and User2 are also editing this')).toBeInTheDocument();
  });

  it('shows "N others" format for three or more users', () => {
    render(<PresenceBanner users={[makeUser(1), makeUser(2), makeUser(3)]} />);
    expect(screen.getByText('User1 and 2 others are also editing this')).toBeInTheDocument();
  });

  it('renders a colored dot per user (up to 4)', () => {
    const users = [makeUser(1), makeUser(2), makeUser(3), makeUser(4), makeUser(5)];
    render(<PresenceBanner users={users} />);
    const dots = screen.getAllByTestId('presence-dot');
    expect(dots.length).toBe(4); // capped at 4
  });

  it('applies user color to each dot', () => {
    const users: PresenceUser[] = [{ clientId: 'c1', name: 'Alice', color: '#aabbcc' }];
    render(<PresenceBanner users={users} />);
    const dot = screen.getByTestId('presence-dot');
    expect(dot).toHaveStyle({ backgroundColor: '#aabbcc' });
  });

  it('renders the presence-banner wrapper', () => {
    render(<PresenceBanner users={[makeUser(1)]} />);
    expect(screen.getByTestId('presence-banner')).toBeInTheDocument();
  });
});
