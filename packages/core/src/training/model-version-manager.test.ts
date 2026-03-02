import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { SoulStorage } from '../soul/storage.js';
import { ModelVersionManager } from './model-version-manager.js';

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockClientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockClient = {
  query: mockClientQuery,
  release: vi.fn(),
} as unknown as PoolClient;

const mockPool = {
  query: mockQuery,
  connect: vi.fn().mockResolvedValue(mockClient),
} as unknown as Pool;

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as SecureLogger;

const mockSoulStorage = {
  getPersonality: vi.fn(),
  updatePersonality: vi.fn(),
} as unknown as SoulStorage;

function makeVersionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'v-1',
    personality_id: 'p-1',
    model_name: 'my-model:latest',
    experiment_id: null,
    finetune_job_id: null,
    previous_model: null,
    is_active: true,
    deployed_at: new Date('2026-03-01'),
    rolled_back_at: null,
    ...overrides,
  };
}

describe('ModelVersionManager', () => {
  let manager: ModelVersionManager;

  beforeEach(() => {
    // Reset everything including queued mockResolvedValueOnce
    mockQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mockClientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    (mockPool.connect as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(mockClient);
    (mockClient.release as ReturnType<typeof vi.fn>).mockReset();
    (mockSoulStorage.getPersonality as ReturnType<typeof vi.fn>).mockReset();
    (mockSoulStorage.updatePersonality as ReturnType<typeof vi.fn>).mockReset();
    manager = new ModelVersionManager({
      pool: mockPool,
      logger: mockLogger,
      soulStorage: mockSoulStorage,
    });
  });

  describe('deployModel', () => {
    it('deploys model in a transaction', async () => {
      (mockSoulStorage.getPersonality as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p-1',
        defaultModel: 'old-model',
      });

      (mockSoulStorage.updatePersonality as ReturnType<typeof vi.fn>).mockResolvedValue({});

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // deactivate
        .mockResolvedValueOnce({ rows: [makeVersionRow({ previous_model: 'old-model' })] }) // INSERT RETURNING
        .mockResolvedValueOnce({}); // COMMIT

      const version = await manager.deployModel({
        personalityId: 'p-1',
        modelName: 'my-model:latest',
      });

      expect(version.modelName).toBe('my-model:latest');
      expect(version.previousModel).toBe('old-model');
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('stores previous model from personality defaultModel object', async () => {
      (mockSoulStorage.getPersonality as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p-1',
        defaultModel: { provider: 'ollama', model: 'prev-model' },
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // deactivate
        .mockResolvedValueOnce({
          rows: [makeVersionRow({ model_name: 'new-model', previous_model: 'prev-model' })],
        }) // INSERT RETURNING
        .mockResolvedValueOnce({}); // COMMIT

      (mockSoulStorage.updatePersonality as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const version = await manager.deployModel({
        personalityId: 'p-1',
        modelName: 'new-model',
      });
      expect(version.previousModel).toBe('prev-model');
    });

    it('rolls back transaction on error', async () => {
      (mockSoulStorage.getPersonality as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p-1',
        defaultModel: 'old',
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // deactivate
        .mockRejectedValueOnce(new Error('DB error'));

      await expect(
        manager.deployModel({ personalityId: 'p-1', modelName: 'fail-model' })
      ).rejects.toThrow('DB error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('handles first deployment with no previous model', async () => {
      (mockSoulStorage.getPersonality as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p-1',
        defaultModel: null,
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // deactivate
        .mockResolvedValueOnce({ rows: [makeVersionRow({ previous_model: null })] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      (mockSoulStorage.updatePersonality as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const version = await manager.deployModel({
        personalityId: 'p-1',
        modelName: 'first-model',
      });
      expect(version.previousModel).toBeNull();
    });
  });

  describe('rollback', () => {
    it('deploys previous model and marks old version', async () => {
      // getActiveVersion
      mockQuery.mockResolvedValueOnce({
        rows: [makeVersionRow({ previous_model: 'old-model' })],
      });

      // Mark as rolled back
      mockQuery.mockResolvedValueOnce({});

      // Deploy previous model flow — getPersonality called by deployModel
      (mockSoulStorage.getPersonality as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'p-1',
        defaultModel: 'my-model:latest',
      });
      (mockSoulStorage.updatePersonality as ReturnType<typeof vi.fn>).mockResolvedValue({});

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // deactivate
        .mockResolvedValueOnce({
          rows: [makeVersionRow({ model_name: 'old-model', previous_model: 'my-model:latest' })],
        }) // INSERT RETURNING
        .mockResolvedValueOnce({}); // COMMIT

      const result = await manager.rollback('p-1');
      expect(result).not.toBeNull();
      expect(result!.modelName).toBe('old-model');
    });

    it('returns null when no previous model', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeVersionRow({ previous_model: null })],
      });

      const result = await manager.rollback('p-1');
      expect(result).toBeNull();
    });
  });

  describe('listVersions', () => {
    it('returns versions ordered by deployed_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeVersionRow(), makeVersionRow({ id: 'v-2', is_active: false })],
      });

      const versions = await manager.listVersions('p-1');
      expect(versions).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY deployed_at DESC');
    });
  });

  describe('getActiveVersion', () => {
    it('returns active version', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeVersionRow()] });
      const v = await manager.getActiveVersion('p-1');
      expect(v?.isActive).toBe(true);
    });

    it('returns null when none active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.getActiveVersion('p-1')).toBeNull();
    });
  });

  describe('getVersion', () => {
    it('returns version by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeVersionRow()] });
      const v = await manager.getVersion('v-1');
      expect(v?.id).toBe('v-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await manager.getVersion('nope')).toBeNull();
    });
  });
});
