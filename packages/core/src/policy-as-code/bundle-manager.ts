/**
 * Bundle Manager — orchestrates the policy-as-code lifecycle.
 *
 * Coordinates git repo discovery, bundle compilation, deployment to OPA,
 * and evaluation. This is the main entry point for the policy-as-code subsystem.
 */

import type { Logger } from 'pino';
import type { OpaClient } from '../intent/opa-client.js';
import type { PolicyAsCodeConfig } from '@secureyeoman/shared';
import { GitPolicyRepo } from './git-policy-repo.js';
import { BundleCompiler } from './bundle-compiler.js';
import { PolicySync } from './policy-sync.js';
import type { PolicyBundleStore } from './policy-bundle-store.js';
import type {
  PolicyBundle,
  PolicyDeployment,
  PolicyEvalRequest,
  PolicyEvalResult,
} from '@secureyeoman/shared';

export interface BundleManagerDeps {
  opaClient: OpaClient | null;
  store: PolicyBundleStore;
  config: PolicyAsCodeConfig;
  log: Logger;
}

export class BundleManager {
  private readonly gitRepo: GitPolicyRepo;
  private readonly compiler: BundleCompiler;
  private readonly sync: PolicySync;
  private readonly store: PolicyBundleStore;
  private readonly config: PolicyAsCodeConfig;
  private readonly log: Logger;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: BundleManagerDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.log = deps.log;
    this.gitRepo = new GitPolicyRepo(deps.config.repo);
    this.compiler = new BundleCompiler(deps.opaClient, deps.config);
    this.sync = new PolicySync(deps.opaClient, deps.store);
  }

  /** Start periodic sync if configured. */
  start(): void {
    const interval = this.config.repo.syncIntervalSec;
    if (interval > 0) {
      this.syncTimer = setInterval(() => {
        this.syncFromGit().catch((err: unknown) => {
          this.log.error({ err }, 'Policy auto-sync failed');
        });
      }, interval * 1000);
      this.log.info({ intervalSec: interval }, 'Policy auto-sync started');
    }
  }

  /** Stop periodic sync. */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Sync from git — pull latest, discover bundles, compile, and deploy.
   * Returns deployed bundles.
   */
  async syncFromGit(
    deployedBy = 'system'
  ): Promise<{ bundles: PolicyBundle[]; deployments: PolicyDeployment[] }> {
    this.log.info({}, 'Starting policy sync from git');

    // Pull latest changes
    let commitSha = '';
    try {
      const pullResult = await this.gitRepo.pull();
      commitSha = pullResult.commitSha;
      if (!pullResult.updated) {
        this.log.info({}, 'No policy changes detected');
      }
    } catch (err) {
      this.log.warn({ err }, 'Git pull failed, using existing state');
      const info = await this.gitRepo.getGitInfo();
      commitSha = info.commitSha;
    }

    // Discover and compile bundles
    const discovered = await this.gitRepo.discoverBundles();
    this.log.info({ count: discovered.length }, 'Discovered policy bundles');

    const bundles: PolicyBundle[] = [];
    const deployments: PolicyDeployment[] = [];

    for (const d of discovered) {
      const bundleId = `${d.name}-${Date.now()}`;
      const result = await this.compiler.compile(
        bundleId,
        d.metadata,
        d.files,
        commitSha,
        this.config.repo.branch
      );

      await this.store.saveBundle(result.bundle);
      bundles.push(result.bundle);

      if (result.valid) {
        const deployment = await this.sync.deploy(result.bundle, deployedBy);
        deployments.push(deployment);
        this.log.info(
          { bundle: d.name, version: d.metadata.version, policies: deployment.policyCount },
          'Bundle deployed'
        );
      } else {
        this.log.warn(
          { bundle: d.name, errors: result.errors },
          'Bundle validation failed — skipping deployment'
        );
      }

      // Cleanup old deployments
      await this.store.deleteOldDeployments(d.name, this.config.retainDeployments);
    }

    return { bundles, deployments };
  }

  /**
   * Compile and deploy a single bundle by name from the git repo.
   */
  async compileAndDeploy(
    bundleName: string,
    deployedBy = 'system',
    prNumber?: number,
    prUrl?: string
  ): Promise<{ bundle: PolicyBundle; deployment: PolicyDeployment | null }> {
    const discovered = await this.gitRepo.discoverBundles();
    const target = discovered.find((d) => d.name === bundleName);
    if (!target) {
      throw new Error(`Bundle not found in repo: ${bundleName}`);
    }

    const gitInfo = await this.gitRepo.getGitInfo();
    const bundleId = `${bundleName}-${Date.now()}`;
    const result = await this.compiler.compile(
      bundleId,
      target.metadata,
      target.files,
      gitInfo.commitSha,
      gitInfo.branch
    );

    await this.store.saveBundle(result.bundle);

    let deployment: PolicyDeployment | null = null;
    if (result.valid) {
      deployment = await this.sync.deploy(result.bundle, deployedBy, prNumber, prUrl);
    }

    return { bundle: result.bundle, deployment };
  }

  /** Evaluate a policy. */
  async evaluate(req: PolicyEvalRequest): Promise<PolicyEvalResult> {
    return this.sync.evaluate(req);
  }

  /** Rollback a bundle to a previous deployment. */
  async rollback(
    bundleName: string,
    targetDeploymentId: string,
    rolledBackBy = 'system'
  ): Promise<PolicyDeployment> {
    return this.sync.rollback(bundleName, targetDeploymentId, rolledBackBy);
  }

  /** List bundles. */
  async listBundles(opts?: { limit?: number; offset?: number; name?: string }) {
    return this.store.listBundles(opts);
  }

  /** Get a bundle by ID. */
  async getBundle(id: string) {
    return this.store.getBundle(id);
  }

  /** Delete a bundle. */
  async deleteBundle(id: string) {
    return this.store.deleteBundle(id);
  }

  /** List deployments. */
  async listDeployments(bundleName?: string, limit?: number) {
    return this.store.listDeployments(bundleName, limit);
  }

  /** Get git repo info. */
  async getRepoInfo() {
    return this.gitRepo.getGitInfo();
  }
}
