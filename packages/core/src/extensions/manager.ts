/**
 * ExtensionManager — Hook lifecycle engine for Phase 6.4a.
 *
 * Manages extension registration, hook dispatch (observe/transform/veto),
 * and webhook delivery with HMAC signing.
 */

import type { ExtensionConfig } from '@friday/shared';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { ExtensionStorage } from './storage.js';
import { discoverPlugins } from './discovery.js';
import type {
  HookPoint,
  HookContext,
  HookResult,
  HookRegistration,
  HookHandler,
  HookSemantics,
  WebhookConfig,
  ExtensionManifest,
} from './types.js';
import { uuidv7 } from '../utils/crypto.js';
import { createHmac } from 'node:crypto';

export interface ExtensionManagerDeps {
  storage: ExtensionStorage;
  logger: SecureLogger;
  auditChain: AuditChain;
}

export class ExtensionManager {
  private readonly config: ExtensionConfig;
  private readonly deps: ExtensionManagerDeps;
  private readonly hooks = new Map<string, HookRegistration>();
  private readonly hooksByPoint = new Map<HookPoint, HookRegistration[]>();

  get storage(): ExtensionManagerDeps['storage'] {
    return this.deps.storage;
  }

  constructor(config: ExtensionConfig, deps: ExtensionManagerDeps) {
    this.config = config;
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    // Load registered extensions from storage and rebuild in-memory registry
    const extensions = await this.deps.storage.listExtensions();
    for (const ext of extensions) {
      for (const hookDef of ext.hooks) {
        const id = uuidv7();
        const registration: HookRegistration = {
          id,
          hookPoint: hookDef.point,
          extensionId: ext.id,
          handler: this.createNoopHandler(),
          priority: hookDef.priority ?? 100,
          semantics: hookDef.semantics,
        };
        this.hooks.set(id, registration);
        this.addToPointIndex(registration);
      }
    }

    this.deps.logger.debug('ExtensionManager initialized', {
      extensionCount: extensions.length,
      hookCount: this.hooks.size,
    });
  }

  registerHook(
    hookPoint: HookPoint,
    handler: HookHandler,
    opts?: { priority?: number; semantics?: HookSemantics; extensionId?: string }
  ): string {
    const id = uuidv7();
    const registration: HookRegistration = {
      id,
      hookPoint,
      extensionId: opts?.extensionId ?? 'inline',
      handler,
      priority: opts?.priority ?? 100,
      semantics: opts?.semantics ?? 'observe',
    };

    this.hooks.set(id, registration);
    this.addToPointIndex(registration);

    this.deps.logger.debug('Hook registered', {
      hookId: id,
      hookPoint,
      semantics: registration.semantics,
      priority: registration.priority,
    });

    return id;
  }

  unregisterHook(id: string): void {
    const registration = this.hooks.get(id);
    if (!registration) return;

    this.hooks.delete(id);
    this.removeFromPointIndex(registration);

    this.deps.logger.debug('Hook unregistered', { hookId: id });
  }

