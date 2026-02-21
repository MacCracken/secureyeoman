import { describe, it, expect, vi } from 'vitest';
import { DashboardManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), level: 'info',
});

const DASHBOARD = { id: 'dash-1', name: 'My Dashboard', widgets: [], createdAt: 1000, updatedAt: 1000 };

function makeStorage(overrides: any = {}) {
  return {
    create: vi.fn().mockResolvedValue(DASHBOARD),
    get: vi.fn().mockResolvedValue(DASHBOARD),
    list: vi.fn().mockResolvedValue({ dashboards: [DASHBOARD], total: 1 }),
    update: vi.fn().mockResolvedValue(DASHBOARD),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeManager(storageOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const manager = new DashboardManager(storage as any, { logger: logger as any });
  return { manager, storage, logger };
}

describe('DashboardManager', () => {
  describe('create', () => {
    it('creates dashboard and logs', async () => {
      const { manager, logger } = makeManager();
      const d = await manager.create({ name: 'New Dashboard', widgets: [] } as any);
      expect(d.id).toBe('dash-1');
      expect(logger.info).toHaveBeenCalledWith('Custom dashboard created', { id: 'dash-1', name: 'My Dashboard' });
    });
  });

  describe('get', () => {
    it('returns dashboard', async () => {
      const { manager } = makeManager();
      const d = await manager.get('dash-1');
      expect(d?.id).toBe('dash-1');
    });

    it('returns null when not found', async () => {
      const { manager } = makeManager({ get: vi.fn().mockResolvedValue(null) });
      expect(await manager.get('missing')).toBeNull();
    });
  });

  describe('list', () => {
    it('returns dashboards with total', async () => {
      const { manager } = makeManager();
      const result = await manager.list();
      expect(result.dashboards).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('update', () => {
    it('updates and logs', async () => {
      const { manager, logger } = makeManager();
      const d = await manager.update('dash-1', { name: 'Updated' });
      expect(d?.id).toBe('dash-1');
      expect(logger.info).toHaveBeenCalledWith('Custom dashboard updated', { id: 'dash-1' });
    });

    it('does not log when not found', async () => {
      const { manager, logger } = makeManager({ update: vi.fn().mockResolvedValue(null) });
      await manager.update('missing', { name: 'X' });
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes and logs', async () => {
      const { manager, logger } = makeManager();
      const ok = await manager.delete('dash-1');
      expect(ok).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Custom dashboard deleted', { id: 'dash-1' });
    });

    it('returns false without logging when not found', async () => {
      const { manager, logger } = makeManager({ delete: vi.fn().mockResolvedValue(false) });
      const ok = await manager.delete('missing');
      expect(ok).toBe(false);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
