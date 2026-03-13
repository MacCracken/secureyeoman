/**
 * Offline IndexedDB cache — stores conversations, settings, and pending
 * mutations for offline-first PWA support.
 *
 * Uses the native IndexedDB API (no external dependencies) with a thin
 * promise wrapper for ergonomics.
 */

// ── DB Setup ────────────────────────────────────────────────────────────────

const DB_NAME = 'secureyeoman-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;

        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('by-updated', 'updatedAt');
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Pending mutations (auto-increment for queue ordering)
        if (!db.objectStoreNames.contains('pendingMutations')) {
          db.createObjectStore('pendingMutations', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }

        // API response cache
        if (!db.objectStoreNames.contains('apiCache')) {
          db.createObjectStore('apiCache', { keyPath: 'url' });
        }
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('IndexedDB open failed'));
      };
    });
  }
  return dbPromise;
}

/** Wrap an IDBRequest in a promise. */
function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

// ── Conversations ───────────────────────────────────────────────────────────

export async function saveConversation(id: string, data: unknown): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('conversations', 'readwrite');
  await wrap(tx.objectStore('conversations').put({ id, data, updatedAt: Date.now() }));
}

export async function getConversation(id: string): Promise<unknown> {
  const db = await getDb();
  const entry = await wrap(db.transaction('conversations').objectStore('conversations').get(id));
  return (entry as { data?: unknown })?.data ?? null;
}

export async function listConversations(limit = 50): Promise<{ id: string; updatedAt: number }[]> {
  const db = await getDb();
  const all = (await wrap(
    db.transaction('conversations').objectStore('conversations').index('by-updated').getAll()
  )) as { id: string; updatedAt: number }[];
  return all
    .reverse()
    .slice(0, limit)
    .map(({ id, updatedAt }) => ({ id, updatedAt }));
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('conversations', 'readwrite');
  await wrap(tx.objectStore('conversations').delete(id));
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function saveSetting(key: string, data: unknown): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('settings', 'readwrite');
  await wrap(tx.objectStore('settings').put({ key, data, updatedAt: Date.now() }));
}

export async function getSetting(key: string): Promise<unknown> {
  const db = await getDb();
  const entry = await wrap(db.transaction('settings').objectStore('settings').get(key));
  return (entry as { data?: unknown })?.data ?? null;
}

// ── Pending Mutations (offline queue) ───────────────────────────────────────

export async function enqueueMutation(method: string, url: string, body: unknown): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pendingMutations', 'readwrite');
  await wrap(tx.objectStore('pendingMutations').add({ method, url, body, createdAt: Date.now() }));
}

export async function drainMutations(): Promise<
  { id: number; method: string; url: string; body: unknown }[]
> {
  const db = await getDb();
  const all = await wrap(
    db.transaction('pendingMutations').objectStore('pendingMutations').getAll()
  );
  return all as { id: number; method: string; url: string; body: unknown }[];
}

export async function removeMutation(id: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pendingMutations', 'readwrite');
  await wrap(tx.objectStore('pendingMutations').delete(id));
}

// ── API Cache ───────────────────────────────────────────────────────────────

export async function cacheApiResponse(url: string, data: unknown, ttlMs = 300_000): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('apiCache', 'readwrite');
  await wrap(tx.objectStore('apiCache').put({ url, data, cachedAt: Date.now(), ttlMs }));
}

export async function getCachedApiResponse(url: string): Promise<unknown> {
  const db = await getDb();
  const entry = (await wrap(db.transaction('apiCache').objectStore('apiCache').get(url))) as
    | { data: unknown; cachedAt: number; ttlMs: number }
    | undefined;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > entry.ttlMs) {
    const tx = db.transaction('apiCache', 'readwrite');
    await wrap(tx.objectStore('apiCache').delete(url));
    return null;
  }
  return entry.data;
}

export async function clearExpiredCache(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('apiCache', 'readwrite');
  const store = tx.objectStore('apiCache');
  const all = (await wrap(store.getAll())) as { url: string; cachedAt: number; ttlMs: number }[];
  const now = Date.now();
  for (const entry of all) {
    if (now - entry.cachedAt > entry.ttlMs) {
      store.delete(entry.url);
    }
  }
}
