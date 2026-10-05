// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './useAuth';

vi.mock('../api/client', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  setAuthTokens: vi.fn(),
  getAccessToken: vi.fn(),
  setOnAuthFailure: vi.fn(),
  verifySession: vi.fn(),
}));

import * as api from '../api/client';

function LogoutButton() {
  const { logout } = useAuth();
  return <button onClick={() => void logout()}>Log out</button>;
}

function renderWithCache() {
  const queryClient = new QueryClient();
  // Data cached while the previous user was signed in.
  queryClient.setQueryData(['personalities'], { personalities: [{ id: 'p1' }] });
  queryClient.setQueryData(['conversations'], { conversations: [{ id: 'c1' }] });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LogoutButton />} />
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return queryClient;
}

describe('AuthProvider session end', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getAccessToken).mockReturnValue('token');
    vi.mocked(api.verifySession).mockResolvedValue(true);
    vi.mocked(api.logout).mockResolvedValue(undefined);
  });

  it('clears the query cache on logout so the next user sees none of it', async () => {
    const queryClient = renderWithCache();

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalled();
    expect(queryClient.getQueryData(['personalities'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('clears the query cache when a failed token refresh ends the session', async () => {
    const queryClient = renderWithCache();
    await waitFor(() => {
      expect(api.setOnAuthFailure).toHaveBeenCalled();
    });
    const onAuthFailure = vi.mocked(api.setOnAuthFailure).mock.lastCall![0];

    act(() => {
      onAuthFailure();
    });

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