  async emit(hookPoint: HookPoint, context: HookContext): Promise<HookResult> {
    const result: HookResult = {
      vetoed: false,
      errors: [],
    };

    const registrations = this.hooksByPoint.get(hookPoint);
    if (!registrations || registrations.length === 0) {
      // Also dispatch to webhooks even if no in-memory hooks
      await this.dispatchWebhooks(hookPoint, context);
      return result;
    }

    // Sort by priority (lower = higher priority)
    const sorted = [...registrations].sort((a, b) => a.priority - b.priority);

    let currentData = context.data;

    for (const registration of sorted) {
      try {
        const hookResult = await registration.handler({
          ...context,
          data: currentData,
        });

        switch (registration.semantics) {
          case 'observe':
            // Observe-only: ignore return value, just collect errors
            if (hookResult.errors.length > 0) {
              result.errors.push(...hookResult.errors);
            }
            break;

          case 'transform':
            // Transform: apply transformed data for subsequent hooks
            if (hookResult.transformed !== undefined) {
              currentData = hookResult.transformed;
              result.transformed = currentData;
            }
            if (hookResult.errors.length > 0) {
              result.errors.push(...hookResult.errors);
            }
            break;

          case 'veto':
            // Veto: if vetoed, stop all further processing
            if (hookResult.vetoed) {
              result.vetoed = true;
              if (hookResult.errors.length > 0) {
                result.errors.push(...hookResult.errors);
              }
              await this.dispatchWebhooks(hookPoint, context);
              return result;
            }
            if (hookResult.errors.length > 0) {
              result.errors.push(...hookResult.errors);
            }
            break;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Hook execution failed';
        result.errors.push(`Hook ${registration.id} (${registration.extensionId}): ${errorMsg}`);
        this.deps.logger.warn('Hook execution error', {
          hookId: registration.id,
          hookPoint,
          extensionId: registration.extensionId,
          error: errorMsg,
        });
      }
    }

    // Dispatch to webhooks
    await this.dispatchWebhooks(hookPoint, context);

    return result;
  }

  async registerWebhook(config: Omit<WebhookConfig, 'id'>): Promise<WebhookConfig> {
    const webhook = await this.deps.storage.registerWebhook(config);

    await this.auditRecord('webhook_registered', {
      webhookId: webhook.id,
      url: webhook.url,
      hookPoints: webhook.hookPoints,
    });

    return webhook;
  }

  async removeWebhook(id: string): Promise<boolean> {
    const removed = await this.deps.storage.removeWebhook(id);
    if (removed) {
      await this.auditRecord('webhook_removed', { webhookId: id });
    }
    return removed;
  }

  async discoverExtensions(directory?: string): Promise<ExtensionManifest[]> {
    const dir = directory ?? this.config.directory;
    const manifests = await discoverPlugins(dir);

    this.deps.logger.info('Extension discovery completed', {
      directory: dir,
      found: manifests.length,
    });

    return manifests;
  }

  getRegisteredHooks(): HookRegistration[] {
    return Array.from(this.hooks.values());
  }

  async getExtensions(): Promise<ExtensionManifest[]> {
    return this.deps.storage.listExtensions();
  }

  async registerExtension(manifest: ExtensionManifest): Promise<ExtensionManifest> {
    const registered = await this.deps.storage.registerExtension(manifest);

    // Register in-memory hooks for the extension
    for (const hookDef of registered.hooks) {
      const id = uuidv7();
      const registration: HookRegistration = {
        id,
        hookPoint: hookDef.point,
        extensionId: registered.id,
        handler: this.createNoopHandler(),
        priority: hookDef.priority ?? 100,
        semantics: hookDef.semantics,
      };
      this.hooks.set(id, registration);
      this.addToPointIndex(registration);
    }

    await this.auditRecord('extension_registered', {
      extensionId: registered.id,
      name: registered.name,
      version: registered.version,
      hookCount: registered.hooks.length,
    });

    return registered;
  }

  async removeExtension(id: string): Promise<boolean> {
    // Remove all in-memory hooks belonging to this extension
    for (const [hookId, registration] of this.hooks) {
      if (registration.extensionId === id) {
        this.hooks.delete(hookId);
        this.removeFromPointIndex(registration);
      }
    }

    // Remove persisted hooks for this extension
    const persistedHooks = await this.deps.storage.listHooks({ extensionId: id });
    for (const hook of persistedHooks) {
      await this.deps.storage.removeHook(hook.id);
    }

    const removed = await this.deps.storage.removeExtension(id);
    if (removed) {
      await this.auditRecord('extension_removed', { extensionId: id });
    }
    return removed;
  }

  async getWebhooks(): Promise<WebhookConfig[]> {
    return this.deps.storage.listWebhooks();
  }

  getConfig(): ExtensionConfig {
    return this.config;
  }

  // ── Private helpers ────────────────────────────────────────────

  private addToPointIndex(registration: HookRegistration): void {
    const list = this.hooksByPoint.get(registration.hookPoint) ?? [];
    list.push(registration);
    this.hooksByPoint.set(registration.hookPoint, list);
  }

  private removeFromPointIndex(registration: HookRegistration): void {
    const list = this.hooksByPoint.get(registration.hookPoint);
    if (!list) return;
    const filtered = list.filter((r) => r.id !== registration.id);
    if (filtered.length === 0) {
      this.hooksByPoint.delete(registration.hookPoint);
    } else {
      this.hooksByPoint.set(registration.hookPoint, filtered);
    }
  }

  private createNoopHandler(): HookHandler {
    return async () => ({ vetoed: false, errors: [] });
  }

  private async dispatchWebhooks(hookPoint: HookPoint, context: HookContext): Promise<void> {
    if (!this.config.allowWebhooks) return;

    let webhooks: WebhookConfig[];
    try {
      webhooks = await this.deps.storage.listWebhooks();
    } catch (err) {
      this.deps.logger.warn('Failed to load webhooks for dispatch', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return;
    }

    const matching = webhooks.filter((wh) => wh.enabled && wh.hookPoints.includes(hookPoint));

    if (matching.length === 0) return;

    const payload = JSON.stringify({
      hookPoint,
      event: context.event,
      data: context.data,
      timestamp: context.timestamp,
    });

    const deliveries = matching.map((webhook) => this.deliverWebhook(webhook, payload));

    // Fire-and-forget — don't block hook processing on webhook delivery
    await Promise.allSettled(deliveries);
  }

  private async deliverWebhook(webhook: WebhookConfig, payload: string): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Friday-Event': 'extension-hook',
    };

    if (webhook.secret) {
      const signature = createHmac('sha256', webhook.secret).update(payload).digest('hex');
      headers['X-Friday-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.webhookTimeout);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        this.deps.logger.warn('Webhook delivery failed', {
          webhookId: webhook.id,
          url: webhook.url,
          status: response.status,
        });
      }
    } catch (err) {
      this.deps.logger.warn('Webhook delivery error', {
        webhookId: webhook.id,
        url: webhook.url,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async auditRecord(event: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.deps.auditChain.record({
        event,
        level: 'info',
        message: `Extension system: ${event}`,
        metadata,
      });
    } catch {
      this.deps.logger.warn('Failed to record extension audit event', { event });
    }
  }
}
