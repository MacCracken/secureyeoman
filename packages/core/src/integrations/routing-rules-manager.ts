/**
 * RoutingRulesManager — Evaluates routing rules against inbound/outbound messages
 * and executes matching rule actions.
 *
 * ADR 087
 */

import type { UnifiedMessage } from '@secureyeoman/shared';
import type { RoutingRule, RoutingRuleMatch, RoutingRuleDryRun } from '@secureyeoman/shared';
import type { RoutingRulesStorage } from './routing-rules-storage.js';
import type { IntegrationManager } from './manager.js';
import type { SecureLogger } from '../logging/logger.js';

export interface RoutingRulesManagerDeps {
  storage: RoutingRulesStorage;
  integrationManager: IntegrationManager;
  logger: SecureLogger;
  /** Called when a 'personality' action rule matches — allows overriding active personality. */
  onPersonalityOverride?: (personalityId: string, message: UnifiedMessage) => Promise<void>;
}

/** Simple Mustache-style template renderer: {{text}}, {{senderName}}, {{platform}}, {{chatId}} */
function renderTemplate(template: string, msg: UnifiedMessage): string {
  return template
    .replace(/\{\{text\}\}/g, msg.text)
    .replace(/\{\{senderName\}\}/g, msg.senderName)
    .replace(/\{\{platform\}\}/g, msg.platform)
    .replace(/\{\{chatId\}\}/g, msg.chatId)
    .replace(/\{\{senderId\}\}/g, msg.senderId);
}

function matchesPattern(pattern: string | null, value: string): boolean {
  if (pattern === null) return true; // wildcard
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    // Treat invalid regex as literal substring match
    return value.includes(pattern);
  }
}

/**
 * Test whether a single rule matches the given message (or dry-run params).
 * Returns a reason string for non-matches.
 */
export function evaluateRule(
  rule: RoutingRule,
  opts: {
    platform: string;
    integrationId?: string;
    chatId?: string;
    senderId?: string;
    text?: string;
    direction: 'inbound' | 'outbound';
  }
): { matched: boolean; reason?: string } {
  if (!rule.enabled) return { matched: false, reason: 'rule is disabled' };

  // Direction
  if (rule.triggerDirection !== 'both' && rule.triggerDirection !== opts.direction) {
    return { matched: false, reason: `direction mismatch: rule=${rule.triggerDirection}` };
  }

  // Platform list ([] = all)
  if (rule.triggerPlatforms.length > 0 && !rule.triggerPlatforms.includes(opts.platform)) {
    return { matched: false, reason: `platform not in allowlist` };
  }

  // Integration list ([] = all)
  if (
    opts.integrationId &&
    rule.triggerIntegrationIds.length > 0 &&
    !rule.triggerIntegrationIds.includes(opts.integrationId)
  ) {
    return { matched: false, reason: `integrationId not in allowlist` };
  }

  // ChatId pattern
  if (opts.chatId && !matchesPattern(rule.triggerChatIdPattern, opts.chatId)) {
    return { matched: false, reason: `chatId pattern did not match` };
  }

  // SenderID pattern
  if (opts.senderId && !matchesPattern(rule.triggerSenderIdPattern, opts.senderId)) {
    return { matched: false, reason: `senderId pattern did not match` };
  }

  // Keyword pattern (matched against message text)
  if (opts.text !== undefined && !matchesPattern(rule.triggerKeywordPattern, opts.text)) {
    return { matched: false, reason: `keyword pattern did not match` };
  }

  return { matched: true };
}

export class RoutingRulesManager {
  private readonly deps: RoutingRulesManagerDeps;

  constructor(deps: RoutingRulesManagerDeps) {
    this.deps = deps;
  }

