/**
 * Autonomy Audit — Phase 49: AI Autonomy Level Audit
 *
 * Storage and Manager for L1–L5 autonomy classification audits.
 * The autonomyLevel field on skills/workflows is governance documentation;
 * it does not affect runtime queuing behavior (that's automationLevel).
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { SoulManager } from '../soul/manager.js';
import type { WorkflowManager } from '../workflow/workflow-manager.js';
import type { AuditChain } from '../logging/audit-chain.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutonomyLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export type AuditItemStatus = 'pending' | 'pass' | 'fail' | 'deferred';

export interface ChecklistItem {
  id: string;
  section: 'A' | 'B' | 'C' | 'D';
  text: string;
  status: AuditItemStatus;
  note: string;
}

export interface AuditRun {
  id: string;
  name: string;
  status: string;
  items: ChecklistItem[];
  reportMarkdown?: string;
  reportJson?: unknown;
  createdBy?: string;
  createdAt: number;
  completedAt?: number;
}

export interface AutonomyOverviewItem {
  id: string;
  name: string;
  type: 'skill' | 'workflow';
  autonomyLevel: AutonomyLevel;
  emergencyStopProcedure?: string;
}

export interface AutonomyOverview {
  byLevel: Record<AutonomyLevel, AutonomyOverviewItem[]>;
  totals: Record<AutonomyLevel, number>;
}

// ─── Default Checklist ───────────────────────────────────────────────────────

export const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  // Section A — Inventory
  {
    id: 'A1',
    section: 'A',
    text: 'List all enabled skills and confirm their current autonomy level (L1–L5) is documented.',
    status: 'pending',
    note: '',
  },
  {
    id: 'A2',
    section: 'A',
    text: 'List all enabled workflows and confirm their current autonomy level (L1–L5) is documented.',
    status: 'pending',
    note: '',
  },
  {
    id: 'A3',
    section: 'A',
    text: 'Verify that every L4 and L5 item has a documented emergency stop procedure.',
    status: 'pending',
    note: '',
  },
  {
    id: 'A4',
    section: 'A',
    text: 'Confirm no new skills or workflows were added since the last audit without an assigned autonomy level.',
    status: 'pending',
    note: '',
  },

  // Section B — Level Review
  {
    id: 'B1',
    section: 'B',
    text: 'Review each L3+ skill: is the current oversight level still appropriate given recent usage patterns?',
    status: 'pending',
    note: '',
  },
  {
    id: 'B2',
    section: 'B',
    text: 'Review each L3+ workflow: is the current oversight level still appropriate?',
    status: 'pending',
    note: '',
  },
  {
    id: 'B3',
    section: 'B',
    text: 'Confirm L1/L2 items have not drifted in scope or capability since last classified.',
    status: 'pending',
    note: '',
  },
  {
    id: 'B4',
    section: 'B',
    text: "Verify automationLevel (runtime queue) is consistent with the declared autonomyLevel's intent for all L3+ items.",
    status: 'pending',
    note: '',
  },

  // Section C — Authority & Accountability
  {
    id: 'C1',
    section: 'C',
    text: 'Confirm each L3+ item has a designated human approver or team responsible for it.',
    status: 'pending',
    note: '',
  },
  {
    id: 'C2',
    section: 'C',
    text: 'Verify emergency stop procedures are documented, accessible, and have been tested.',
    status: 'pending',
    note: '',
  },
  {
    id: 'C3',
    section: 'C',
    text: 'Confirm operators can execute an emergency stop without requiring special tooling or elevated permissions.',
    status: 'pending',
    note: '',
  },
  {
    id: 'C4',
    section: 'C',
    text: 'Review audit log for any autonomy escalation events (level increases) since the last audit.',
    status: 'pending',
    note: '',
  },
  {
    id: 'C5',
    section: 'C',
    text: 'Verify org intent delegation framework is consistent with the autonomy levels assigned.',
    status: 'pending',
    note: '',
  },

  // Section D — Gap Remediation
  {
    id: 'D1',
    section: 'D',
    text: 'Document and schedule remediation for any L5 items that lack an emergency stop procedure.',
    status: 'pending',
    note: '',
  },
  {
    id: 'D2',
    section: 'D',
    text: 'Create follow-up tasks for any classification gaps or items requiring level changes.',
    status: 'pending',
    note: '',
  },
  {
    id: 'D3',
    section: 'D',
    text: 'Update org intent document to reflect any changes identified during this audit.',
    status: 'pending',
    note: '',
  },
];

// ─── Row types ───────────────────────────────────────────────────────────────

interface AuditRunRow {
  id: string;
  name: string;
  status: string;
  items: ChecklistItem[];
  report_markdown: string | null;
  report_json: unknown;
  created_by: string | null;
  created_at: number | string;
  completed_at: number | string | null;
}

function rowToAuditRun(row: AuditRunRow): AuditRun {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    items: row.items ?? [],
    reportMarkdown: row.report_markdown ?? undefined,
    reportJson: row.report_json ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: typeof row.created_at === 'string' ? Number(row.created_at) : row.created_at,
    completedAt:
      row.completed_at != null
        ? typeof row.completed_at === 'string'
          ? Number(row.completed_at)
          : row.completed_at
        : undefined,
  };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export class AutonomyAuditStorage extends PgBaseStorage {
  async createAuditRun(
    name: string,
    items: ChecklistItem[],
    createdBy?: string
  ): Promise<AuditRun> {
    const id = uuidv7();
    const now = Date.now();
    const row = await this.queryOne<AuditRunRow>(
      `INSERT INTO autonomy_audit_runs (id, name, status, items, created_by, created_at)
       VALUES ($1, $2, 'in_progress', $3::jsonb, $4, $5)
       RETURNING *`,
      [id, name, JSON.stringify(items), createdBy ?? null, now]
    );
    return rowToAuditRun(row!);
  }

  async updateAuditItem(
    runId: string,
    itemId: string,
    update: { status: AuditItemStatus; note: string }
  ): Promise<AuditRun | null> {
    const run = await this.getAuditRun(runId);
    if (!run) return null;
    if (!run.items.find((i) => i.id === itemId)) return null;
    const updatedItems = run.items.map((i) => (i.id === itemId ? { ...i, ...update } : i));
    const row = await this.queryOne<AuditRunRow>(
      `UPDATE autonomy_audit_runs SET items = $1::jsonb WHERE id = $2 RETURNING *`,
      [JSON.stringify(updatedItems), runId]
    );
    return row ? rowToAuditRun(row) : null;
  }

  async finalizeRun(
    runId: string,
    reportMarkdown: string,
    reportJson: unknown
  ): Promise<AuditRun | null> {
    const now = Date.now();
    const row = await this.queryOne<AuditRunRow>(
      `UPDATE autonomy_audit_runs
       SET status = 'completed', report_markdown = $1, report_json = $2::jsonb, completed_at = $3
       WHERE id = $4
       RETURNING *`,
      [reportMarkdown, JSON.stringify(reportJson), now, runId]
    );
    return row ? rowToAuditRun(row) : null;
  }

  async listAuditRuns(): Promise<AuditRun[]> {
    const rows = await this.queryMany<AuditRunRow>(
      `SELECT * FROM autonomy_audit_runs ORDER BY created_at DESC`
    );
    return rows.map(rowToAuditRun);
  }

  async getAuditRun(id: string): Promise<AuditRun | null> {
    const row = await this.queryOne<AuditRunRow>(
      `SELECT * FROM autonomy_audit_runs WHERE id = $1`,
      [id]
    );
    return row ? rowToAuditRun(row) : null;
  }

  async getOverview(): Promise<AutonomyOverview> {
    const skillRows = await this.queryMany<{
      id: string;
      name: string;
      autonomy_level: string;
      emergency_stop_procedure: string | null;
    }>(
      `SELECT id, name, autonomy_level, emergency_stop_procedure FROM soul.skills WHERE enabled = true`
    );

    const workflowRows = await this.queryMany<{
      id: string;
      name: string;
      autonomy_level: string | null;
      emergency_stop_procedure: string | null;
    }>(
      `SELECT id, name, autonomy_level, emergency_stop_procedure FROM workflow.definitions WHERE is_enabled = true`
    );

    const levels: AutonomyLevel[] = ['L1', 'L2', 'L3', 'L4', 'L5'];
    const byLevel: Record<AutonomyLevel, AutonomyOverviewItem[]> = {
      L1: [],
      L2: [],
      L3: [],
      L4: [],
      L5: [],
    };

    for (const row of skillRows) {
      const level = (row.autonomy_level ?? 'L1') as AutonomyLevel;
      if (byLevel[level]) {
        byLevel[level].push({
          id: row.id,
          name: row.name,
          type: 'skill',
          autonomyLevel: level,
          emergencyStopProcedure: row.emergency_stop_procedure ?? undefined,
        });
      }
    }
    for (const row of workflowRows) {
      const level = (row.autonomy_level ?? 'L2') as AutonomyLevel;
      if (byLevel[level]) {
        byLevel[level].push({
          id: row.id,
          name: row.name,
          type: 'workflow',
          autonomyLevel: level,
          emergencyStopProcedure: row.emergency_stop_procedure ?? undefined,
        });
      }
    }

    const totals = {} as Record<AutonomyLevel, number>;
    for (const l of levels) {
      totals[l] = byLevel[l].length;
    }

    return { byLevel, totals };
  }
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class AutonomyAuditManager {
  constructor(
    private readonly storage: AutonomyAuditStorage,
    private readonly soulManager: SoulManager | null,
    private readonly workflowManager: WorkflowManager | null,
    private readonly auditChain?: AuditChain | null
  ) {}

  getStorage(): AutonomyAuditStorage {
    return this.storage;
  }

  async getOverview(): Promise<AutonomyOverview> {
    return this.storage.getOverview();
  }

  async createAuditRun(name: string, createdBy?: string): Promise<AuditRun> {
    // Deep-clone the default checklist so each run gets fresh items
    const items: ChecklistItem[] = DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item }));
    return this.storage.createAuditRun(name, items, createdBy);
  }

  async updateAuditItem(
    runId: string,
    itemId: string,
    update: { status: AuditItemStatus; note: string }
  ): Promise<AuditRun | null> {
    return this.storage.updateAuditItem(runId, itemId, update);
  }

  async finalizeRun(runId: string): Promise<AuditRun | null> {
    const run = await this.storage.getAuditRun(runId);
    if (!run) return null;

    const reportMarkdown = this._buildReport(run);
    const reportJson = {
      runId: run.id,
      name: run.name,
      generatedAt: Date.now(),
      summary: {
        total: run.items.length,
        pass: run.items.filter((i) => i.status === 'pass').length,
        fail: run.items.filter((i) => i.status === 'fail').length,
        deferred: run.items.filter((i) => i.status === 'deferred').length,
        pending: run.items.filter((i) => i.status === 'pending').length,
      },
      sections: {
        A: run.items.filter((i) => i.section === 'A'),
        B: run.items.filter((i) => i.section === 'B'),
        C: run.items.filter((i) => i.section === 'C'),
        D: run.items.filter((i) => i.section === 'D'),
      },
    };

    return this.storage.finalizeRun(runId, reportMarkdown, reportJson);
  }

  async emergencyStop(type: 'skill' | 'workflow', id: string, actorId?: string): Promise<void> {
    if (type === 'skill') {
      if (!this.soulManager) throw new Error('SoulManager not available');
      await this.soulManager.updateSkill(id, { enabled: false });
    } else {
      if (!this.workflowManager) throw new Error('WorkflowManager not available');
      await this.workflowManager.updateDefinition(id, { isEnabled: false });
    }

    await this.auditChain?.record({
      event: 'autonomy_emergency_stop',
      level: 'warn',
      message: `Emergency stop activated for ${type} ${id}`,
      userId: actorId,
      metadata: { type, targetId: id, actorId },
    });
  }

  async listAuditRuns(): Promise<AuditRun[]> {
    return this.storage.listAuditRuns();
  }

  async getAuditRun(id: string): Promise<AuditRun | null> {
    return this.storage.getAuditRun(id);
  }

  private _buildReport(run: AuditRun): string {
    const pass = run.items.filter((i) => i.status === 'pass').length;
    const fail = run.items.filter((i) => i.status === 'fail').length;
    const deferred = run.items.filter((i) => i.status === 'deferred').length;
    const pending = run.items.filter((i) => i.status === 'pending').length;

    const lines: string[] = [
      `# Autonomy Audit Report: ${run.name}`,
      '',
      `**Run ID:** ${run.id}`,
      `**Generated:** ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      `| Status | Count |`,
      `|--------|-------|`,
      `| Pass | ${pass} |`,
      `| Fail | ${fail} |`,
      `| Deferred | ${deferred} |`,
      `| Pending | ${pending} |`,
      `| **Total** | **${run.items.length}** |`,
      '',
    ];

    for (const section of ['A', 'B', 'C', 'D'] as const) {
      const titles: Record<string, string> = {
        A: 'Section A — Inventory',
        B: 'Section B — Level Review',
        C: 'Section C — Authority & Accountability',
        D: 'Section D — Gap Remediation',
      };
      lines.push(`## ${titles[section]}`, '');
      lines.push(`| # | Item | Status | Notes |`);
      lines.push(`|---|------|--------|-------|`);
      for (const item of run.items.filter((i) => i.section === section)) {
        const statusEmoji =
          item.status === 'pass'
            ? '✅'
            : item.status === 'fail'
              ? '❌'
              : item.status === 'deferred'
                ? '⏳'
                : '⬜';
        lines.push(
          `| ${item.id} | ${item.text} | ${statusEmoji} ${item.status} | ${item.note || '—'} |`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
