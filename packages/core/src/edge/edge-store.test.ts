import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EdgeStore } from './edge-store.js';

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as import('pg').Pool;
}

function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('../logging/logger.js').SecureLogger;
}

describe('EdgeStore', () => {
  let store: EdgeStore;
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    mockPool = createMockPool();
    store = new EdgeStore(mockPool, createMockLogger());
  });

  describe('upsertNode', () => {
    it('should insert or update an edge node', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'en-1',
            peer_id: null,
            node_id: 'abc123',
            hostname: 'edge-pi',
            arch: 'arm64',
            platform: 'linux',
            total_memory_mb: 4096,
            cpu_cores: 4,
            has_gpu: false,
            tags: ['arm64', 'multi-core'],
            bandwidth_mbps: null,
            latency_ms: null,
            wireguard_pubkey: null,
            wireguard_endpoint: null,
            wireguard_ip: null,
            current_version: '2026.3.12',
            last_update_check: null,
            status: 'online',
            last_heartbeat: new Date().toISOString(),
            registered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.upsertNode({
        nodeId: 'abc123',
        hostname: 'edge-pi',
        arch: 'arm64',
        platform: 'linux',
        totalMemoryMb: 4096,
        cpuCores: 4,
        hasGpu: false,
        tags: ['arm64', 'multi-core'],
        currentVersion: '2026.3.12',
      });

      expect(result.nodeId).toBe('abc123');
      expect(result.hostname).toBe('edge-pi');
      expect(result.status).toBe('online');
      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('INSERT INTO edge.nodes');
      expect(sql).toContain('ON CONFLICT');
    });
  });

  describe('getNode', () => {
    it('should return node by id', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'en-1',
            peer_id: null,
            node_id: 'abc123',
            hostname: 'edge-pi',
            arch: 'arm64',
            platform: 'linux',
            total_memory_mb: 4096,
            cpu_cores: 4,
            has_gpu: false,
            tags: [],
            bandwidth_mbps: null,
            latency_ms: null,
            wireguard_pubkey: null,
            wireguard_endpoint: null,
            wireguard_ip: null,
            current_version: 'dev',
            last_update_check: null,
            status: 'online',
            last_heartbeat: new Date().toISOString(),
            registered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.getNode('en-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('en-1');
    });

    it('should return null for missing node', async () => {
      const result = await store.getNode('missing');
      expect(result).toBeNull();
    });
  });

  describe('listNodes', () => {
    it('should apply filters', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
      await store.listNodes({ status: 'online', arch: 'arm64', limit: 50 });

      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('WHERE');
      expect(params).toContain('online');
      expect(params).toContain('arm64');
      expect(params).toContain(50);
    });

    it('should list without filters', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
      await store.listNodes();

      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).not.toContain('WHERE');
    });
  });

  describe('updateNodeStatus', () => {
    it('should update status', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'en-1',
            peer_id: null,
            node_id: 'abc',
            hostname: 'h',
            arch: 'x64',
            platform: 'linux',
            total_memory_mb: 8192,
            cpu_cores: 8,
            has_gpu: false,
            tags: [],
            bandwidth_mbps: null,
            latency_ms: null,
            wireguard_pubkey: null,
            wireguard_endpoint: null,
            wireguard_ip: null,
            current_version: 'dev',
            last_update_check: null,
            status: 'offline',
            last_heartbeat: new Date().toISOString(),
            registered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.updateNodeStatus('en-1', 'offline');
      expect(result!.status).toBe('offline');
    });
  });

  describe('updateNodeHeartbeat', () => {
    it('should update heartbeat with bandwidth and latency', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'en-1',
            peer_id: null,
            node_id: 'abc',
            hostname: 'h',
            arch: 'x64',
            platform: 'linux',
            total_memory_mb: 8192,
            cpu_cores: 8,
            has_gpu: false,
            tags: [],
            bandwidth_mbps: 100,
            latency_ms: 5,
            wireguard_pubkey: null,
            wireguard_endpoint: null,
            wireguard_ip: null,
            current_version: 'dev',
            last_update_check: null,
            status: 'online',
            last_heartbeat: new Date().toISOString(),
            registered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.updateNodeHeartbeat('en-1', {
        bandwidthMbps: 100,
        latencyMs: 5,
      });
      expect(result!.bandwidthMbps).toBe(100);
      expect(result!.latencyMs).toBe(5);

      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('bandwidth_mbps');
      expect(sql).toContain('latency_ms');
    });
  });

  describe('updateWireguard', () => {
    it('should set wireguard config', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'en-1',
            peer_id: null,
            node_id: 'abc',
            hostname: 'h',
            arch: 'x64',
            platform: 'linux',
            total_memory_mb: 8192,
            cpu_cores: 8,
            has_gpu: false,
            tags: [],
            bandwidth_mbps: null,
            latency_ms: null,
            wireguard_pubkey: 'wg-pub-key',
            wireguard_endpoint: '10.0.0.1:51820',
            wireguard_ip: '10.100.0.2',
            current_version: 'dev',
            last_update_check: null,
            status: 'online',
            last_heartbeat: new Date().toISOString(),
            registered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.updateWireguard('en-1', {
        pubkey: 'wg-pub-key',
        endpoint: '10.0.0.1:51820',
        ip: '10.100.0.2',
      });
      expect(result!.wireguardPubkey).toBe('wg-pub-key');
      expect(result!.wireguardIp).toBe('10.100.0.2');
    });
  });

  describe('decommissionNode', () => {
    it('should set status to decommissioned', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'en-1',
            peer_id: null,
            node_id: 'abc',
            hostname: 'h',
            arch: 'x64',
            platform: 'linux',
            total_memory_mb: 8192,
            cpu_cores: 8,
            has_gpu: false,
            tags: [],
            bandwidth_mbps: null,
            latency_ms: null,
            wireguard_pubkey: null,
            wireguard_endpoint: null,
            wireguard_ip: null,
            current_version: 'dev',
            last_update_check: null,
            status: 'decommissioned',
            last_heartbeat: new Date().toISOString(),
            registered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.decommissionNode('en-1');
      expect(result!.status).toBe('decommissioned');
      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain("'decommissioned'");
    });
  });

  describe('deleteNode', () => {
    it('should return true when deleted', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rowCount: 1 });
      expect(await store.deleteNode('en-1')).toBe(true);
    });

    it('should return false when not found', async () => {
      expect(await store.deleteNode('missing')).toBe(false);
    });
  });

  describe('findBestNodeForTask', () => {
    it('should query with requirements', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
      const result = await store.findBestNodeForTask({
        minMemoryMb: 4096,
        minCores: 4,
        needsGpu: true,
        arch: 'arm64',
        maxLatencyMs: 100,
      });
      expect(result).toBeNull();

      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain("status = 'online'");
      expect(sql).toContain('total_memory_mb >=');
      expect(sql).toContain('cpu_cores >=');
      expect(sql).toContain('has_gpu = true');
      expect(params).toContain(4096);
      expect(params).toContain(4);
      expect(params).toContain('arm64');
    });
  });

  describe('createDeployment', () => {
    it('should insert a deployment', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'dep-1',
            node_id: 'en-1',
            task_type: 'inference',
            config_json: { model: 'llama-7b' },
            status: 'pending',
            error_message: null,
            created_at: new Date().toISOString(),
            started_at: null,
            stopped_at: null,
          },
        ],
      });

      const result = await store.createDeployment({
        nodeId: 'en-1',
        taskType: 'inference',
        configJson: { model: 'llama-7b' },
      });
      expect(result.nodeId).toBe('en-1');
      expect(result.taskType).toBe('inference');
      expect(result.status).toBe('pending');
    });
  });

  describe('updateDeploymentStatus', () => {
    it('should update to running with started_at', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'dep-1',
            node_id: 'en-1',
            task_type: 'inference',
            config_json: {},
            status: 'running',
            error_message: null,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            stopped_at: null,
          },
        ],
      });

      const result = await store.updateDeploymentStatus('dep-1', { status: 'running' });
      expect(result!.status).toBe('running');
      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('started_at');
    });

    it('should update to failed with stopped_at and error', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'dep-1',
            node_id: 'en-1',
            task_type: 'inference',
            config_json: {},
            status: 'failed',
            error_message: 'OOM',
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            stopped_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.updateDeploymentStatus('dep-1', {
        status: 'failed',
        errorMessage: 'OOM',
      });
      expect(result!.status).toBe('failed');
      expect(result!.errorMessage).toBe('OOM');
    });
  });

  describe('createOtaUpdate', () => {
    it('should create an OTA update record', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'ota-1',
            node_id: 'en-1',
            from_version: '2026.3.10',
            to_version: '2026.3.12',
            sha256: 'abc123',
            ed25519_signature: 'sig123',
            status: 'pending',
            error_message: null,
            initiated_at: new Date().toISOString(),
            completed_at: null,
          },
        ],
      });

      const result = await store.createOtaUpdate({
        nodeId: 'en-1',
        fromVersion: '2026.3.10',
        toVersion: '2026.3.12',
        sha256: 'abc123',
        ed25519Signature: 'sig123',
      });
      expect(result.fromVersion).toBe('2026.3.10');
      expect(result.toVersion).toBe('2026.3.12');
      expect(result.ed25519Signature).toBe('sig123');
    });
  });

  describe('updateOtaStatus', () => {
    it('should set completed_at on terminal status', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'ota-1',
            node_id: 'en-1',
            from_version: '2026.3.10',
            to_version: '2026.3.12',
            sha256: 'abc',
            ed25519_signature: null,
            status: 'applied',
            error_message: null,
            initiated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.updateOtaStatus('ota-1', { status: 'applied' });
      expect(result!.status).toBe('applied');
      const [sql] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('completed_at');
    });

    it('should include error message on failure', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'ota-1',
            node_id: 'en-1',
            from_version: '2026.3.10',
            to_version: '2026.3.12',
            sha256: null,
            ed25519_signature: null,
            status: 'failed',
            error_message: 'checksum mismatch',
            initiated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          },
        ],
      });

      const result = await store.updateOtaStatus('ota-1', {
        status: 'failed',
        errorMessage: 'checksum mismatch',
      });
      expect(result!.errorMessage).toBe('checksum mismatch');
    });
  });

  describe('listOtaUpdates', () => {
    it('should list by node id', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
      await store.listOtaUpdates('en-1');

      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(sql).toContain('edge.ota_updates');
      expect(params[0]).toBe('en-1');
    });
  });
});
