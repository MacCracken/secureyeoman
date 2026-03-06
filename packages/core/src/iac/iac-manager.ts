/**
 * IaC Manager — orchestrates the infrastructure-as-code lifecycle.
 *
 * Coordinates git repo discovery, template validation, SRA integration,
 * and deployment tracking.
 */

import type { Logger } from 'pino';
import type { IacConfig, IacTemplate, IacDeployment } from '@secureyeoman/shared';
import { IacGitRepo } from './iac-git-repo.js';
import { IacValidator } from './iac-validator.js';
import type { IacTemplateStore } from './iac-template-store.js';
import { IacSraPopulator } from './iac-sra-populator.js';

export interface IacManagerDeps {
  store: IacTemplateStore;
  config: IacConfig;
  log: Logger;
}

export class IacManager {
  private readonly gitRepo: IacGitRepo;
  private readonly validator: IacValidator;
  private readonly store: IacTemplateStore;
  private readonly config: IacConfig;
  private readonly log: Logger;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: IacManagerDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.log = deps.log;
    this.gitRepo = new IacGitRepo(deps.config.repo);
    this.validator = new IacValidator(deps.config);
  }

  /** Start periodic sync if configured. */
  start(): void {
    const interval = this.config.repo.syncIntervalSec;
    if (interval > 0) {
      this.syncTimer = setInterval(() => {
        this.syncFromGit().catch((err) => {
          this.log.error({ err }, 'IaC auto-sync failed');
        });
      }, interval * 1000);
      this.log.info({ intervalSec: interval }, 'IaC auto-sync started');
    }

    // Seed built-in templates
    if (this.config.enableBuiltinTemplates) {
      this.seedBuiltinTemplates().catch((err) => {
        this.log.warn({ err }, 'Failed to seed built-in IaC templates');
      });
    }
  }

  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Sync templates from git — pull, discover, validate, and store.
   */
  async syncFromGit(): Promise<{ templates: IacTemplate[]; errors: string[] }> {
    this.log.info('Starting IaC sync from git');

    let commitSha = '';
    try {
      const pullResult = await this.gitRepo.pull();
      commitSha = pullResult.commitSha;
    } catch (err) {
      this.log.warn({ err }, 'Git pull failed, using existing state');
      const info = await this.gitRepo.getGitInfo();
      commitSha = info.commitSha;
    }

    const discovered = await this.gitRepo.discoverTemplates();
    this.log.info({ count: discovered.length }, 'Discovered IaC templates');

    const templates: IacTemplate[] = [];
    const allErrors: string[] = [];

    for (const d of discovered) {
      const validation = this.validator.validate(d.tool, d.files);

      const template: IacTemplate = {
        id: `${d.name}-${Date.now()}`,
        name: d.name,
        description: d.description,
        tool: d.tool,
        cloudProvider: d.cloudProvider,
        category: d.category,
        version: d.version,
        files: d.files.map((f) => ({
          path: f.path,
          content: f.content,
          sha256: IacValidator.hash(f.content),
        })),
        variables: d.variables,
        tags: d.tags,
        sraControlIds: d.sraControlIds,
        policyBundleName: d.policyBundleName,
        commitSha,
        ref: this.config.repo.branch,
        compiledAt: Date.now(),
        valid: validation.valid,
        validationErrors: validation.errors,
        isBuiltin: false,
        tenantId: 'default',
      };

      await this.store.saveTemplate(template);
      templates.push(template);

      if (!validation.valid) {
        allErrors.push(...validation.errors.map((e) => `${d.name}: ${e}`));
        this.log.warn({ template: d.name, errors: validation.errors }, 'Template validation failed');
      } else {
        this.log.info({ template: d.name, tool: d.tool, files: d.files.length }, 'Template synced');
      }
    }

    return { templates, errors: allErrors };
  }

  /**
   * Validate a template by ID or by providing files directly.
   */
  async validateTemplate(
    templateIdOrFiles: string | { tool: string; files: Array<{ path: string; content: string }> }
  ) {
    if (typeof templateIdOrFiles === 'string') {
      const template = await this.store.getTemplate(templateIdOrFiles);
      if (!template) throw new Error(`Template not found: ${templateIdOrFiles}`);
      return this.validator.validate(
        template.tool,
        template.files.map((f) => ({ path: f.path, content: f.content }))
      );
    }
    return this.validator.validate(
      templateIdOrFiles.tool as any,
      templateIdOrFiles.files
    );
  }

  /** Get SRA remediation templates for a control. */
  async getRemediationTemplates(sraControlId: string) {
    return this.store.listTemplates({ sraControlId });
  }

  /** List templates. */
  async listTemplates(opts?: {
    tool?: string;
    cloudProvider?: string;
    category?: string;
    sraControlId?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.store.listTemplates(opts);
  }

  async getTemplate(id: string) {
    return this.store.getTemplate(id);
  }

  async deleteTemplate(id: string) {
    return this.store.deleteTemplate(id);
  }

  /** Record a deployment event. */
  async recordDeployment(deployment: IacDeployment): Promise<void> {
    await this.store.saveDeployment(deployment);
    await this.store.deleteOldDeployments(deployment.templateName, this.config.retainDeployments);
  }

  async listDeployments(templateName?: string, limit?: number) {
    return this.store.listDeployments(templateName, limit);
  }

  async getDeployment(id: string) {
    return this.store.getDeployment(id);
  }

  async getRepoInfo() {
    return this.gitRepo.getGitInfo();
  }

  /**
   * Seed built-in IaC templates for SRA controls.
   */
  private async seedBuiltinTemplates(): Promise<void> {
    const builtins = IacSraPopulator.getBuiltinTemplates();
    for (const template of builtins) {
      const existing = await this.store.getTemplate(template.id);
      if (!existing) {
        await this.store.saveTemplate(template);
      }
    }
    this.log.info({ count: builtins.length }, 'Built-in IaC templates seeded');
  }
}
