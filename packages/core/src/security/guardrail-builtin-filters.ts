/**
 * Builtin Guardrail Filters — Phase 143
 *
 * Adapters that wrap existing security guards (ToolOutputScanner, ResponseGuard,
 * ContentGuardrail) as GuardrailFilter plugins for the extensible pipeline.
 */

import { sha256 } from '../utils/crypto.js';
import type {
  GuardrailFilter,
  GuardrailFilterContext,
  GuardrailFilterResult,
  GuardrailFilterFinding,
  ContentGuardrailPersonalityConfig,
} from '@secureyeoman/shared';
import type { ToolOutputScanner } from './tool-output-scanner.js';
import type { ContentGuardrail } from './content-guardrail.js';

// ── Response Guard types (avoid importing the full module) ───────────

interface ResponseGuardLike {
  scan(
    text: string,
    ctx: { source: string }
  ): {
    passed: boolean;
    findings: { patternName: string; severity: string; detail?: string }[];
  };
  checkBrainConsistency(
    text: string,
    ctx: {
      contextSnippets?: string[];
      memoriesUsed?: number;
    }
  ): unknown[];
  checkSystemPromptLeak(
    text: string,
    systemPrompt: string
  ): { hasLeak: boolean; overlapRatio: number; redacted: string };
}

// ── Tool Output Scanner Filter ───────────────────────────────────────

export class ToolOutputScannerFilter implements GuardrailFilter {
  readonly id = 'builtin:tool-output-scanner';
  readonly name = 'Tool Output Scanner';
  readonly priority = 100;
  enabled = true;

  constructor(private readonly scanner: ToolOutputScanner) {}

  async onOutput(text: string, _ctx: GuardrailFilterContext): Promise<GuardrailFilterResult> {
    const result = this.scanner.scan(text, 'llm_response');
    const findings: GuardrailFilterFinding[] = result.redactions.map((r) => ({
      filterId: this.id,
      type: 'credential_leak',
      action: 'redact' as const,
      detail: `${r.type} redacted (${r.count} occurrence${r.count > 1 ? 's' : ''})`,
    }));

    return {
      passed: true, // scanner always redacts, never blocks
      text: result.text,
      findings,
    };
  }
}

// ── Response Guard Filter ────────────────────────────────────────────

export interface ResponseGuardFilterOptions {
  /** Brain context for consistency checks */
  brainContext?: {
    contextSnippets?: string[];
    memoriesUsed?: number;
  };
  /** System prompt for leak detection */
  systemPrompt?: string;
  /** Strict system prompt confidentiality mode */
  strictConfidentiality?: boolean;
}

export class ResponseGuardFilter implements GuardrailFilter {
  readonly id = 'builtin:response-guard';
  readonly name = 'Response Guard';
  readonly priority = 200;
  enabled = true;

  private options: ResponseGuardFilterOptions = {};

  constructor(private readonly guard: ResponseGuardLike) {}

  /** Update context-dependent options before each pipeline run */
  setOptions(opts: ResponseGuardFilterOptions): void {
    this.options = opts;
  }

  async onOutput(text: string, ctx: GuardrailFilterContext): Promise<GuardrailFilterResult> {
    const findings: GuardrailFilterFinding[] = [];

    // Main scan
    const result = this.guard.scan(text, { source: ctx.source });
    for (const f of result.findings) {
      findings.push({
        filterId: this.id,
        type: 'injection_pattern',
        action: result.passed ? 'warn' : 'block',
        detail: `${f.patternName}: ${f.detail ?? f.severity}`,
        contentHash: sha256(f.patternName),
      });
    }

    // Brain consistency check (warn-only)
    if (this.options.brainContext) {
      this.guard.checkBrainConsistency(text, this.options.brainContext);
    }

    // System prompt leak check
    if (this.options.strictConfidentiality && this.options.systemPrompt) {
      const leakResult = this.guard.checkSystemPromptLeak(text, this.options.systemPrompt);
      if (leakResult.hasLeak) {
        findings.push({
          filterId: this.id,
          type: 'system_prompt_leak',
          action: 'warn',
          detail: `System prompt overlap ratio: ${leakResult.overlapRatio.toFixed(3)}`,
        });
      }
    }

    return {
      passed: result.passed,
      text,
      findings,
    };
  }
}

// ── Content Guardrail Filter ─────────────────────────────────────────

export interface ContentGuardrailFilterOptions {
  personalityGuardrailConfig?: ContentGuardrailPersonalityConfig;
}

export class ContentGuardrailFilter implements GuardrailFilter {
  readonly id = 'builtin:content-guardrail';
  readonly name = 'Content Guardrail';
  readonly priority = 300;
  enabled = true;

  private personalityCfg?: ContentGuardrailPersonalityConfig;

  constructor(private readonly guardrail: ContentGuardrail) {}

  /** Update per-personality config before each pipeline run */
  setPersonalityConfig(cfg?: ContentGuardrailPersonalityConfig): void {
    this.personalityCfg = cfg;
  }

  async onOutput(text: string, ctx: GuardrailFilterContext): Promise<GuardrailFilterResult> {
    const result = await this.guardrail.scan(
      text,
      {
        source: ctx.source,
        personalityId: ctx.personalityId,
        conversationId: ctx.conversationId,
      },
      this.personalityCfg
    );

    const findings: GuardrailFilterFinding[] = result.findings.map((f) => ({
      filterId: this.id,
      type: f.type,
      action: f.action,
      detail: f.detail,
      contentHash: f.contentHash,
    }));

    return {
      passed: result.passed,
      text: result.text,
      findings,
    };
  }
}

// ── Prompt Guard Filter (input-side) ─────────────────────────────────

interface PromptGuardLike {
  scan(messages: { role: string; content: string }[]): {
    passed: boolean;
    findings: { patternName: string; severity: string; detail?: string }[];
  };
}

export class PromptGuardFilter implements GuardrailFilter {
  readonly id = 'builtin:prompt-guard';
  readonly name = 'Prompt Guard';
  readonly priority = 100;
  enabled = true;

  constructor(private readonly guard: PromptGuardLike) {}

  async onInput(text: string, _ctx: GuardrailFilterContext): Promise<GuardrailFilterResult> {
    const result = this.guard.scan([{ role: 'user', content: text }]);
    const findings: GuardrailFilterFinding[] = result.findings.map((f) => ({
      filterId: this.id,
      type: 'prompt_injection',
      action: result.passed ? 'warn' : 'block',
      detail: `${f.patternName}: ${f.detail ?? f.severity}`,
      contentHash: sha256(f.patternName),
    }));

    return {
      passed: result.passed,
      text,
      findings,
    };
  }
}
