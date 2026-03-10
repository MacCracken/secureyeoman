// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('../../utils/crypto.js', () => ({
  uuidv7: () => 'test-uuid-001',
}));

import { VoiceProfileStore } from './voice-profile-store.js';

describe('VoiceProfileStore', () => {
  let store: VoiceProfileStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new VoiceProfileStore();
  });

  describe('create', () => {
    it('inserts a profile and returns the mapped result', async () => {
      const now = Date.now();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-uuid-001',
            name: 'My Voice',
            provider: 'openai',
            voice_id: 'alloy',
            settings: '{}',
            sample_audio_base64: null,
            created_by: 'admin',
            created_at: String(now),
            updated_at: String(now),
          },
        ],
        rowCount: 1,
      });

      const profile = await store.create({
        name: 'My Voice',
        provider: 'openai',
        voiceId: 'alloy',
      });

      expect(profile.id).toBe('test-uuid-001');
      expect(profile.name).toBe('My Voice');
      expect(profile.provider).toBe('openai');
      expect(profile.voiceId).toBe('alloy');
      expect(profile.settings).toEqual({});
      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockQuery.mock.calls[0]![0]).toContain('INSERT INTO voice.profiles');
    });
  });

  describe('getById', () => {
    it('returns a profile when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            name: 'Test',
            provider: 'elevenlabs',
            voice_id: 'voice-123',
            settings: { stability: 0.5 },
            sample_audio_base64: null,
            created_by: 'admin',
            created_at: '1700000000000',
            updated_at: '1700000000000',
          },
        ],
        rowCount: 1,
      });

      const profile = await store.getById('p1');
      expect(profile).not.toBeNull();
      expect(profile!.voiceId).toBe('voice-123');
      expect(profile!.settings).toEqual({ stability: 0.5 });
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const profile = await store.getById('nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('list', () => {
    it('returns profiles with total count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'p1',
              name: 'Voice A',
              provider: 'openai',
              voice_id: 'alloy',
              settings: '{}',
              sample_audio_base64: null,
              created_by: 'admin',
              created_at: '1700000000000',
              updated_at: '1700000000000',
            },
            {
              id: 'p2',
              name: 'Voice B',
              provider: 'elevenlabs',
              voice_id: 'voice-456',
              settings: '{}',
              sample_audio_base64: null,
              created_by: 'admin',
              created_at: '1700000000001',
              updated_at: '1700000000001',
            },
          ],
          rowCount: 2,
        });

      const result = await store.list();
      expect(result.total).toBe(2);
      expect(result.profiles).toHaveLength(2);
    });

    it('filters by provider', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'p1',
              name: 'Voice A',
              provider: 'openai',
              voice_id: 'alloy',
              settings: '{}',
              sample_audio_base64: null,
              created_by: 'admin',
              created_at: '1700000000000',
              updated_at: '1700000000000',
            },
          ],
          rowCount: 1,
        });

      const result = await store.list({ provider: 'openai' });
      expect(result.total).toBe(1);
      expect(mockQuery.mock.calls[0]![0]).toContain('provider = $1');
    });
  });

  describe('update', () => {
    it('updates fields and returns the updated profile', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            name: 'Updated Voice',
            provider: 'openai',
            voice_id: 'nova',
            settings: '{}',
            sample_audio_base64: null,
            created_by: 'admin',
            created_at: '1700000000000',
            updated_at: '1700000000001',
          },
        ],
        rowCount: 1,
      });

      const profile = await store.update('p1', { name: 'Updated Voice', voiceId: 'nova' });
      expect(profile).not.toBeNull();
      expect(profile!.name).toBe('Updated Voice');
      expect(profile!.voiceId).toBe('nova');
      expect(mockQuery.mock.calls[0]![0]).toContain('UPDATE voice.profiles');
    });

    it('returns null when profile not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const profile = await store.update('nonexistent', { name: 'X' });
      expect(profile).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when a row is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await store.delete('p1');
      expect(result).toBe(true);
    });

    it('returns false when no row is deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await store.delete('nonexistent');
      expect(result).toBe(false);
    });
  });
});
