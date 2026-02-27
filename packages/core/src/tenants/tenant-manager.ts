/**
 * TenantManager — business logic wrapper around TenantStorage.
 *
 * Validates slug format, enforces invariants (cannot delete 'default'),
 * and emits audit events.
 */

import type { TenantStorage, TenantRecord } from './tenant-storage.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { uuidv7 } from '../utils/crypto.js';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

export class TenantManager {
  private readonly storage: TenantStorage;
  private readonly auditChain: AuditChain | null;

  constructor(storage: TenantStorage, auditChain?: AuditChain) {
    this.storage = storage;
    this.auditChain = auditChain ?? null;
  }

  private validateSlug(slug: string): void {
    if (!SLUG_REGEX.test(slug)) {
      throw new Error(
        'Invalid slug: must be lowercase alphanumeric and hyphens, no leading/trailing hyphens'
      );
    }
  }

  async create(data: { name: string; slug: string; plan?: string }): Promise<TenantRecord> {
    this.validateSlug(data.slug);
    const existing = await this.storage.getBySlug(data.slug);
    if (existing) throw new Error(`Slug already exists: ${data.slug}`);

    const record = await this.storage.create({
      id: uuidv7(),
      name: data.name,
      slug: data.slug,
      plan: data.plan ?? 'free',
    });

    await this.auditChain?.record({
      event: 'tenant_created',
      level: 'info',
      message: `Tenant created: ${data.slug}`,
      metadata: { tenantId: record.id, slug: data.slug },
    });

    return record;
  }

  async list(limit = 50, offset = 0) {
    return this.storage.list(limit, offset);
  }

  async getById(id: string): Promise<TenantRecord | null> {
    return this.storage.getById(id);
  }

  async update(
    id: string,
    patch: Partial<{ name: string; plan: string; metadata: Record<string, unknown> }>
  ): Promise<TenantRecord | null> {
    return this.storage.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    if (id === 'default') {
      throw new Error('Cannot delete the default tenant');
    }
    const ok = await this.storage.delete(id);
    if (!ok) throw new Error('Tenant not found');

    await this.auditChain?.record({
      event: 'tenant_deleted',
      level: 'warn',
      message: `Tenant deleted: ${id}`,
      metadata: { tenantId: id },
    });
  }
}
