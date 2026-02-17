/**
 * Extension Lifecycle Hooks Types (Phase 6.4a)
 */

export type HookPoint =
  | 'system:startup'
  | 'system:shutdown'
  | 'system:error'
  | 'task:before-create'
  | 'task:after-create'
  | 'task:before-execute'
  | 'task:after-execute'
  | 'task:on-error'
  | 'memory:before-store'
  | 'memory:after-store'
  | 'memory:before-recall'
  | 'memory:after-recall'
  | 'message:before-send'
  | 'message:after-send'
  | 'message:before-receive'
  | 'message:after-receive'
  | 'ai:before-request'
  | 'ai:after-response'
  | 'ai:on-error'
  | 'security:auth-success'
  | 'security:auth-failure'
  | 'security:rate-limited'
  | 'agent:before-delegate'
  | 'agent:after-delegate'
  | 'proactive:trigger-fired'
  | 'proactive:action-executed'
  | 'proactive:suggestion-approved'
  | 'proactive:suggestion-dismissed'
  | 'multimodal:image-analyzed'
  | 'multimodal:audio-transcribed'
  | 'multimodal:speech-generated'
  | 'multimodal:image-generated';

export type HookSemantics = 'observe' | 'transform' | 'veto';

export type HookHandler = (context: HookContext) => Promise<HookResult>;

export interface HookRegistration {
  id: string;
  hookPoint: HookPoint;
  extensionId: string;
  handler: HookHandler;
  priority: number;
  semantics: HookSemantics;
}

export interface HookContext {
  event: string;
  data: unknown;
  timestamp: number;
}

export interface HookResult {
  vetoed: boolean;
  transformed?: unknown;
  errors: string[];
}

export interface WebhookConfig {
  id: string;
  url: string;
  hookPoints: HookPoint[];
  secret?: string;
  enabled: boolean;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  hooks: {
    point: HookPoint;
    semantics: HookSemantics;
    priority?: number;
  }[];
}
