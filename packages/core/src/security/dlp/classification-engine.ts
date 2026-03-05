/**
 * Content Classification Engine — multi-layer content sensitivity classifier.
 *
 * Three classification layers:
 * 1. PII detection — reuses patterns from content-guardrail (SSN, credit card, etc.)
 * 2. Keyword matching — configurable keyword lists per classification level
 * 3. Custom regex patterns — user-defined patterns
 *
 * The highest triggered level wins (restricted > confidential > internal > public).
 */

import type { SecureLogger } from '../../logging/logger.js';
import {
  type ClassificationLevel,
  type ClassificationResult,
  type ClassificationRule,
  CLASSIFICATION_RANK,
} from './types.js';

// PII patterns reused from content-guardrail.ts
const PII_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi },
  { name: 'phone', pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'credit_card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
  { name: 'ip_address', pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
];

export interface ClassificationEngineConfig {
  defaultLevel: ClassificationLevel;
  keywords: {
    restricted: string[];
    confidential: string[];
  };
  piiAsConfidential: boolean;
  customPatterns?: { name: string; pattern: string; level: ClassificationLevel }[];
}

export interface ClassificationEngineDeps {
  logger: SecureLogger;
}

const DEFAULT_CONFIG: ClassificationEngineConfig = {
  defaultLevel: 'internal',
  keywords: {
    restricted: ['top secret', 'classified', 'restricted', 'secret clearance'],
    confidential: ['confidential', 'proprietary', 'trade secret', 'internal only'],
  },
  piiAsConfidential: true,
};

export class ClassificationEngine {
  private readonly config: ClassificationEngineConfig;
  private readonly logger: SecureLogger;

  constructor(config: Partial<ClassificationEngineConfig> = {}, deps: ClassificationEngineDeps) {
    this.config = { ...DEFAULT_CONFIG, ...config, keywords: { ...DEFAULT_CONFIG.keywords, ...config.keywords } };
    this.logger = deps.logger;
  }

  /**
   * Classify text content. Returns the highest classification level triggered.
   */
  classify(text: string): ClassificationResult {
    const rules: ClassificationRule[] = [];
    const piiFound: string[] = [];
    const keywordsFound: string[] = [];
    let highestLevel = this.config.defaultLevel;

    // Layer 1: PII detection
    for (const { name, pattern } of PII_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        piiFound.push(name);
        const piiLevel: ClassificationLevel = this.config.piiAsConfidential ? 'confidential' : 'internal';
        rules.push({ type: 'pii', name, level: piiLevel });
        if (CLASSIFICATION_RANK[piiLevel] > CLASSIFICATION_RANK[highestLevel]) {
          highestLevel = piiLevel;
        }
      }
    }

    // Layer 2: Keyword matching (case-insensitive)
    const lowerText = text.toLowerCase();

    for (const keyword of this.config.keywords.restricted) {
      if (lowerText.includes(keyword.toLowerCase())) {
        keywordsFound.push(keyword);
        rules.push({ type: 'keyword', name: keyword, level: 'restricted' });
        highestLevel = 'restricted';
      }
    }

    if (highestLevel !== 'restricted') {
      for (const keyword of this.config.keywords.confidential) {
        if (lowerText.includes(keyword.toLowerCase())) {
          keywordsFound.push(keyword);
          rules.push({ type: 'keyword', name: keyword, level: 'confidential' });
          if (CLASSIFICATION_RANK.confidential > CLASSIFICATION_RANK[highestLevel]) {
            highestLevel = 'confidential';
          }
        }
      }
    }

    // Layer 3: Custom regex patterns
    if (this.config.customPatterns) {
      for (const { name, pattern: patStr, level } of this.config.customPatterns) {
        try {
          const re = new RegExp(patStr, 'gi');
          if (re.test(text)) {
            rules.push({ type: 'pattern', name, level });
            if (CLASSIFICATION_RANK[level] > CLASSIFICATION_RANK[highestLevel]) {
              highestLevel = level;
            }
          }
        } catch {
          this.logger.warn('Invalid custom DLP pattern, skipping', { pattern: patStr, name });
        }
      }
    }

    this.logger.debug(
      'Content classified',
      { level: highestLevel, rulesCount: rules.length, piiCount: piiFound.length }
    );

    return {
      level: highestLevel,
      autoLevel: highestLevel,
      rulesTriggered: rules,
      piiFound,
      keywordsFound,
    };
  }
}
