/**
 * Event Subscription Types — Webhook/Event Subscription system.
 *
 * Defines the event types, subscription configuration, and delivery records
 * for outbound webhook notifications on lifecycle events.
 */

export type EventType =
  | 'conversation.started'
  | 'conversation.ended'
  | 'message.created'
  | 'tool.called'
  | 'tool.completed'
  | 'tool.failed'
  | 'memory.created'
  | 'memory.deleted'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'classification.created'
  | 'dlp.blocked'
  | 'dlp.warned';

export const ALL_EVENT_TYPES: EventType[] = [
  'conversation.started',
  'conversation.ended',
  'message.created',
  'tool.called',
  'tool.completed',
  'tool.failed',
  'memory.created',
  'memory.deleted',
  'workflow.started',
  'workflow.completed',
  'workflow.failed',
  'classification.created',
  'dlp.blocked',
  'dlp.warned',
];

export interface EventPayload {
  id: string;
  type: EventType;
  timestamp: number;
  tenantId: string;
  data: Record<string, unknown>;
}

export interface EventSubscription {
  id: string;
  name: string;
  eventTypes: EventType[];
  webhookUrl: string;
  secret: string | null;
  enabled: boolean;
  headers: Record<string, string>;
  retryPolicy: { maxRetries: number; backoffMs: number };
  createdAt: number;
  updatedAt: number | null;
  tenantId: string;
}

export interface EventDelivery {
  id: string;
  subscriptionId: string;
  eventType: EventType;
  payload: EventPayload;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  createdAt: number;
  tenantId: string;
}
