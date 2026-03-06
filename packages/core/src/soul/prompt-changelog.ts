/**
 * Prompt Changelog — Phase 142
 *
 * Annotated history of system prompt changes with rationale.
 * Builds on PersonalityVersionManager snapshots but adds:
 * - Structured rationale annotations
 * - Compliance-friendly export (JSON + CSV)
 * - Change categorization
 */

export type ChangeCategory =
  | 'safety'
  | 'behavior'
  | 'tone'
  | 'capability'
  | 'formatting'
  | 'performance'
  | 'compliance'
  | 'other';

export interface ChangelogEntry {
  id: string;
  personalityId: string;
  versionTag: string | null;
  timestamp: number;
  author: string;
  category: ChangeCategory;
  rationale: string;
  changedFields: string[];
  diffSummary: string | null;
  previousPrompt: string | null;
  currentPrompt: string;
}

export interface ChangelogExportOptions {
  format: 'json' | 'csv';
  personalityId?: string;
  fromDate?: number;
  toDate?: number;
}

export class PromptChangelog {
  private entries: ChangelogEntry[] = [];
  private nextId = 1;

  addEntry(entry: Omit<ChangelogEntry, 'id' | 'timestamp'>): ChangelogEntry {
    const full: ChangelogEntry = {
      ...entry,
      id: `pcl-${this.nextId++}`,
      timestamp: Date.now(),
    };
    this.entries.push(full);
    return full;
  }

  getEntries(personalityId?: string, limit?: number): ChangelogEntry[] {
    let result = this.entries;
    if (personalityId) {
      result = result.filter((e) => e.personalityId === personalityId);
    }
    // Most recent first; tiebreak by id descending for same-tick entries
    result = [...result].sort((a, b) => {
      const dt = b.timestamp - a.timestamp;
      if (dt !== 0) return dt;
      const aNum = parseInt(a.id.replace('pcl-', ''), 10);
      const bNum = parseInt(b.id.replace('pcl-', ''), 10);
      return bNum - aNum;
    });
    if (limit) result = result.slice(0, limit);
    return result;
  }

  getEntry(id: string): ChangelogEntry | null {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  /**
   * Export changelog in the specified format for compliance.
   */
  export(opts: ChangelogExportOptions): string {
    let entries = this.entries;

    if (opts.personalityId) {
      entries = entries.filter((e) => e.personalityId === opts.personalityId);
    }
    if (opts.fromDate) {
      entries = entries.filter((e) => e.timestamp >= opts.fromDate!);
    }
    if (opts.toDate) {
      entries = entries.filter((e) => e.timestamp <= opts.toDate!);
    }

    entries = [...entries].sort((a, b) => b.timestamp - a.timestamp);

    if (opts.format === 'csv') {
      return this.exportCsv(entries);
    }
    return JSON.stringify(entries, null, 2);
  }

  private exportCsv(entries: ChangelogEntry[]): string {
    const header = 'id,personalityId,versionTag,timestamp,author,category,rationale,changedFields';
    const rows = entries.map((e) =>
      [
        e.id,
        e.personalityId,
        e.versionTag ?? '',
        new Date(e.timestamp).toISOString(),
        this.escapeCsv(e.author),
        e.category,
        this.escapeCsv(e.rationale),
        this.escapeCsv(e.changedFields.join('; ')),
      ].join(',')
    );
    return [header, ...rows].join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  get size(): number {
    return this.entries.length;
  }
}
