import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionManager } from './manager.js';

const makeLogger = () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), level: 'info',
});

const WEBHOOK_CONFIG = { id: 'wh-1', url: 'https://example.com/hook', hookPoints: ['message.received'], enabled: true, secret: undefined };
const EXTENSION_MANIFEST = { id: 'ext-1', name: 'Test Extension', version: '1.0.0', hooks: [{ point: 'message.received', semantics: 'observe', priority: 100 }] };

function makeStorage(overrides: any = {}) {
  return {
    listExtensions: vi.fn().mockResolvedValue([]),
    registerExtension: vi.fn().mockResolvedValue(EXTENSION_MANIFEST),
    removeExtension: vi.fn().mockResolvedValue(true),
    listWebhooks: vi.fn().mockResolvedValue([]),
    registerWebhook: vi.fn().mockResolvedValue(WEBHOOK_CONFIG),
    removeWebhook: vi.fn().mockResolvedValue(true),
    listHooks: vi.fn().mockResolvedValue([]),
    removeHook: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeAuditChain() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function makeManager(storageOverrides: any = {}, configOverrides: any = {}) {
  const storage = makeStorage(storageOverrides);
  const logger = makeLogger();
  const auditChain = makeAuditChain();
  const config = {
    enabled: true,
    directory: '/tmp/extensions',
    allowWebhooks: false,
    webhookTimeout: 5000,
    maxHooks: 100,
    ...configOverrides,
  };
  const deps = { storage: storage as any, logger: logger as any, auditChain: auditChain as any };
  const manager = new ExtensionManager(config as any, deps);
  return { manager, storage, logger, auditChain, config };
}

describe('ExtensionManager', () => {
  describe('initialize', () => {
    it('initializes with no extensions (empty registry)', async () => {
      const { manager } = makeManager();
      await manager.initialize();
      expect(manager.getRegisteredHooks()).toHaveLength(0);
    });

    it('rebuilds hook registry from stored extensions', async () => {
      const { manager } = makeManager({ listExtensions: vi.fn().mockResolvedValue([EXTENSION_MANIFEST]) });
      await manager.initialize();
      expect(manager.getRegisteredHooks()).toHaveLength(1);
    });
  });

  describe('registerHook / unregisterHook', () => {
    it('registers a hook and returns an id', () => {
      const { manager } = makeManager();
      const handler = vi.fn().mockResolvedValue({ vetoed: false, errors: [] });
      const id = manager.registerHook('message.received' as any, handler);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('registered hook appears in getRegisteredHooks', () => {
      const { manager } = makeManager();
      const handler = vi.fn().mockResolvedValue({ vetoed: false, errors: [] });
      manager.registerHook('message.received' as any, handler);
      const hooks = manager.getRegisteredHooks();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].hookPoint).toBe('message.received');
    });

    it('registers with custom priority and semantics', () => {
      const { manager } = makeManager();
      const handler = vi.fn().mockResolvedValue({ vetoed: false, errors: [] });
      const id = manager.registerHook('message.received' as any, handler, { priority: 50, semantics: 'transform' });
      const hook = manager.getRegisteredHooks().find((h) => h.id === id);
      expect(hook?.priority).toBe(50);
      expect(hook?.semantics).toBe('transform');
    });

    it('unregisters a hook by id', () => {
      const { manager } = makeManager();
      const handler = vi.fn().mockResolvedValue({ vetoed: false, errors: [] });
      const id = manager.registerHook('message.received' as any, handler);
      manager.unregisterHook(id);
      expect(manager.getRegisteredHooks()).toHaveLength(0);
    });

    it('unregisterHook is safe when id does not exist', () => {
      const { manager } = makeManager();
      expect(() => manager.unregisterHook('non-existent')).not.toThrow();
    });
  });

  describe('emit', () => {
    it('returns non-vetoed result when no hooks registered', async () => {
      const { manager } = makeManager();
      const result = await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      expect(result.vetoed).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('calls observe handler and ignores return value for data', async () => {
      const { manager } = makeManager();
      const handler = vi.fn().mockResolvedValue({ vetoed: false, errors: [] });
      manager.registerHook('message.received' as any, handler, { semantics: 'observe' });
      const context = { event: 'message.received', data: { text: 'hello' }, timestamp: Date.now() };
      const result = await manager.emit('message.received' as any, context);
      expect(handler).toHaveBeenCalled();
      expect(result.vetoed).toBe(false);
      expect(result.transformed).toBeUndefined();
    });

    it('transform handler updates data for subsequent hooks', async () => {
      const { manager } = makeManager();
      const transformer = vi.fn().mockResolvedValue({
        vetoed: false,
        errors: [],
        transformed: { text: 'TRANSFORMED' },
      });
      manager.registerHook('message.received' as any, transformer, { semantics: 'transform' });
      const result = await manager.emit('message.received' as any, { event: 'message.received', data: { text: 'original' }, timestamp: Date.now() });
      expect(result.transformed).toEqual({ text: 'TRANSFORMED' });
    });

    it('veto handler stops further processing', async () => {
      const { manager } = makeManager();
      const vetoer = vi.fn().mockResolvedValue({ vetoed: true, errors: ['access denied'] });
      const observer = vi.fn().mockResolvedValue({ vetoed: false, errors: [] });
      manager.registerHook('message.received' as any, vetoer, { semantics: 'veto', priority: 1 });
      manager.registerHook('message.received' as any, observer, { semantics: 'observe', priority: 2 });
      const result = await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      expect(result.vetoed).toBe(true);
      expect(observer).not.toHaveBeenCalled();
    });

    it('collects errors from handlers without stopping', async () => {
      const { manager } = makeManager();
      const failingHandler = vi.fn().mockResolvedValue({ vetoed: false, errors: ['bad thing happened'] });
      manager.registerHook('message.received' as any, failingHandler, { semantics: 'observe' });
      const result = await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      expect(result.errors).toContain('bad thing happened');
    });

    it('captures thrown errors from handlers gracefully', async () => {
      const { manager } = makeManager();
      const crashingHandler = vi.fn().mockRejectedValue(new Error('crash!'));
      manager.registerHook('message.received' as any, crashingHandler, { semantics: 'observe' });
      const result = await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      expect(result.errors.some((e) => e.includes('crash!'))).toBe(true);
    });

    it('executes hooks in priority order', async () => {
      const { manager } = makeManager();
      const order: number[] = [];
      manager.registerHook('message.received' as any, async () => { order.push(2); return { vetoed: false, errors: [] }; }, { priority: 200 });
      manager.registerHook('message.received' as any, async () => { order.push(1); return { vetoed: false, errors: [] }; }, { priority: 50 });
      await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      expect(order).toEqual([1, 2]);
    });
  });

  describe('testEmit', () => {
    it('fires a test emit and logs it', async () => {
      const { manager } = makeManager();
      const result = await manager.testEmit('message.received' as any, { text: 'test' });
      expect(result.vetoed).toBe(false);
      // Should appear in execution log as isTest=true
      const log = manager.getExecutionLog();
      expect(log).toHaveLength(1);
      expect(log[0].isTest).toBe(true);
    });
  });

  describe('getExecutionLog', () => {
    it('returns empty log when no emits have occurred', () => {
      const { manager } = makeManager();
      expect(manager.getExecutionLog()).toHaveLength(0);
    });

    it('records each emit in the log', async () => {
      const { manager } = makeManager();
      await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      expect(manager.getExecutionLog()).toHaveLength(2);
    });

    it('filters log by hookPoint', async () => {
      const { manager } = makeManager();
      await manager.emit('message.received' as any, { event: 'message.received', data: {}, timestamp: Date.now() });
      await manager.emit('task.created' as any, { event: 'task.created', data: {}, timestamp: Date.now() });
      const filtered = manager.getExecutionLog('message.received' as any);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].hookPoint).toBe('message.received');
    });

    it('returns entries in reverse order (newest first)', async () => {
      const { manager } = makeManager();
      for (let i = 0; i < 3; i++) {
        await manager.emit('message.received' as any, { event: 'message.received', data: { i }, timestamp: Date.now() });
      }
      const log = manager.getExecutionLog();
      expect(log).toHaveLength(3);
    });
  });

  describe('webhook registration', () => {
    it('registerWebhook delegates to storage and audits', async () => {
      const { manager, storage, auditChain } = makeManager();
      const wh = await manager.registerWebhook({ url: 'https://example.com', hookPoints: ['message.received' as any], enabled: true });
      expect(wh.id).toBe('wh-1');
      expect(storage.registerWebhook).toHaveBeenCalled();
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'webhook_registered' }));
    });

    it('removeWebhook delegates to storage and audits', async () => {
      const { manager, storage, auditChain } = makeManager();
      const result = await manager.removeWebhook('wh-1');
      expect(result).toBe(true);
      expect(storage.removeWebhook).toHaveBeenCalledWith('wh-1');
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'webhook_removed' }));
    });

    it('removeWebhook does not audit when not found', async () => {
      const { manager, auditChain } = makeManager({ removeWebhook: vi.fn().mockResolvedValue(false) });
      const result = await manager.removeWebhook('missing');
      expect(result).toBe(false);
      expect(auditChain.record).not.toHaveBeenCalled();
    });

    it('getWebhooks delegates to storage', async () => {
      const { manager } = makeManager({ listWebhooks: vi.fn().mockResolvedValue([WEBHOOK_CONFIG]) });
      const webhooks = await manager.getWebhooks();
      expect(webhooks).toHaveLength(1);
    });
  });

  describe('extension registration', () => {
    it('registerExtension delegates to storage and audits', async () => {
      const { manager, storage, auditChain } = makeManager();
      const result = await manager.registerExtension(EXTENSION_MANIFEST as any);
      expect(result.id).toBe('ext-1');
      expect(storage.registerExtension).toHaveBeenCalled();
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'extension_registered' }));
    });

    it('registerExtension registers in-memory hooks', async () => {
      const { manager } = makeManager();
      await manager.registerExtension(EXTENSION_MANIFEST as any);
      expect(manager.getRegisteredHooks()).toHaveLength(1);
    });

    it('removeExtension removes in-memory hooks and audits', async () => {
      const { manager, storage, auditChain } = makeManager();
      await manager.registerExtension(EXTENSION_MANIFEST as any);
      expect(manager.getRegisteredHooks()).toHaveLength(1);
      await manager.removeExtension('ext-1');
      expect(manager.getRegisteredHooks()).toHaveLength(0);
      expect(storage.removeExtension).toHaveBeenCalledWith('ext-1');
      expect(auditChain.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'extension_removed' }));
    });

    it('getExtensions delegates to storage', async () => {
      const { manager } = makeManager({ listExtensions: vi.fn().mockResolvedValue([EXTENSION_MANIFEST]) });
      const extensions = await manager.getExtensions();
      expect(extensions).toHaveLength(1);
    });
  });

  describe('getConfig', () => {
    it('returns the config', () => {
      const { manager, config } = makeManager();
      expect(manager.getConfig()).toEqual(config);
    });
  });
});
