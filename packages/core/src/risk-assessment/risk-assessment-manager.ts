/**
 * RiskAssessmentManager — Phase 53: Risk Assessment & Reporting System
 *
 * Cross-domain risk scoring engine that synthesises audit, autonomy, governance,
 * infrastructure, and external business risk data into a structured risk posture.
 */

import pg from 'pg';
import { uuidv7 } from '../utils/crypto.js';
import {
  RiskAssessmentStorage,
  type AssessmentResults,
} from './risk-assessment-storage.js';
import { RiskReportGenerator } from './risk-assessment-report.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { TlsManager } from '../security/tls-manager.js';
import type {
  RiskAssessment,
  RiskFinding,
  RiskLevel,
  RiskDomain,
  ExternalFeed,
  ExternalFinding,
  CreateRiskAssessment,
  CreateExternalFeed,
  CreateExternalFinding,
} from '@secureyeoman/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskAssessmentManagerDeps {
  storage: RiskAssessmentStorage;
  pool: pg.Pool;
  auditChain?: AuditChain | null;
  tlsManager?: TlsManager | null;
}

interface DomainResult {
  score: number;
  riskLevel: RiskLevel;
  findings: RiskFinding[];
  metadata: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function makeFinding(
  domain: RiskDomain,
  severity: RiskFinding['severity'],
  title: string,
  description: string,
  opts?: Pick<RiskFinding, 'affectedResource' | 'recommendation' | 'evidence'>
): RiskFinding {
  return {
    id: uuidv7(),
    domain,
    severity,
    title,
    description,
    ...opts,
  };
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class RiskAssessmentManager {
  private readonly storage: RiskAssessmentStorage;
  private readonly pool: pg.Pool;
  private readonly auditChain: AuditChain | null;
  private readonly tlsManager: TlsManager | null;
  private readonly reportGen: RiskReportGenerator;

  constructor(deps: RiskAssessmentManagerDeps) {
    this.storage = deps.storage;
    this.pool = deps.pool;
    this.auditChain = deps.auditChain ?? null;
    this.tlsManager = deps.tlsManager ?? null;
    this.reportGen = new RiskReportGenerator();
  }

  // ── Core ─────────────────────────────────────────────────────────────────────

  async runAssessment(
    opts: CreateRiskAssessment,
    createdBy?: string
  ): Promise<RiskAssessment> {
    const assessment = await this.storage.create(opts, createdBy);
    await this.storage.updateStatus(assessment.id, 'running');

    try {
      const types = opts.assessmentTypes ?? [
        'security',
        'autonomy',
        'governance',
        'infrastructure',
        'external',
      ];
      const windowDays = opts.windowDays ?? 7;

      const domainResults: Partial<Record<RiskDomain, DomainResult>> = {};

      await Promise.all(
        types.map(async (type) => {
          switch (type) {
            case 'security':
              domainResults.security = await this.scoreSecurity(windowDays);
              break;
            case 'autonomy':
              domainResults.autonomy = await this.scoreAutonomy();
              break;
            case 'governance':
              domainResults.governance = await this.scoreGovernance(windowDays);
              break;
            case 'infrastructure':
              domainResults.infrastructure = await this.scoreInfrastructure();
              break;
            case 'external':
              domainResults.external = await this.scoreExternal();
              break;
          }
        })
      );

      // Composite score with domain weights
      const weights: Record<string, number> = {
        security: 0.30,
        autonomy: 0.25,
        governance: 0.20,
        infrastructure: 0.15,
        external: 0.10,
      };

      let weightedSum = 0;
      let totalWeight = 0;
      const domainScores: Record<string, number> = {};

      for (const [domain, result] of Object.entries(domainResults)) {
        if (result) {
          domainScores[domain] = result.score;
          weightedSum += result.score * (weights[domain] ?? 0.1);
          totalWeight += weights[domain] ?? 0.1;
        }
      }

      const compositeScore = totalWeight > 0
        ? Math.round(weightedSum / totalWeight)
        : 0;

      const riskLevel = scoreToLevel(compositeScore);

      const allFindings = Object.values(domainResults).flatMap((r) => r?.findings ?? []);

      // Generate reports
      const partialAssessment: RiskAssessment = {
        ...assessment,
        status: 'completed',
        compositeScore,
        riskLevel,
        domainScores,
        findings: allFindings,
        findingsCount: allFindings.length,
      };

      const results: AssessmentResults = {
        compositeScore,
        riskLevel,
        domainScores,
        findings: allFindings,
        findingsCount: allFindings.length,
        reportJson: JSON.parse(this.reportGen.generateJson(partialAssessment)) as unknown,
        reportHtml: this.reportGen.generateHtml(partialAssessment),
        reportMarkdown: this.reportGen.generateMarkdown(partialAssessment),
        reportCsv: this.reportGen.generateCsv(partialAssessment),
      };

      return await this.storage.saveResults(assessment.id, results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.storage.updateStatus(assessment.id, 'failed', msg);
      return (await this.storage.get(assessment.id))!;
    }
  }

  async getAssessment(id: string): Promise<RiskAssessment | null> {
    return this.storage.get(id);
  }

  async listAssessments(opts?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<{ items: RiskAssessment[]; total: number }> {
    return this.storage.list(opts);
  }

  async generateReport(
    assessment: RiskAssessment,
    format: 'json' | 'html' | 'markdown' | 'csv'
  ): Promise<string> {
    switch (format) {
      case 'json':
        return this.reportGen.generateJson(assessment);
      case 'html':
        return this.reportGen.generateHtml(assessment);
      case 'markdown':
        return this.reportGen.generateMarkdown(assessment);
      case 'csv':
        return this.reportGen.generateCsv(assessment);
    }
  }

  // ── Domain Scorers ────────────────────────────────────────────────────────────

  private async scoreSecurity(windowDays: number): Promise<DomainResult> {
    const findings: RiskFinding[] = [];
    const since = Date.now() - windowDays * 24 * 60 * 60 * 1000;

    let injectionCount = 0;
    let sandboxCount = 0;
    let anomalyCount = 0;
    let authFailCount = 0;
    let secretAccessCount = 0;
    let chainValid = true;

    try {
      const result = await this.pool.query<{
        event_type: string;
        cnt: string;
      }>(
        `SELECT event_type, COUNT(*) AS cnt
         FROM audit.entries
         WHERE created_at >= $1
           AND event_type IN ('injection_attempt','sandbox_violation','anomaly_detected','auth_failure','secret_access')
         GROUP BY event_type`,
        [since]
      );

      for (const row of result.rows) {
        const n = Number(row.cnt);
        switch (row.event_type) {
          case 'injection_attempt': injectionCount = n; break;
          case 'sandbox_violation': sandboxCount = n; break;
          case 'anomaly_detected': anomalyCount = n; break;
          case 'auth_failure': authFailCount = n; break;
          case 'secret_access': secretAccessCount = n; break;
        }
      }
    } catch {
      // table may not have data yet — score as 0
    }

    // Check audit chain integrity
    if (this.auditChain) {
      try {
        const result = await this.auditChain.verify();
        chainValid = result.valid;
      } catch {
        chainValid = false;
      }
    }

    const injectionScore = clamp(injectionCount * 15, 0, 40);
    const sandboxScore = clamp(sandboxCount * 20, 0, 30);
    const anomalyScore = clamp(anomalyCount * 10, 0, 25);
    const authFailScore = clamp(authFailCount * 5, 0, 15);
    const secretScore = clamp(secretAccessCount * 5, 0, 15);
    const chainPenalty = chainValid ? 0 : 25;

    const score = clamp(
      injectionScore + sandboxScore + anomalyScore + authFailScore + secretScore + chainPenalty,
      0,
      100
    );

    if (injectionCount > 0) {
      findings.push(
        makeFinding('security', 'high', 'Injection Attempts Detected',
          `${injectionCount} injection attempt(s) detected in the last ${windowDays} days.`,
          { recommendation: 'Review audit log, enforce input validation.' }
        )
      );
    }
    if (sandboxCount > 0) {
      findings.push(
        makeFinding('security', 'critical', 'Sandbox Violations',
          `${sandboxCount} sandbox violation(s) detected in the last ${windowDays} days.`,
          { recommendation: 'Investigate and tighten sandbox policies immediately.' }
        )
      );
    }
    if (!chainValid) {
      findings.push(
        makeFinding('security', 'critical', 'Audit Chain Integrity Compromised',
          'The audit log chain verification failed. Evidence of tampering or corruption.',
          { recommendation: 'Investigate audit storage immediately and rotate signing key.' }
        )
      );
    }
    if (authFailCount > 10) {
      findings.push(
        makeFinding('security', 'medium', 'Elevated Authentication Failures',
          `${authFailCount} authentication failure(s) in the last ${windowDays} days.`,
          { recommendation: 'Enable brute-force protection and review account activity.' }
        )
      );
    }
    if (secretAccessCount > 5) {
      findings.push(
        makeFinding('security', 'high', 'Elevated Secret Access Events',
          `${secretAccessCount} secret access events in the last ${windowDays} days.`,
          { recommendation: 'Audit secret access patterns and review least-privilege assignments.' }
        )
      );
    }

    return {
      score,
      riskLevel: scoreToLevel(score),
      findings,
      metadata: { injectionCount, sandboxCount, anomalyCount, authFailCount, secretAccessCount, chainValid },
    };
  }

  private async scoreAutonomy(): Promise<DomainResult> {
    const findings: RiskFinding[] = [];

    let l5NoStop = 0;
    let l4NoStop = 0;
    let noAudit = false;
    let openItems = 0;

    try {
      // Count L5 and L4 skills/workflows without emergency_stop_procedure
      const skillResult = await this.pool.query<{ autonomy_level: string; no_stop: string }>(
        `SELECT autonomy_level,
                COUNT(*) FILTER (WHERE (emergency_stop_procedure IS NULL OR emergency_stop_procedure = '')) AS no_stop
         FROM soul.skills
         WHERE autonomy_level IN ('L4', 'L5') AND enabled = TRUE
         GROUP BY autonomy_level`
      );

      for (const row of skillResult.rows) {
        const n = Number(row.no_stop);
        if (row.autonomy_level === 'L5') l5NoStop += n;
        if (row.autonomy_level === 'L4') l4NoStop += n;
      }

      // Also check workflows
      const wfResult = await this.pool.query<{ autonomy_level: string; no_stop: string }>(
        `SELECT autonomy_level,
                COUNT(*) FILTER (WHERE (emergency_stop_procedure IS NULL OR emergency_stop_procedure = '')) AS no_stop
         FROM workflow.definitions
         WHERE autonomy_level IN ('L4', 'L5') AND is_enabled = TRUE
         GROUP BY autonomy_level`
      );

      for (const row of wfResult.rows) {
        const n = Number(row.no_stop);
        if (row.autonomy_level === 'L5') l5NoStop += n;
        if (row.autonomy_level === 'L4') l4NoStop += n;
      }
    } catch {
      // tables may not exist yet
    }

    // Check for any completed audit runs for L3+ items
    try {
      const auditResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM autonomy.audit_runs WHERE status = 'completed'`
      );
      noAudit = Number(auditResult.rows[0]?.count ?? 0) === 0;

      if (!noAudit) {
        // Get incomplete checklist items in latest audit run
        const latestRun = await this.pool.query<{ items: unknown }>(
          `SELECT items FROM autonomy.audit_runs WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1`
        );
        if (latestRun.rows[0]?.items) {
          const items = latestRun.rows[0].items as Array<{ status: string }>;
          openItems = Array.isArray(items)
            ? items.filter((i) => i.status === 'pending' || i.status === 'fail').length
            : 0;
        }
      }
    } catch {
      noAudit = false;
    }

    const l5Score = clamp(l5NoStop * 20, 0, 40);
    const l4Score = clamp(l4NoStop * 10, 0, 30);
    const auditScore = noAudit ? 20 : 0;
    const openItemScore = clamp(openItems * 2, 0, 20);

    const score = clamp(l5Score + l4Score + auditScore + openItemScore, 0, 100);

    for (let i = 0; i < l5NoStop; i++) {
      findings.push(
        makeFinding('autonomy', 'critical', 'L5 Item Without Emergency Stop',
          'An L5 (fully autonomous) skill or workflow has no emergency stop procedure defined.',
          { recommendation: 'Define an emergency stop procedure for all L4/L5 items.' }
        )
      );
    }
    for (let i = 0; i < l4NoStop; i++) {
      findings.push(
        makeFinding('autonomy', 'critical', 'L4 Item Without Emergency Stop',
          'An L4 (supervised autonomous) skill or workflow has no emergency stop procedure defined.',
          { recommendation: 'Define an emergency stop procedure for all L4/L5 items.' }
        )
      );
    }
    if (noAudit) {
      findings.push(
        makeFinding('autonomy', 'high', 'No Completed Autonomy Audit',
          'No completed autonomy audit runs exist. L3+ items have not been formally assessed.',
          { recommendation: 'Run an autonomy audit to assess all L3+ items.' }
        )
      );
    }
    if (openItems > 0) {
      findings.push(
        makeFinding('autonomy', 'medium', 'Incomplete Audit Checklist Items',
          `${openItems} checklist item(s) are pending or failed in the latest audit run.`,
          { recommendation: 'Review and resolve all open audit checklist items.' }
        )
      );
    }

    return {
      score,
      riskLevel: scoreToLevel(score),
      findings,
      metadata: { l5NoStop, l4NoStop, noAudit, openItems },
    };
  }

  private async scoreGovernance(windowDays: number): Promise<DomainResult> {
    const findings: RiskFinding[] = [];
    const since30d = Date.now() - 30 * 24 * 60 * 60 * 1000;

    let boundaryViolations = 0;
    let policyBlocks = 0;
    let noIntent = false;

    try {
      const logResult = await this.pool.query<{ event_type: string; cnt: string }>(
        `SELECT event_type, COUNT(*) AS cnt
         FROM intent.enforcement_log
         WHERE created_at >= $1
           AND event_type IN ('boundary_violated', 'policy_block')
         GROUP BY event_type`,
        [since30d]
      );

      for (const row of logResult.rows) {
        const n = Number(row.cnt);
        if (row.event_type === 'boundary_violated') boundaryViolations = n;
        if (row.event_type === 'policy_block') policyBlocks = n;
      }
    } catch {
      // table may not exist yet
    }

    try {
      const intentResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM intent.org_intents WHERE is_active = TRUE`
      );
      noIntent = Number(intentResult.rows[0]?.count ?? 0) === 0;
    } catch {
      noIntent = false;
    }

    const boundaryScore = clamp(boundaryViolations * 20, 0, 40);
    const policyScore = clamp(policyBlocks * 5, 0, 30);
    const intentScore = noIntent ? 30 : 0;

    const score = clamp(boundaryScore + policyScore + intentScore, 0, 100);

    if (boundaryViolations > 0) {
      findings.push(
        makeFinding('governance', 'critical', 'Hard Boundary Violations',
          `${boundaryViolations} hard boundary violation(s) in the last 30 days.`,
          { recommendation: 'Review org intent boundaries and retrain affected agents.' }
        )
      );
    }
    if (noIntent) {
      findings.push(
        makeFinding('governance', 'high', 'No Active Organizational Intent',
          'No active org intent document found. Governance constraints are not enforced.',
          { recommendation: 'Create and activate an organizational intent document.' }
        )
      );
    }
    const weeklyPolicyRate = policyBlocks / (30 / 7);
    if (weeklyPolicyRate > 5) {
      findings.push(
        makeFinding('governance', 'medium', 'Elevated Policy Block Rate',
          `Policy block rate is ${weeklyPolicyRate.toFixed(1)}/week (threshold: 5/week).`,
          { recommendation: 'Review policy configuration and agent permissions.' }
        )
      );
    }

    void windowDays; // parameter used for context
    return {
      score,
      riskLevel: scoreToLevel(score),
      findings,
      metadata: { boundaryViolations, policyBlocks, noIntent },
    };
  }

  private async scoreInfrastructure(): Promise<DomainResult> {
    const findings: RiskFinding[] = [];
    const since24h = Date.now() - 24 * 60 * 60 * 1000;

    let unhealthyMcp = 0;
    let failedInteg = 0;
    let untrustedPeers = 0;
    let certExpiringSoon = false;
    let heartbeatErrors = 0;

    try {
      const mcpResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM mcp.server_health WHERE status IN ('unhealthy', 'degraded')`
      );
      unhealthyMcp = Number(mcpResult.rows[0]?.count ?? 0);
    } catch { /* table may not exist */ }

    try {
      const integResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM integrations WHERE status = 'disconnected'`
      );
      failedInteg = Number(integResult.rows[0]?.count ?? 0);
    } catch { /* table may not exist */ }

    try {
      const peersResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM a2a.peers WHERE trust_level = 'untrusted' AND is_online = TRUE`
      );
      untrustedPeers = Number(peersResult.rows[0]?.count ?? 0);
    } catch { /* table may not exist */ }

    try {
      const hbResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM proactive.heartbeat_log WHERE status = 'error' AND created_at >= $1`,
        [since24h]
      );
      heartbeatErrors = Number(hbResult.rows[0]?.count ?? 0);
    } catch { /* table may not exist */ }

    // Check TLS cert expiry
    if (this.tlsManager) {
      try {
        const certStatus = await this.tlsManager.getCertStatus();
        if (certStatus.enabled && certStatus.daysUntilExpiry != null) {
          certExpiringSoon = certStatus.daysUntilExpiry <= 30;
        }
      } catch { /* ignore */ }
    }

    const mcpScore = clamp(unhealthyMcp * 15, 0, 30);
    const integScore = clamp(failedInteg * 10, 0, 25);
    const peersScore = clamp(untrustedPeers * 5, 0, 20);
    const certScore = certExpiringSoon ? 25 : 0;
    const hbScore = clamp(heartbeatErrors * 5, 0, 15);

    const score = clamp(mcpScore + integScore + peersScore + certScore + hbScore, 0, 100);

    if (unhealthyMcp > 0) {
      findings.push(
        makeFinding('infrastructure', 'high', 'Unhealthy MCP Servers',
          `${unhealthyMcp} MCP server(s) are in unhealthy or degraded state.`,
          { recommendation: 'Investigate MCP server health and restart affected servers.' }
        )
      );
    }
    if (failedInteg > 0) {
      findings.push(
        makeFinding('infrastructure', 'medium', 'Disconnected Integrations',
          `${failedInteg} integration(s) are in disconnected state.`,
          { recommendation: 'Reconnect or remove stale integration configs.' }
        )
      );
    }
    if (untrustedPeers > 0) {
      findings.push(
        makeFinding('infrastructure', 'high', 'Online Untrusted A2A Peers',
          `${untrustedPeers} untrusted A2A peer(s) are currently online.`,
          { recommendation: 'Review and approve or remove untrusted A2A peers.' }
        )
      );
    }
    if (certExpiringSoon) {
      findings.push(
        makeFinding('infrastructure', 'critical', 'TLS Certificate Expiring Soon',
          'TLS certificate will expire within 30 days.',
          { recommendation: 'Renew the TLS certificate immediately.' }
        )
      );
    }

    return {
      score,
      riskLevel: scoreToLevel(score),
      findings,
      metadata: { unhealthyMcp, failedInteg, untrustedPeers, certExpiringSoon, heartbeatErrors },
    };
  }

  private async scoreExternal(): Promise<DomainResult> {
    const findings: RiskFinding[] = [];

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;

    try {
      const result = await this.pool.query<{ severity: string; cnt: string }>(
        `SELECT severity, COUNT(*) AS cnt
         FROM risk.external_findings
         WHERE status = 'open'
           AND severity IN ('critical', 'high', 'medium')
         GROUP BY severity`
      );

      for (const row of result.rows) {
        const n = Number(row.cnt);
        if (row.severity === 'critical') criticalCount = n;
        if (row.severity === 'high') highCount = n;
        if (row.severity === 'medium') mediumCount = n;
      }
    } catch {
      // table may not exist yet
    }

    const critScore = clamp(criticalCount * 25, 0, 50);
    const highScore = clamp(highCount * 10, 0, 30);
    const medScore = clamp(mediumCount * 5, 0, 20);

    const score = clamp(critScore + highScore + medScore, 0, 100);

    if (criticalCount > 0) {
      findings.push(
        makeFinding('external', 'critical', 'Critical External Findings Open',
          `${criticalCount} critical external finding(s) remain open.`,
          { recommendation: 'Immediately address all critical external findings.' }
        )
      );
    }
    if (highCount > 0) {
      findings.push(
        makeFinding('external', 'high', 'High External Findings Open',
          `${highCount} high-severity external finding(s) remain open.`,
          { recommendation: 'Prioritize remediation of high-severity external findings.' }
        )
      );
    }
    if (mediumCount > 0) {
      findings.push(
        makeFinding('external', 'medium', 'Medium External Findings Open',
          `${mediumCount} medium-severity external finding(s) remain open.`,
          { recommendation: 'Schedule remediation within 30 days.' }
        )
      );
    }

    return {
      score,
      riskLevel: scoreToLevel(score),
      findings,
      metadata: { criticalCount, highCount, mediumCount },
    };
  }

  // ── External Feeds ────────────────────────────────────────────────────────────

  async createFeed(opts: CreateExternalFeed): Promise<ExternalFeed> {
    return this.storage.createFeed(opts);
  }

  async listFeeds(): Promise<ExternalFeed[]> {
    return this.storage.listFeeds();
  }

  async deleteFeed(id: string): Promise<void> {
    await this.storage.deleteFeed(id);
  }

  async ingestFindings(
    feedId: string,
    payload: CreateExternalFinding[]
  ): Promise<{ created: number; skipped: number }> {
    return this.storage.ingestFindings(feedId, payload);
  }

  async listFindings(opts?: {
    feedId?: string;
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ExternalFinding[]; total: number }> {
    return this.storage.listFindings(opts);
  }

  async acknowledgeFinding(id: string, userId?: string): Promise<ExternalFinding | null> {
    return this.storage.updateFindingStatus(id, 'acknowledged', userId);
  }

  async resolveFinding(id: string): Promise<ExternalFinding | null> {
    return this.storage.updateFindingStatus(id, 'resolved');
  }

  async createFinding(opts: CreateExternalFinding): Promise<ExternalFinding> {
    return this.storage.createFinding(opts);
  }
}
