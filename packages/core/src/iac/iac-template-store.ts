/**
 * IaC Template Store — PostgreSQL persistence for templates and deployments.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, buildSet, parseCount } from '../storage/query-helpers.js';
import type { IacTemplate, IacDeployment, IacDeploymentStatus } from '@secureyeoman/shared';

function rowToTemplate(row: Record<string, unknown>): IacTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    tool: row.tool as IacTemplate['tool'],
    cloudProvider: row.cloud_provider as IacTemplate['cloudProvider'],
    category: row.category as IacTemplate['category'],
    version: (row.version as string) ?? '0.0.0',
    files: (row.files as IacTemplate['files']) ?? [],
    variables: (row.variables as IacTemplate['variables']) ?? [],
    tags: (row.tags as string[]) ?? [],
    sraControlIds: (row.sra_control_ids as string[]) ?? [],
    policyBundleName: (row.policy_bundle_name as string) ?? undefined,
    commitSha: (row.commit_sha as string) ?? '',
    ref: (row.ref as string) ?? 'main',
    compiledAt: (row.compiled_at as number) ?? 0,
    valid: (row.valid as boolean) ?? false,
    validationErrors: (row.validation_errors as string[]) ?? [],
    isBuiltin: (row.is_builtin as boolean) ?? false,
    tenantId: (row.tenant_id as string) ?? 'default',
  };
}

function rowToDeployment(row: Record<string, unknown>): IacDeployment {
  return {
    id: row.id as string,
    templateId: row.template_id as string,
    templateName: row.template_name as string,
    templateVersion: (row.template_version as string) ?? '',
    status: row.status as IacDeploymentStatus,
    variables: (row.variables as Record<string, unknown>) ?? {},
    planOutput: (row.plan_output as string) ?? '',
    applyOutput: (row.apply_output as string) ?? '',
    errors: (row.errors as string[]) ?? [],
    resourcesCreated: (row.resources_created as number) ?? 0,
    resourcesModified: (row.resources_modified as number) ?? 0,
    resourcesDestroyed: (row.resources_destroyed as number) ?? 0,
    deployedBy: (row.deployed_by as string) ?? 'system',
    deployedAt: (row.deployed_at as number) ?? 0,
    previousDeploymentId: (row.previous_deployment_id as string) ?? undefined,
    tenantId: (row.tenant_id as string) ?? 'default',
  };
}

export class IacTemplateStore extends PgBaseStorage {
  async saveTemplate(t: IacTemplate): Promise<void> {
    await this.execute(
      `INSERT INTO iac.templates (
        id, name, description, tool, cloud_provider, category,
        version, files, variables, tags, sra_control_ids,
        policy_bundle_name, commit_sha, ref, compiled_at,
        valid, validation_errors, is_builtin, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        tool = EXCLUDED.tool, cloud_provider = EXCLUDED.cloud_provider,
        category = EXCLUDED.category, version = EXCLUDED.version,
        files = EXCLUDED.files, variables = EXCLUDED.variables,
        tags = EXCLUDED.tags, sra_control_ids = EXCLUDED.sra_control_ids,
        policy_bundle_name = EXCLUDED.policy_bundle_name,
        commit_sha = EXCLUDED.commit_sha, ref = EXCLUDED.ref,
        compiled_at = EXCLUDED.compiled_at, valid = EXCLUDED.valid,
        validation_errors = EXCLUDED.validation_errors`,
      [
        t.id,
        t.name,
        t.description,
        t.tool,
        t.cloudProvider,
        t.category,
        t.version,
        JSON.stringify(t.files),
        JSON.stringify(t.variables),
        JSON.stringify(t.tags),
        JSON.stringify(t.sraControlIds),
        t.policyBundleName ?? null,
        t.commitSha,
        t.ref,
        t.compiledAt,
        t.valid,
        JSON.stringify(t.validationErrors),
        t.isBuiltin,
        t.tenantId,
      ]
    );
  }

  async getTemplate(id: string): Promise<IacTemplate | null> {
    const row = await this.queryOne('SELECT * FROM iac.templates WHERE id = $1', [id]);
    return row ? rowToTemplate(row) : null;
  }

  async listTemplates(
    opts: {
      tool?: string;
      cloudProvider?: string;
      category?: string;
      sraControlId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: IacTemplate[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'tool', value: opts.tool },
      { column: 'cloud_provider', value: opts.cloudProvider },
      { column: 'category', value: opts.category },
      { column: 'sra_control_ids', value: opts.sraControlId, op: '?' },
    ]);

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM iac.templates ${where}`,
      values
    );
    const total = parseCount(countResult);

    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;

    // Omit files for list performance
    const rows = await this.queryMany(
      `SELECT id, name, description, tool, cloud_provider, category,
              version, '[]'::jsonb AS files, variables, tags,
              sra_control_ids, policy_bundle_name, commit_sha, ref,
              compiled_at, valid, validation_errors, is_builtin, tenant_id
       FROM iac.templates ${where}
       ORDER BY compiled_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );

    return { items: rows.map(rowToTemplate), total };
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM iac.templates WHERE id = $1', [id]);
    return count > 0;
  }

  async saveDeployment(d: IacDeployment): Promise<void> {
    await this.execute(
      `INSERT INTO iac.deployments (
        id, template_id, template_name, template_version, status,
        variables, plan_output, apply_output, errors,
        resources_created, resources_modified, resources_destroyed,
        deployed_by, deployed_at, previous_deployment_id, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        d.id,
        d.templateId,
        d.templateName,
        d.templateVersion,
        d.status,
        JSON.stringify(d.variables),
        d.planOutput,
        d.applyOutput,
        JSON.stringify(d.errors),
        d.resourcesCreated,
        d.resourcesModified,
        d.resourcesDestroyed,
        d.deployedBy,
        d.deployedAt,
        d.previousDeploymentId ?? null,
        d.tenantId,
      ]
    );
  }

  async getDeployment(id: string): Promise<IacDeployment | null> {
    const row = await this.queryOne('SELECT * FROM iac.deployments WHERE id = $1', [id]);
    return row ? rowToDeployment(row) : null;
  }

  async listDeployments(templateName?: string, limit = 50): Promise<IacDeployment[]> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'template_name', value: templateName },
    ]);

    const rows = await this.queryMany(
      `SELECT * FROM iac.deployments ${where}
       ORDER BY deployed_at DESC LIMIT $${nextIdx}`,
      [...values, Math.min(limit, 200)]
    );

    return rows.map(rowToDeployment);
  }

  async updateDeploymentStatus(
    id: string,
    status: IacDeploymentStatus,
    output?: { planOutput?: string; applyOutput?: string; errors?: string[] }
  ): Promise<void> {
    const { setClause, values, nextIdx } = buildSet([
      { column: 'status', value: status },
      { column: 'plan_output', value: output?.planOutput },
      { column: 'apply_output', value: output?.applyOutput },
      { column: 'errors', value: output?.errors, json: true },
    ]);

    values.push(id);
    await this.execute(`UPDATE iac.deployments SET ${setClause} WHERE id = $${nextIdx}`, values);
  }

  async deleteOldDeployments(templateName: string, retain: number): Promise<number> {
    return this.execute(
      `DELETE FROM iac.deployments
       WHERE template_name = $1
       AND id NOT IN (
         SELECT id FROM iac.deployments
         WHERE template_name = $1
         ORDER BY deployed_at DESC LIMIT $2
       )`,
      [templateName, retain]
    );
  }
}
