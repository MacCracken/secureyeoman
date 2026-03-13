import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KnowledgeDelegate } from './knowledge-delegate.js';

describe('KnowledgeDelegate', () => {
  let delegate: KnowledgeDelegate;
  const parentUrl = 'http://parent:18789';

  beforeEach(() => {
    delegate = new KnowledgeDelegate({ parentUrl, registrationToken: 'reg-tok' });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('query', () => {
    it('returns results from parent', async () => {
      const mockResults = [
        { content: 'test memory', source: 'brain', relevance: 0.9, type: 'memory' },
      ];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ results: mockResults, totalFound: 1 }),
        })
      );

      const response = await delegate.query({ query: 'test query' });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].content).toBe('test memory');
      expect(response.totalFound).toBe(1);
      expect(response.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('sends correct request with all options', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], totalFound: 0 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await delegate.query({
        query: 'test',
        personalityId: 'friday',
        limit: 5,
        types: ['memory', 'knowledge'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${parentUrl}/api/v1/brain/query`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer reg-tok',
          }),
          body: JSON.stringify({
            query: 'test',
            personalityId: 'friday',
            limit: 5,
            types: ['memory', 'knowledge'],
          }),
        })
      );
    });

    it('returns empty response on non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const response = await delegate.query({ query: 'test' });
      expect(response.results).toHaveLength(0);
      expect(response.totalFound).toBe(0);
    });

    it('returns empty response on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

      const response = await delegate.query({ query: 'test' });
      expect(response.results).toHaveLength(0);
      expect(response.totalFound).toBe(0);
      expect(response.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('defaults limit to 10', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await delegate.query({ query: 'test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.limit).toBe(10);
    });
  });

  describe('remember', () => {
    it('stores memory on parent successfully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      const result = await delegate.remember({
        type: 'conversation',
        content: 'User prefers concise responses',
        source: 'agent-chat',
        personalityId: 'friday',
      });

      expect(result).toBe(true);
    });

    it('returns false on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

      const result = await delegate.remember({
        type: 'fact',
        content: 'test',
        source: 'agent',
      });

      expect(result).toBe(false);
    });

    it('returns false on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

      const result = await delegate.remember({
        type: 'fact',
        content: 'test',
        source: 'agent',
      });

      expect(result).toBe(false);
    });

    it('sends auth header when registration token is set', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await delegate.remember({
        type: 'fact',
        content: 'test',
        source: 'agent',
      });

      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer reg-tok');
    });
  });
});
