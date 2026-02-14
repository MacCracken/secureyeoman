/**
 * Input Validator Middleware — injection detection on string arguments.
 */

export interface InputValidatorMiddleware {
  validate(args: Record<string, unknown>): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  blocked: boolean;
  blockReason?: string;
  warnings: string[];
}

const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp; block: boolean }> = [
  // SQL injection
  { name: 'sql_union', pattern: /\bUNION\s+(?:ALL\s+)?SELECT\b/i, block: true },
  { name: 'sql_drop', pattern: /\bDROP\s+(?:TABLE|DATABASE)\b/i, block: true },
  { name: 'sql_semicolon', pattern: /;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER)\b/i, block: true },
  // Command injection
  { name: 'cmd_backtick', pattern: /`[^`]*`/, block: true },
  { name: 'cmd_subshell', pattern: /\$\([^)]*\)/, block: true },
  { name: 'cmd_pipe', pattern: /\|\s*(?:cat|sh|bash|curl|wget|nc)\b/, block: true },
  { name: 'cmd_semicolon', pattern: /;\s*(?:rm|cat|sh|bash|curl|wget|nc|chmod|chown)\b/, block: true },
  // XSS
  { name: 'xss_script', pattern: /<script\b/i, block: true },
  { name: 'xss_event', pattern: /\bon\w+\s*=/i, block: false },
  { name: 'xss_javascript', pattern: /javascript\s*:/i, block: true },
  // Template injection
  { name: 'template_double', pattern: /\{\{.*\}\}/, block: false },
  { name: 'template_expression', pattern: /\$\{[^}]*\}/, block: false },
];

export function createInputValidator(): InputValidatorMiddleware {
  return {
    validate(args: Record<string, unknown>): ValidationResult {
      const warnings: string[] = [];
      let blocked = false;
      let blockReason: string | undefined;

      function checkValue(value: unknown, path: string): void {
        if (typeof value === 'string') {
          for (const { name, pattern, block } of INJECTION_PATTERNS) {
            if (pattern.test(value)) {
              if (block) {
                blocked = true;
                blockReason = `Injection detected (${name}) in ${path}`;
              }
              warnings.push(`Suspicious pattern (${name}) in ${path}`);
            }
          }
        } else if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            checkValue(value[i], `${path}[${i}]`);
          }
        } else if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) {
            checkValue(v, `${path}.${k}`);
          }
        }
      }

      for (const [key, value] of Object.entries(args)) {
        checkValue(value, key);
      }

      return { valid: !blocked, blocked, blockReason, warnings };
    },
  };
}
