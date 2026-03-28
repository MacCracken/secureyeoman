/**
 * Policy Bundle Store — PostgreSQL persistence for bundles and deployments.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, parseCount } from '../storage/query-helpers.js';
import type { PolicyBundle, PolicyDeployment, BundleStatus } from '@secureyeoman/shared';

function rowToBundle(row: Record<string, unknown>): PolicyBundle {
  return {
    id: row.id as string,
    metadata: row.metadata as PolicyBundle['metadata'],
    files: (row.files as PolicyBundle['files']) ?? [],
    commitSha: (row.commit_sha as string) ?? '',
    ref: (row.ref as string) ?? 'main',
    compiledAt: (row.compiled_at as number) ?? 0,
    valid: (row.valid as boolean) ?? false,
    validationErrors: (row.validation_errors as string[]) ?? [],
  };
}

function rowToDeployment(row: Record<string, unknown>): PolicyDeployment {
  return {
    id: row.id as string,
    bundleId: row.bundle_id as string,
    bundleName: row.bundle_name as string,
    bundleVersion: row.bundle_version as string,
    status: row.status as BundleStatus,
    deployedBy: (row.deployed_by as string) ?? 'system',
    prNumber: (row.pr_number as number) ?? undefined,
    prUrl: (row.pr_url as string) ?? undefined,
    commitSha: (row.commit_sha as string) ?? '',
    policyCount: (row.policy_count as number) ?? 0,
    errorCount: (row.error_count as number) ?? 0,
    errors: (row.errors as string[]) ?? [],
    deployedAt: (row.deployed_at as number) ?? 0,
    previousDeploymentId: (row.previous_deployment_id as string) ?? undefined,
    tenantId: (row.tenant_id as string) ?? 'default',
  };
}

export class PolicyBundleStore extends PgBaseStorage {
  async saveBundle(bundle: PolicyBundle): Promise<void> {
    await this.execute(
      `INSERT INTO policy_as_code.bundles (
        id, metadata, files, commit_sha, ref,
        compiled_at, valid, validation_errors, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        metadata = EXCLUDED.metadata,
        files = EXCLUDED.files,
        commit_sha = EXCLUDED.commit_sha,
        ref = EXCLUDED.ref,
        compiled_at = EXCLUDED.compiled_at,
        valid = EXCLUDED.valid,
        validation_errors = EXCLUDED.validation_errors`,
      [
        bundle.id,
        JSON.stringify(bundle.metadata),
        JSON.stringify(bundle.files),
        bundle.commitSha,
        bundle.ref,
        bundle.compiledAt,
        bundle.valid,
        JSON.stringify(bundle.validationErrors),
        'default',
      ]
    );
  }

  async getBundle(id: string): Promise<PolicyBundle | null> {
    const row = await this.queryOne('SELECT * FROM policy_as_code.bundles WHERE id = $1', [id]);
    return row ? rowToBundle(row) : null;
  }

  async listBundles(
    opts: { limit?: number; offset?: number; name?: string } = {}
  ): Promise<{ items: PolicyBundle[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([
      { column: "metadata->>'name'", value: opts.name },
    ]);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM policy_as_code.bundles ${where}`,
      values
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;

    // Omit files for list performance
    const rows = await this.queryMany(
      `SELECT id, metadata, '[]'::jsonb AS files, commit_sha, ref,
              compiled_at, valid, validation_errors, tenant_id
       FROM policy_as_code.bundles ${where}
       ORDER BY compiled_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );

    return { items: rows.map(rowToBundle), total };
  }

  async deleteBundle(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM policy_as_code.bundles WHERE id = $1', [id]);
    return count > 0;
  }

  async saveDeployment(deployment: PolicyDeployment): Promise<void> {
    await this.execute(
      `INSERT INTO policy_as_code.deployments (
        id, bundle_id, bundle_name, bundle_version, status,
        deployed_by, pr_number, pr_url, commit_sha,
        policy_count, error_count, errors, deployed_at,
        previous_deployment_id, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        deployment.id,
        deployment.bundleId,
        deployment.bundleName,
        deployment.bundleVersion,
        deployment.status,
        deployment.deployedBy,
        deployment.prNumber ?? null,
        deployment.prUrl ?? null,
        deployment.commitSha,
        deployment.policyCount,
        deployment.errorCount,
        JSON.stringify(deployment.errors),
        deployment.deployedAt,
        deployment.previousDeploymentId ?? null,
        deployment.tenantId,
      ]
    );
  }

  async getDeployment(id: string): Promise<PolicyDeployment | null> {
    const row = await this.queryOne('SELECT * FROM policy_as_code.deployments WHERE id = $1', [id]);
    return row ? rowToDeployment(row) : null;
  }

  async listDeployments(bundleName?: string, limit = 50): Promise<PolicyDeployment[]> {
    const { where, values, nextIdx } = buildWhere([{ column: 'bundle_name', value: bundleName }]);

    const rows = await this.queryMany(
      `SELECT * FROM policy_as_code.deployments ${where}
       ORDER BY deployed_at DESC LIMIT $${nextIdx}`,
      [...values, Math.min(limit, 200)]
    );

    return rows.map(rowToDeployment);
  }

  async updateDeploymentStatus(id: string, status: BundleStatus): Promise<void> {
    await this.execute('UPDATE policy_as_code.deployments SET status = $1 WHERE id = $2', [
      status,
      id,
    ]);
  }

  async deleteOldDeployments(bundleName: string, retain: number): Promise<number> {
    const result = await this.execute(
      `DELETE FROM policy_as_code.deployments
       WHERE bundle_name = $1
       AND id NOT IN (
         SELECT id FROM policy_as_code.deployments
         WHERE bundle_name = $1
         ORDER BY deployed_at DESC LIMIT $2
       )`,
      [bundleName, retain]
    );
    return result;
  }
}
