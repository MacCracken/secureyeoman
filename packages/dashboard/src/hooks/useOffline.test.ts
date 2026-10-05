import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOffline } from './useOffline';

// Mock the offline-db module
vi.mock('../lib/offline-db', () => ({
  drainMutations: vi.fn().mockResolvedValue([]),
  removeMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/client', () => ({
  replayQueuedRequest: vi.fn(),
}));

import { drainMutations, removeMutation } from '../lib/offline-db';
import { replayQueuedRequest } from '../api/client';

const queued = (id: number) => ({ id, method: 'POST', url: `/api/v1/x/${id}`, body: { id } });

describe('useOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });

  it('should report online when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOffline());
    expect(result.current.isOnline).toBe(true);
  });

  it('should update when going offline', async () => {
    const { result } = renderHook(() => useOffline());
    expect(result.current.isOnline).toBe(true);

    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('should update when coming back online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const { result } = renderHook(() => useOffline());

    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('should start with zero pending count', () => {
    const { result } = renderHook(() => useOffline());
    expect(result.current.pendingCount).toBe(0);
  });

  it('should not be syncing initially', () => {
    const { result } = renderHook(() => useOffline());
    expect(result.current.syncing).toBe(false);
  });

  it('replays with the access token and keeps what the server did not take', async () => {
    // Offline, so only the explicit sync below runs (no auto-sync).
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    vi.mocked(drainMutations).mockResolvedValue([queued(1), queued(2), queued(3)]);
    vi.mocked(replayQueuedRequest)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const { result } = renderHook(() => useOffline());

    await act(async () => {
      await result.current.syncPending();
    });

    expect(replayQueuedRequest).toHaveBeenCalledWith('POST', '/api/v1/x/1', { id: 1 });
    // The 401 (an expired session) stops the sync with #2 still queued.
    expect(removeMutation).toHaveBeenCalledTimes(1);
    expect(removeMutation).toHaveBeenCalledWith(1);
    expect(replayQueuedRequest).toHaveBeenCalledTimes(2);
  });

  it('drops a mutation the server refuses for good', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    vi.mocked(drainMutations).mockResolvedValue([queued(7)]);
    vi.mocked(replayQueuedRequest).mockResolvedValueOnce(new Response(null, { status: 400 }));
    const { result } = renderHook(() => useOffline());

    await act(async () => {
      await result.current.syncPending();
    });

    expect(removeMutation).toHaveBeenCalledWith(7);
  });
});
