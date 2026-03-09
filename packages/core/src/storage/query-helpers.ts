/**
 * Query Helpers — Reusable building blocks for dynamic SQL queries.
 *
 * Eliminates the duplicated conditions[]/vals[]/idx++ boilerplate found across 56+ store files.
 */

// ── Where Clause Builder ────────────────────────────────────────────

export interface WhereFilter {
  /** SQL column or expression, e.g. "status" or "metadata->>'name'" */
  column: string;
  /** Value to bind. If undefined the filter is skipped. */
  value: unknown;
  /** SQL operator. Defaults to '='. Use '?' for jsonb containment, 'ILIKE' for fuzzy, etc. */
  op?: string;
}

export interface WhereResult {
  /** SQL fragment: "WHERE col1 = $1 AND col2 = $2" or empty string if no filters matched. */
  where: string;
  /** Bound parameter values in order. */
  values: unknown[];
  /** Next available parameter index (1-based). */
  nextIdx: number;
}

/**
 * Build a parameterized WHERE clause from optional filters.
 * Filters with `undefined` or `null` values are silently skipped.
 *
 * @param filters - Array of column/value pairs (undefined values are ignored)
 * @param startIdx - Starting parameter index (default 1)
 *
 * @example
 * ```ts
 * const { where, values, nextIdx } = buildWhere([
 *   { column: 'status', value: opts.status },
 *   { column: 'tool', value: opts.tool },
 *   { column: 'sra_control_ids', value: opts.sraControlId, op: '?' },
 * ]);
 * const rows = await this.queryMany(`SELECT * FROM t ${where} ORDER BY id LIMIT $${nextIdx}`, [...values, limit]);
 * ```
 */
export function buildWhere(filters: WhereFilter[], startIdx = 1): WhereResult {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = startIdx;

  for (const f of filters) {
    if (f.value === undefined || f.value === null) continue;
    const op = f.op ?? '=';
    conditions.push(`${f.column} ${op} $${idx++}`);
    values.push(f.value);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, values, nextIdx: idx };
}

// ── SET Clause Builder ──────────────────────────────────────────────

export interface SetField {
  /** SQL column name, e.g. "status" */
  column: string;
  /** Value to set. If undefined the field is skipped. */
  value: unknown;
  /** If true, JSON.stringify the value before binding. */
  json?: boolean;
}

export interface SetResult {
  /** SQL fragment: "status = $1, name = $2" (no SET keyword). Empty string if nothing to set. */
  setClause: string;
  /** Bound parameter values in order. */
  values: unknown[];
  /** Next available parameter index (1-based). */
  nextIdx: number;
  /** True if at least one field was included. */
  hasUpdates: boolean;
}

/**
 * Build a parameterized SET clause for UPDATE statements.
 * Fields with `undefined` values are silently skipped.
 *
 * @param fields - Array of column/value pairs (undefined values are ignored)
 * @param startIdx - Starting parameter index (default 1)
 *
 * @example
 * ```ts
 * const { setClause, values, nextIdx, hasUpdates } = buildSet([
 *   { column: 'status', value: updates.status },
 *   { column: 'members', value: updates.members, json: true },
 * ]);
 * if (!hasUpdates) return;
 * values.push(id);
 * await this.execute(`UPDATE t SET ${setClause} WHERE id = $${nextIdx}`, values);
 * ```
 */
export function buildSet(fields: SetField[], startIdx = 1): SetResult {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = startIdx;

  for (const f of fields) {
    if (f.value === undefined) continue;
    sets.push(`${f.column} = $${idx++}`);
    values.push(f.json ? JSON.stringify(f.value) : f.value);
  }

  return {
    setClause: sets.join(', '),
    values,
    nextIdx: idx,
    hasUpdates: sets.length > 0,
  };
}

// ── Count Parser ────────────────────────────────────────────────────

/**
 * Parse a COUNT query result row into a number.
 * Handles the common `{ count: string }` pattern from `SELECT COUNT(*)::TEXT AS count`.
 */
export function parseCount(row: { count: string } | null | undefined): number {
  return parseInt(row?.count ?? '0', 10);
}

// ── Timestamp Converter ─────────────────────────────────────────────

/**
 * Convert a database timestamp value to epoch milliseconds.
 * Handles string (ISO/pg timestamp), number (passthrough), and null/undefined.
 */
export function toTs(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  return new Date(val).getTime();
}
