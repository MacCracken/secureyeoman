/**
 * Privacy Engine — TypeScript wrapper for stateful Rust DLP classification.
 *
 * Extends the simple classify_text/classify_text_batch (which use a fresh engine
 * each time) with persistent named engines that support custom patterns.
 * Falls back to a pure JS implementation when native module is unavailable.
 */

import { native } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type ClassificationLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export interface ClassificationResult {
  level: ClassificationLevel;
  autoLevel: ClassificationLevel;
  rulesTriggered: string[];
  piiFound: string[];
  keywordsFound: string[];
}

// ── Engine lifecycle ───────────────────────────────────────────────────────

export function createEngine(engineId: string): void {
  if (native?.privacyEngineCreate) {
    native.privacyEngineCreate(engineId);
    return;
  }
  createEngineJS(engineId);
}

export function addPattern(
  engineId: string,
  name: string,
  pattern: string,
  level: ClassificationLevel
): void {
  if (native?.privacyEngineAddPattern) {
    native.privacyEngineAddPattern(engineId, name, pattern, level);
    return;
  }
  addPatternJS(engineId, name, pattern, level);
}

export function classify(engineId: string, text: string): ClassificationResult {
  if (native?.privacyEngineClassify) {
    return JSON.parse(native.privacyEngineClassify(engineId, text)) as ClassificationResult;
  }
  return classifyJS(engineId, text);
}

export function classifyBatch(engineId: string, texts: string[]): ClassificationResult[] {
  if (native?.privacyEngineClassifyBatch) {
    return JSON.parse(native.privacyEngineClassifyBatch(engineId, texts)) as ClassificationResult[];
  }
  return texts.map((t) => classifyJS(engineId, t));
}

export function destroyEngine(engineId: string): boolean {
  if (native?.privacyEngineDestroy) {
    return native.privacyEngineDestroy(engineId);
  }
  return jsEngines.delete(engineId);
}

// ── JS Fallback ────────────────────────────────────────────────────────────

interface JSPattern {
  name: string;
  regex: RegExp;
  level: ClassificationLevel;
}

interface JSEngine {
  customPatterns: JSPattern[];
}

const jsEngines = new Map<string, JSEngine>();

const PII_PATTERNS: [string, RegExp][] = [
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i],
  ['phone', /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/],
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/],
  ['credit_card', /\b(?:\d{4}[-\s]?){3}\d{4}\b/],
  ['ip_address', /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/],
];

const RESTRICTED_KW = ['top secret', 'classified', 'restricted', 'secret clearance'];
const CONFIDENTIAL_KW = ['confidential', 'proprietary', 'trade secret', 'internal only'];

const LEVEL_ORDER: Record<ClassificationLevel, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function createEngineJS(engineId: string): void {
  jsEngines.set(engineId, { customPatterns: [] });
}

function addPatternJS(
  engineId: string,
  name: string,
  pattern: string,
  level: ClassificationLevel
): void {
  const engine = jsEngines.get(engineId);
  if (!engine) throw new Error(`Engine not found: ${engineId}`);
  engine.customPatterns.push({ name, regex: new RegExp(pattern), level });
}

function classifyJS(engineId: string, text: string): ClassificationResult {
  const engine = jsEngines.get(engineId);
  if (!engine) throw new Error(`Engine not found: ${engineId}`);

  let level: ClassificationLevel = 'internal';
  const rulesTriggered: string[] = [];
  const piiFound: string[] = [];
  const keywordsFound: string[] = [];

  for (const [name, re] of PII_PATTERNS) {
    if (re.test(text)) {
      piiFound.push(name);
      rulesTriggered.push(`pii:${name}`);
      if (LEVEL_ORDER.confidential > LEVEL_ORDER[level]) level = 'confidential';
    }
  }

  const lower = text.toLowerCase();
  for (const kw of RESTRICTED_KW) {
    if (lower.includes(kw)) {
      keywordsFound.push(kw);
      rulesTriggered.push(`keyword:restricted:${kw}`);
      if (LEVEL_ORDER.restricted > LEVEL_ORDER[level]) level = 'restricted';
    }
  }
  for (const kw of CONFIDENTIAL_KW) {
    if (lower.includes(kw)) {
      keywordsFound.push(kw);
      rulesTriggered.push(`keyword:confidential:${kw}`);
      if (LEVEL_ORDER.confidential > LEVEL_ORDER[level]) level = 'confidential';
    }
  }

  for (const { name, regex, level: customLevel } of engine.customPatterns) {
    if (regex.test(text)) {
      rulesTriggered.push(`custom:${name}`);
      if (LEVEL_ORDER[customLevel] > LEVEL_ORDER[level]) level = customLevel;
    }
  }

  return { level, autoLevel: level, rulesTriggered, piiFound, keywordsFound };
}