  /**
   * Evaluate all enabled rules against the message and return matched rules
   * in priority order. Fires recordMatch() for each matched rule.
   */
  async evaluateRules(message: UnifiedMessage): Promise<RoutingRule[]> {
    const rules = await this.deps.storage.listEnabled();
    const matched: RoutingRule[] = [];

    for (const rule of rules) {
      const result = evaluateRule(rule, {
        platform: message.platform,
        integrationId: message.integrationId,
        chatId: message.chatId,
        senderId: message.senderId,
        text: message.text,
        direction: 'inbound',
      });
      if (result.matched) {
        matched.push(rule);
        // Fire-and-forget — don't block message routing on stat update
        this.deps.storage.recordMatch(rule.id).catch((err) => {
          this.deps.logger.warn(
            `Failed to record match for rule ${rule.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      }
    }

    return matched;
  }

  /**
   * Execute the action for a matched rule against the given message.
   * Errors are logged but not rethrown — routing failure must not drop the message.
   */
  async applyRule(rule: RoutingRule, message: UnifiedMessage): Promise<void> {
    const { logger, integrationManager, onPersonalityOverride } = this.deps;

    try {
      switch (rule.actionType) {
        case 'forward':
        case 'reply': {
          const targetIntegrationId = rule.actionTargetIntegrationId ?? message.integrationId;
          const targetChatId = rule.actionTargetChatId ?? message.chatId;
          const text = rule.actionMessageTemplate
            ? renderTemplate(rule.actionMessageTemplate, message)
            : message.text;

          await integrationManager.sendMessage(targetIntegrationId, targetChatId, text, {
            routedByRule: rule.id,
            originalIntegrationId: message.integrationId,
            originalChatId: message.chatId,
          });
          logger.info(
            `Routing rule "${rule.name}" (${rule.id}): forwarded message to ` +
              `${targetIntegrationId}/${targetChatId}`
          );
          break;
        }

        case 'personality': {
          if (rule.actionPersonalityId && onPersonalityOverride) {
            await onPersonalityOverride(rule.actionPersonalityId, message);
            logger.info(
              `Routing rule "${rule.name}" (${rule.id}): personality override → ${rule.actionPersonalityId}`
            );
          } else {
            logger.warn(
              `Routing rule "${rule.name}" (${rule.id}): personality action requires ` +
                `actionPersonalityId and onPersonalityOverride callback`
            );
          }
          break;
        }

        case 'notify': {
          if (!rule.actionWebhookUrl) {
            logger.warn(
              `Routing rule "${rule.name}" (${rule.id}): notify action requires actionWebhookUrl`
            );
            break;
          }
          const payload = {
            ruleId: rule.id,
            ruleName: rule.name,
            message: {
              id: message.id,
              platform: message.platform,
              integrationId: message.integrationId,
              chatId: message.chatId,
              senderId: message.senderId,
              senderName: message.senderName,
              text: rule.actionMessageTemplate
                ? renderTemplate(rule.actionMessageTemplate, message)
                : message.text,
              timestamp: message.timestamp,
            },
          };

          const response = await fetch(rule.actionWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            logger.warn(
              `Routing rule "${rule.name}" (${rule.id}): webhook responded ${response.status}`
            );
          } else {
            logger.info(
              `Routing rule "${rule.name}" (${rule.id}): webhook notified → ${rule.actionWebhookUrl}`
            );
          }
          break;
        }

        default:
          logger.warn(`Routing rule "${rule.name}" (${rule.id}): unknown action type`);
      }
    } catch (err) {
      logger.error(
        `Routing rule "${rule.name}" (${rule.id}) action failed: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Handle all matched rules for an inbound message.
   * Called from MessageRouter.handleInbound() after the message is stored.
   */
  async processMessage(message: UnifiedMessage): Promise<void> {
    const matched = await this.evaluateRules(message);
    for (const rule of matched) {
      await this.applyRule(rule, message);
    }
  }

  /**
   * Dry-run: test a rule against synthetic message params without sending anything.
   * Used by the /test endpoint.
   */
  testRule(rule: RoutingRule, params: RoutingRuleDryRun): RoutingRuleMatch {
    const result = evaluateRule(rule, {
      platform: params.platform,
      integrationId: params.integrationId,
      chatId: params.chatId,
      senderId: params.senderId,
      text: params.text,
      direction: params.direction,
    });
    return { rule, matched: result.matched, reason: result.reason };
  }
}
