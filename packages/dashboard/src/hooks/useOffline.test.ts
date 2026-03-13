import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOffline } from './useOffline';

// Mock the offline-db module
vi.mock('../lib/offline-db', () => ({
  drainMutations: vi.fn().mockResolvedValue([]),
  removeMutation: vi.fn().mockResolvedValue(undefined),
}));

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
});
