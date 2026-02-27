import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage<string>();

export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return store.run(id, fn);
}

export function getCorrelationId(): string | undefined {
  return store.getStore();
}
