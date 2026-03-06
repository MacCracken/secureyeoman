/**
 * Policy Sync — deploys compiled bundles to OPA and tracks deployments.
 *
 * Handles uploading Rego policies to OPA, evaluating CEL policies locally,
 * and recording deployment history for audit trails.
 */

import type { OpaClient } from '../intent/opa-client.js';
import { evalCel } from '../intent/cel-evaluator.js';
import type { PolicyBundleStore } from './policy-bundle-store.js';
import type {
  PolicyBundle,
  PolicyDeployment,
  PolicyEvalRequest,
  PolicyEvalResult,
} from '@secureyeoman/shared';

export class PolicySync {
  constructor(
    private readonly opaClient: OpaClient | null,
    private readonly store: PolicyBundleStore
  ) {}

  /**
   * Deploy a compiled bundle — upload Rego policies to OPA and
   * record the deployment.
   */
  async deploy(
    bundle: PolicyBundle,
    deployedBy = 'system',
    prNumber?: number,
    prUrl?: string
  ): Promise<PolicyDeployment> {
    if (!bundle.valid) {
      throw new Error(`Cannot deploy invalid bundle: ${bundle.validationErrors.join('; ')}`);
    }

    const errors: string[] = [];
    let uploadedCount = 0;

    // Upload Rego files to OPA
    if (this.opaClient) {
      const regoFiles = bundle.files.filter((f) => f.language === 'rego');
      for (const file of regoFiles) {
        const policyId = `${bundle.metadata.name}__${file.path.replace(/[/.]/g, '_')}`;
        try {
          await this.opaClient.uploadPolicy(policyId, file.source);
          uploadedCount++;
        } catch (err) {
          errors.push(
            `Failed to upload ${file.path}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // CEL files don't need uploading — they're evaluated locally on demand
    const celCount = bundle.files.filter((f) => f.language === 'cel').length;
    uploadedCount += celCount;

    // Get previous deployment for chain tracking
    const prevDeployments = await this.store.listDeployments(bundle.metadata.name, 1);
    const previousDeploymentId = prevDeployments[0]?.id;

    // Mark previous deployment as superseded
    if (previousDeploymentId) {
      await this.store.updateDeploymentStatus(previousDeploymentId, 'superseded');
    }

    const deployment: PolicyDeployment = {
      id: `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bundleId: bundle.id,
      bundleName: bundle.metadata.name,
      bundleVersion: bundle.metadata.version,
      status: errors.length > 0 ? 'invalid' : 'deployed',
      deployedBy,
      prNumber,
      prUrl,
      commitSha: bundle.commitSha,
      policyCount: uploadedCount,
      errorCount: errors.length,
      errors,
      deployedAt: Date.now(),
      previousDeploymentId,
      tenantId: 'default',
    };

    await this.store.saveDeployment(deployment);
    return deployment;
  }

  /**
   * Rollback to a previous deployment — re-upload its policies and
   * mark the current deployment as rolled_back.
   */
  async rollback(
    bundleName: string,
    targetDeploymentId: string,
    rolledBackBy = 'system'
  ): Promise<PolicyDeployment> {
    const targetDeployment = await this.store.getDeployment(targetDeploymentId);
    if (!targetDeployment) {
      throw new Error(`Deployment not found: ${targetDeploymentId}`);
    }

    const targetBundle = await this.store.getBundle(targetDeployment.bundleId);
    if (!targetBundle) {
      throw new Error(`Bundle not found: ${targetDeployment.bundleId}`);
    }

    // Mark current active deployment as rolled_back
    const current = await this.store.listDeployments(bundleName, 1);
    if (current[0] && current[0].status === 'deployed') {
      await this.store.updateDeploymentStatus(current[0].id, 'rolled_back');
    }

    return this.deploy(targetBundle, rolledBackBy);
  }

  /**
   * Evaluate a policy by ID. Routes to OPA for Rego policies or
   * evaluates CEL locally.
   */
  async evaluate(req: PolicyEvalRequest): Promise<PolicyEvalResult> {
    const start = Date.now();

    // Try OPA evaluation first
    if (this.opaClient) {
      const result = await this.opaClient.evaluate(req.policyId, req.input);
      if (result !== null) {
        return {
          policyId: req.policyId,
          allowed: result,
          enforcement: req.enforcement ?? 'warn',
          reason: result ? 'Policy allows action' : 'Policy denies action',
          durationMs: Date.now() - start,
          engine: 'opa',
          evaluatedAt: Date.now(),
        };
      }
    }

    // Fall back to CEL evaluation
    const ctx: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.input)) {
      ctx[k] = String(v);
    }
    const allowed = evalCel(req.policyId, ctx);

    return {
      policyId: req.policyId,
      allowed,
      enforcement: req.enforcement ?? 'warn',
      reason: allowed ? 'CEL expression permits action' : 'CEL expression denies action',
      durationMs: Date.now() - start,
      engine: 'cel',
      evaluatedAt: Date.now(),
    };
  }

  /** Remove all OPA policies for a bundle. */
  async undeploy(bundle: PolicyBundle): Promise<void> {
    if (!this.opaClient) return;

    for (const file of bundle.files) {
      if (file.language !== 'rego') continue;
      const policyId = `${bundle.metadata.name}__${file.path.replace(/[/.]/g, '_')}`;
      try {
        await this.opaClient.deletePolicy(policyId);
      } catch {
        // Ignore delete errors
      }
    }
  }
}
