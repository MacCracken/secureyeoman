/**
 * Built-in Proactive Triggers — 5 default triggers (disabled by default).
 */

import type { ProactiveTrigger } from '@secureyeoman/shared';

export const BUILTIN_TRIGGERS: ProactiveTrigger[] = [
  {
    id: 'builtin-daily-standup',
    name: 'Daily Standup Reminder',
    description:
      'Reminds you to check in each weekday morning with a summary of pending tasks and recent activity.',
    enabled: false,
    type: 'schedule',
    condition: {
      type: 'schedule',
      cron: '0 9 * * 1-5',
      timezone: 'UTC',
    },
    action: {
      type: 'message',
      content:
        'Good morning! Here is your daily standup summary. Check your pending tasks and recent activity.',
    },
    approvalMode: 'auto',
    cooldownMs: 43200000,
    limitPerDay: 1,
    builtin: true,
  },
  {
    id: 'builtin-weekly-summary',
    name: 'Weekly Summary',
    description:
      'Generates a weekly summary every Friday afternoon covering key metrics, completed tasks, and upcoming items.',
    enabled: false,
    type: 'schedule',
    condition: {
      type: 'schedule',
      cron: '0 17 * * 5',
      timezone: 'UTC',
    },
    action: {
      type: 'message',
      content:
        "Here is your weekly summary. Review this week's accomplishments and plan for next week.",
    },
    approvalMode: 'suggest',
    cooldownMs: 604800000,
    limitPerDay: 1,
    builtin: true,
  },
  {
    id: 'builtin-contextual-followup',
    name: 'Contextual Follow-up',
    description:
      'Detects unfinished conversations or pending intents and suggests follow-up actions.',
    enabled: false,
    type: 'pattern',
    condition: {
      type: 'pattern',
      patternId: 'pending-intent',
      minConfidence: 0.7,
    },
    action: {
      type: 'remind',
      content: 'You had a pending conversation or task that may need follow-up.',
      category: 'contextual_followup',
    },
    approvalMode: 'suggest',
    cooldownMs: 7200000,
    limitPerDay: 5,
    builtin: true,
  },
  {
    id: 'builtin-integration-health',
    name: 'Integration Health Alert',
    description: 'Alerts when a connected integration disconnects or encounters errors.',
    enabled: false,
    type: 'event',
    condition: {
      type: 'event',
      eventType: 'integration_disconnected',
    },
    action: {
      type: 'message',
      content:
        'An integration has disconnected. Check your connections to ensure all services are running.',
    },
    approvalMode: 'auto',
    cooldownMs: 300000,
    limitPerDay: 10,
    builtin: true,
  },
  {
    id: 'builtin-security-digest',
    name: 'Security Alert Digest',
    description:
      'Sends a daily morning digest of overnight security events (auth failures, rate limits, anomalies).',
    enabled: false,
    type: 'schedule',
    condition: {
      type: 'schedule',
      cron: '0 8 * * *',
      timezone: 'UTC',
    },
    action: {
      type: 'message',
      content:
        'Security digest: Review overnight security events including authentication failures, rate limits, and anomalies.',
    },
    approvalMode: 'suggest',
    cooldownMs: 43200000,
    limitPerDay: 1,
    builtin: true,
  },
];
