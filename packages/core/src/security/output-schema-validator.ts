/**
 * OutputSchemaValidator — Minimal JSON Schema Subset Validator
 *
 * Validates structured tool/workflow outputs against a caller-supplied JSON Schema.
 * Deliberately minimal — no ajv, no new runtime dependencies.
 *
 * Supported schema keywords:
 *   - type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
 *   - required: string[]
 *   - properties: Record<string, schema>  (recursive)
 *   - items: schema                       (recursive, applied to every array element)
 *
 * Phase 54.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationError {
  /** Dot-separated path to the offending value, e.g. "user.address.zip". */
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ─── Validator ────────────────────────────────────────────────────────────────

export class OutputSchemaValidator {
  /**
   * Validate `output` against the given JSON Schema subset.
   */
  validate(output: unknown, schema: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    this._validate(output, schema, '', errors);
    return { valid: errors.length === 0, errors };
  }

  private _validate(
    value: unknown,
    schema: Record<string, unknown>,
    path: string,
    errors: ValidationError[]
  ): void {
    const schemaType = schema.type as string | undefined;

    // ── type check ────────────────────────────────────────────────────────────
    if (schemaType !== undefined) {
      const actualType = this._typeOf(value);
      if (!this._typeMatches(actualType, schemaType)) {
        errors.push({
          path: path || '(root)',
          message: `Expected type "${schemaType}" but got "${actualType}"`,
        });
        // Skip deeper checks when the top-level type is wrong
        return;
      }
    }

    // ── object checks ─────────────────────────────────────────────────────────
    if (schemaType === 'object' || (schemaType === undefined && this._isPlainObject(value))) {
      const obj = value as Record<string, unknown>;

      // required fields
      const required = schema.required as string[] | undefined;
      if (Array.isArray(required)) {
        for (const key of required) {
          if (!(key in obj)) {
            errors.push({
              path: path ? `${path}.${key}` : key,
              message: `Required field "${key}" is missing`,
            });
          }
        }
      }

      // properties
      const properties = schema.properties as Record<string, unknown> | undefined;
      if (properties && this._isPlainObject(properties)) {
        for (const [key, subSchema] of Object.entries(properties)) {
          if (key in obj) {
            const childPath = path ? `${path}.${key}` : key;
            this._validate(obj[key], subSchema as Record<string, unknown>, childPath, errors);
          }
        }
      }
    }

    // ── array checks ──────────────────────────────────────────────────────────
    if (schemaType === 'array' || (schemaType === undefined && Array.isArray(value))) {
      const arr = value as unknown[];
      const itemsSchema = schema.items as Record<string, unknown> | undefined;
      if (itemsSchema && this._isPlainObject(itemsSchema)) {
        for (let i = 0; i < arr.length; i++) {
          const childPath = path ? `${path}[${i}]` : `[${i}]`;
          this._validate(arr[i], itemsSchema, childPath, errors);
        }
      }
    }
  }

  private _typeOf(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private _typeMatches(actual: string, expected: string): boolean {
    if (expected === 'number' && (actual === 'number')) return true;
    return actual === expected;
  }

  private _isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
