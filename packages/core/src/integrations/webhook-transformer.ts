/**
 * WebhookTransformer — applies ordered transformation rules to inbound webhook payloads.
 *
 * Rules are fetched from WebhookTransformStorage and applied in priority order
 * (lowest priority number first).  Each rule may:
 *   1. Extract values from the raw payload via JSONPath-like dot-notation paths.
 *   2. Render a template string ({{field}} placeholders) to produce the `text` field.
 *
 * The result is a partial UnifiedMessage patch that the caller merges over the
 * default normalised fields produced by the adapter.
 *
 * JSONPath support (subset):
 *   $.field                 — top-level property
 *   $.outer.inner           — nested property
 *   $.arr[0]                — array index
 *   $.arr[0].nested         — array element property
 */

import type { WebhookTransformStorage, ExtractRule } from './webhook-transform-storage.js';

// ─── JSONPath evaluator (minimal subset) ─────────────────────

function evaluatePath(data: unknown, path: string): string | undefined {
  if (!path.startsWith('$')) return undefined;

  // Remove leading "$." or just "$"
  const stripped = path.startsWith('$.') ? path.slice(2) : path.slice(1);
  if (!stripped) return String(data);

  const segments = parseSegments(stripped);
  let current: unknown = data;

  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof seg === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[seg];
    } else {
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[seg];
    }
  }

  if (current === null || current === undefined) return undefined;
  if (typeof current === 'object') return JSON.stringify(current);
  return String(current);
}

/**
 * Parses a dotted path with optional array index brackets into segments.
 * e.g. "pull_request.head.sha" → ["pull_request", "head", "sha"]
 *      "commits[0].message"    → ["commits", 0, "message"]
 */
function parseSegments(path: string): (string | number)[] {
  const segments: (string | number)[] = [];

  // Split on dots, then handle brackets within each part
  const parts = path.split('.');
  for (const part of parts) {
    const bracketIdx = part.indexOf('[');
    if (bracketIdx === -1) {
      if (part) segments.push(part);
    } else {
      // e.g. "commits[0]" → "commits", 0
      const name = part.slice(0, bracketIdx);
      if (name) segments.push(name);
      const bracket = part.slice(bracketIdx + 1, part.indexOf(']'));
      const idx = parseInt(bracket, 10);
      if (!isNaN(idx)) segments.push(idx);
    }
  }
  return segments;
}

// ─── Template renderer ────────────────────────────────────────

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ─── Transformer ──────────────────────────────────────────────

/** Fields of UnifiedMessage that transform rules are allowed to override. */
export interface WebhookPatch {
  text?: string;
  senderId?: string;
  senderName?: string;
  chatId?: string;
  metadata?: Record<string, string>;
}

export class WebhookTransformer {
  constructor(private readonly storage: WebhookTransformStorage) {}

  /**
   * Apply matching transform rules (in priority order) to a raw webhook payload.
   *
   * @param payload      The parsed JSON body of the inbound request.
   * @param integrationId The ID of the receiving integration.
   * @param event         Optional event type (from headers, e.g. X-GitHub-Event).
   * @returns A partial patch to merge into the default normalized message.
   */
  async applyRules(
    payload: Record<string, unknown>,
    integrationId: string,
    event?: string
  ): Promise<WebhookPatch> {
    const rules = await this.storage.listRules({ integrationId, enabled: true });

    const patch: WebhookPatch = {};
    const extractedVars: Record<string, string> = {};

    for (const rule of rules) {
      // ── Event filter ──────────────────────────────────────
      if (rule.matchEvent && event && rule.matchEvent !== event) continue;

      // ── Extract fields ─────────────────────────────────────
      for (const extract of rule.extractRules as ExtractRule[]) {
        const value = evaluatePath(payload, extract.path) ?? extract.default;
        if (value !== undefined) {
          extractedVars[extract.field] = value;
          // Merge into the patch for known UnifiedMessage fields
          const f = extract.field as keyof WebhookPatch;
          if (f === 'text' || f === 'senderId' || f === 'senderName' || f === 'chatId') {
            (patch as Record<string, unknown>)[f] = value;
          } else {
            patch.metadata = { ...(patch.metadata ?? {}), [extract.field]: value };
          }
        }
      }

      // ── Template render ───────────────────────────────────
      if (rule.template) {
        patch.text = renderTemplate(rule.template, extractedVars);
      }
    }

    return patch;
  }
}
