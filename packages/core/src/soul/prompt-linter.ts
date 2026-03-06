/**
 * Prompt Linter — Phase 142
 *
 * Detects common issues in system prompts:
 * - Conflicting instructions (contradictions)
 * - Overly long prompts (token budget heuristic)
 * - Missing safety boundaries
 * - Undefined template variables
 * - Duplicate instructions
 */

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintResult {
  rule: string;
  severity: LintSeverity;
  message: string;
  line?: number;
}

export interface PromptLinterConfig {
  /** Maximum character count before warning. Default 8000. */
  maxLength: number;
  /** Maximum line count before warning. Default 200. */
  maxLines: number;
  /** Require at least one safety-related instruction. Default true. */
  requireSafetyBoundary: boolean;
  /** Check for undefined template variables. Default true. */
  checkTemplateVars: boolean;
}

export const DEFAULT_LINTER_CONFIG: PromptLinterConfig = {
  maxLength: 8000,
  maxLines: 200,
  requireSafetyBoundary: true,
  checkTemplateVars: true,
};

const SAFETY_KEYWORDS = [
  'do not',
  "don't",
  'never',
  'refuse',
  'decline',
  'avoid',
  'safety',
  'harmful',
  'dangerous',
  'ethical',
  'appropriate',
  'boundaries',
  'limit',
  'restrict',
  'forbidden',
  'prohibited',
];

const CONFLICTING_PAIRS: [RegExp, RegExp, string][] = [
  [
    /always\s+(?:be\s+)?(?:brief|concise|short)/i,
    /always\s+(?:be\s+)?(?:detailed|verbose|thorough|comprehensive)/i,
    'Conflicting instructions: both brief and detailed requested',
  ],
  [
    /never\s+(?:use|include)\s+(?:code|examples)/i,
    /always\s+(?:include|provide)\s+(?:code|examples)/i,
    'Conflicting instructions: code/examples both forbidden and required',
  ],
  [
    /do\s+not\s+(?:ask|request)\s+(?:clarification|questions)/i,
    /always\s+(?:ask|request)\s+(?:clarification|questions)/i,
    'Conflicting instructions: clarification both forbidden and required',
  ],
  [
    /(?:formal|professional)\s+(?:tone|language|style)/i,
    /(?:casual|informal|friendly)\s+(?:tone|language|style)/i,
    'Conflicting tone: both formal and casual styles specified',
  ],
];

const TEMPLATE_PATTERN = /\{\{(\w[\w.]*)\}\}/g;

export class PromptLinter {
  private readonly config: PromptLinterConfig;

  constructor(config?: Partial<PromptLinterConfig>) {
    this.config = { ...DEFAULT_LINTER_CONFIG, ...config };
  }

  /**
   * Lint a prompt text and return all findings.
   */
  lint(prompt: string): LintResult[] {
    const results: LintResult[] = [];

    if (!prompt || prompt.trim().length === 0) {
      results.push({
        rule: 'empty-prompt',
        severity: 'error',
        message: 'Prompt is empty',
      });
      return results;
    }

    this.checkLength(prompt, results);
    this.checkLineCount(prompt, results);
    this.checkSafetyBoundary(prompt, results);
    this.checkConflicts(prompt, results);
    this.checkDuplicateLines(prompt, results);
    this.checkTemplateVariables(prompt, results);

    return results;
  }

  private checkLength(prompt: string, results: LintResult[]): void {
    if (prompt.length > this.config.maxLength) {
      results.push({
        rule: 'max-length',
        severity: 'warning',
        message: `Prompt exceeds ${this.config.maxLength} characters (${prompt.length}). Consider shortening to reduce token costs.`,
      });
    }
  }

  private checkLineCount(prompt: string, results: LintResult[]): void {
    const lineCount = prompt.split('\n').length;
    if (lineCount > this.config.maxLines) {
      results.push({
        rule: 'max-lines',
        severity: 'warning',
        message: `Prompt has ${lineCount} lines (max ${this.config.maxLines}). Long prompts may dilute instruction following.`,
      });
    }
  }

  private checkSafetyBoundary(prompt: string, results: LintResult[]): void {
    if (!this.config.requireSafetyBoundary) return;

    const lower = prompt.toLowerCase();
    const hasSafety = SAFETY_KEYWORDS.some((kw) => lower.includes(kw));

    if (!hasSafety) {
      results.push({
        rule: 'missing-safety',
        severity: 'warning',
        message:
          'No safety boundary instructions detected. Consider adding guidance on harmful content, ethical limits, or refusal criteria.',
      });
    }
  }

  private checkConflicts(prompt: string, results: LintResult[]): void {
    for (const [patternA, patternB, message] of CONFLICTING_PAIRS) {
      if (patternA.test(prompt) && patternB.test(prompt)) {
        results.push({
          rule: 'conflicting-instructions',
          severity: 'error',
          message,
        });
      }
    }
  }

  private checkDuplicateLines(prompt: string, results: LintResult[]): void {
    const lines = prompt
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 20); // Only check non-trivial lines

    const seen = new Map<string, number>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const prev = seen.get(line);
      if (prev != null) {
        results.push({
          rule: 'duplicate-line',
          severity: 'info',
          message: `Duplicate instruction found (lines ${prev + 1} and ${i + 1})`,
          line: i + 1,
        });
      } else {
        seen.set(line, i);
      }
    }
  }

  private checkTemplateVariables(prompt: string, results: LintResult[]): void {
    if (!this.config.checkTemplateVars) return;

    const seen = new Set<string>();
    let match;
    const re = new RegExp(TEMPLATE_PATTERN.source, 'g');
    while ((match = re.exec(prompt)) !== null) {
      const name = match[1]!;
      if (!seen.has(name)) {
        seen.add(name);
        results.push({
          rule: 'template-variable',
          severity: 'info',
          message: `Template variable {{${name}}} found — ensure it is registered before use.`,
        });
      }
    }
  }
}
