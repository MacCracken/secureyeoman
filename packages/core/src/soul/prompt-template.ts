/**
 * Prompt Template Engine — Phase 142
 *
 * Generalized {{variable}} substitution for system prompts, skill
 * instructions, and tool descriptions. Supports a variable registry
 * with built-in variables and custom user-defined variables.
 */

import type { SecureLogger } from '../logging/logger.js';

export interface TemplateVariable {
  name: string;
  value: string;
  source: 'builtin' | 'user' | 'personality';
  description?: string;
}

export interface PromptTemplateConfig {
  /** Enable template expansion. Default true. */
  enabled: boolean;
  /** Warn on undefined variables instead of leaving them. Default true. */
  warnOnUndefined: boolean;
  /** Maximum variable value length. Default 10000. */
  maxValueLength: number;
}

export const DEFAULT_TEMPLATE_CONFIG: PromptTemplateConfig = {
  enabled: true,
  warnOnUndefined: true,
  maxValueLength: 10_000,
};

const VARIABLE_PATTERN = /\{\{(\w[\w.]*)\}\}/g;

export class PromptTemplateEngine {
  private readonly config: PromptTemplateConfig;
  private readonly logger?: SecureLogger;
  private readonly variables = new Map<string, TemplateVariable>();

  constructor(config?: Partial<PromptTemplateConfig>, logger?: SecureLogger) {
    this.config = { ...DEFAULT_TEMPLATE_CONFIG, ...config };
    this.logger = logger;
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    this.register({
      name: 'date',
      value: '', // computed at expansion time
      source: 'builtin',
      description: 'Current date (ISO)',
    });
    this.register({
      name: 'time',
      value: '',
      source: 'builtin',
      description: 'Current time (HH:MM)',
    });
    this.register({
      name: 'datetime',
      value: '',
      source: 'builtin',
      description: 'Current date and time (ISO)',
    });
    this.register({
      name: 'year',
      value: '',
      source: 'builtin',
      description: 'Current year',
    });
  }

  /**
   * Register or update a template variable.
   */
  register(variable: TemplateVariable): void {
    this.variables.set(variable.name, variable);
  }

  /**
   * Register multiple variables at once (e.g., from personality config).
   */
  registerBatch(variables: TemplateVariable[]): void {
    for (const v of variables) {
      this.register(v);
    }
  }

  /**
   * Remove a variable from the registry.
   */
  unregister(name: string): boolean {
    return this.variables.delete(name);
  }

  /**
   * Get all registered variables.
   */
  getVariables(): TemplateVariable[] {
    return [...this.variables.values()];
  }

  /**
   * Expand all {{variable}} placeholders in the given text.
   * Returns the expanded text and a list of unresolved variables.
   */
  expand(
    text: string,
    context?: Record<string, string>
  ): {
    text: string;
    unresolved: string[];
  } {
    if (!this.config.enabled) return { text, unresolved: [] };

    const unresolved: string[] = [];
    const now = new Date();

    const expanded = text.replace(VARIABLE_PATTERN, (match, name: string) => {
      // Check context overrides first
      if (context?.[name] != null) {
        return this.truncate(context[name]);
      }

      // Check registry
      const variable = this.variables.get(name);
      if (!variable) {
        unresolved.push(name);
        if (this.config.warnOnUndefined) {
          this.logger?.warn('Undefined template variable', { name });
        }
        return match; // Leave as-is
      }

      // Resolve builtin dynamic values
      if (variable.source === 'builtin') {
        return this.resolveBuiltin(name, now);
      }

      return this.truncate(variable.value);
    });

    return { text: expanded, unresolved };
  }

  /**
   * Extract all variable names referenced in a text.
   */
  extractVariables(text: string): string[] {
    const names = new Set<string>();
    let match;
    const re = new RegExp(VARIABLE_PATTERN.source, 'g');
    while ((match = re.exec(text)) !== null) {
      names.add(match[1]!);
    }
    return [...names];
  }

  private resolveBuiltin(name: string, now: Date): string {
    switch (name) {
      case 'date':
        return now.toISOString().slice(0, 10);
      case 'time':
        return now.toISOString().slice(11, 16);
      case 'datetime':
        return now.toISOString();
      case 'year':
        return String(now.getFullYear());
      default:
        return `{{${name}}}`;
    }
  }

  private truncate(value: string): string {
    return value.length > this.config.maxValueLength
      ? value.slice(0, this.config.maxValueLength) + '...'
      : value;
  }
}
