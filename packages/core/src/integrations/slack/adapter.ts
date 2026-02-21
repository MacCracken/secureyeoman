/**
 * SlackIntegration — Slack adapter using @slack/bolt.
 *
 * Uses socket mode (no public URL needed).
 * Normalizes inbound messages to UnifiedMessage with `sl_` prefix.
 * Supports Block Kit button actions, modal dialogs, and Workflow Builder steps.
 */

import { App, WorkflowStep } from '@slack/bolt';
import type { IntegrationConfig, UnifiedMessage, Platform } from '@secureyeoman/shared';
import type { Integration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

export class SlackIntegration implements Integration {
  readonly platform: Platform = 'slack';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 1 };

  private app: App | null = null;
  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const botToken = config.config.botToken as string | undefined;
    const appToken = config.config.appToken as string | undefined;

    if (!botToken) {
      throw new Error('Slack integration requires a botToken in config');
    }
    if (!appToken) {
      throw new Error('Slack integration requires an appToken in config (for socket mode)');
    }

    this.app = new App({
      token: botToken,
      appToken: appToken,
      socketMode: true,
      signingSecret: config.config.signingSecret as string | undefined,
    });

    // Listen for regular messages
    this.app.message(async ({ message }) => {
      const msg = message as Record<string, any>;
      if (msg.subtype) return; // skip edited, deleted, etc.

      const files = (msg.files ?? []) as Record<string, any>[];
      // Allow messages with file attachments through even if text is empty
      if (!msg.text && files.length === 0) return;

      const unified: UnifiedMessage = {
        id: `sl_${msg.ts}`,
        integrationId: config.id,
        platform: 'slack',
        direction: 'inbound',
        senderId: String(msg.user ?? ''),
        senderName: String(msg.user ?? 'Unknown'),
        chatId: String(msg.channel),
        text: String(msg.text ?? ''),
        attachments: files.map((f: Record<string, any>) => ({
          type: 'file' as const,
          url: f.url_private ?? undefined,
          fileName: f.name ?? undefined,
          mimeType: f.mimetype ?? undefined,
          size: f.size ?? undefined,
        })),
        replyToMessageId: msg.thread_ts ?? undefined,
        platformMessageId: String(msg.ts),
        metadata: {
          threadTs: msg.thread_ts,
          channelType: msg.channel_type,
        },
        timestamp: parseFloat(msg.ts) * 1000,
      };

      // Vision processing for image attachments
      const mmManager = this.deps?.multimodalManager;
      if (mmManager) {
        for (const att of unified.attachments ?? []) {
          if (att.mimeType?.startsWith('image/') && att.url) {
            try {
              const resp = await fetch(att.url, {
                headers: { Authorization: `Bearer ${config.config.botToken as string}` },
              });
              const buf = Buffer.from(await resp.arrayBuffer());
              const result = await mmManager.analyzeImage({
                imageBase64: buf.toString('base64'),
                mimeType: att.mimeType,
              });
              unified.text = `[Image: ${result.description}]\n${unified.text}`;
            } catch {
              /* non-fatal */
            }
          }
        }
      }

      void this.deps!.onMessage(unified);
    });

    // Listen for app_mention events (when bot is @mentioned)
    this.app.event('app_mention', async ({ event }) => {
      const unified: UnifiedMessage = {
        id: `sl_${event.ts}`,
        integrationId: config.id,
        platform: 'slack',
        direction: 'inbound',
        senderId: event.user ?? '',
        senderName: event.user ?? 'Unknown',
        chatId: event.channel,
        text: event.text,
        attachments: [],
        replyToMessageId: event.thread_ts ?? undefined,
        platformMessageId: event.ts,
        metadata: {
          isMention: true,
          threadTs: event.thread_ts,
        },
        timestamp: parseFloat(event.ts) * 1000,
      };

      void this.deps!.onMessage(unified);
    });

    // Block Kit action handler (matches all action IDs via regex)
    this.app.action(/.*/, async ({ action, ack, body }) => {
      await ack();

      const act = action as Record<string, any>;
      const bodyRec = body as Record<string, any>;

      const unified: UnifiedMessage = {
        id: `sl_action_${Date.now()}`,
        integrationId: config.id,
        platform: 'slack',
        direction: 'inbound',
        senderId: String(bodyRec.user?.id ?? ''),
        senderName: String(bodyRec.user?.name ?? 'Unknown'),
        chatId: String(bodyRec.channel?.id ?? bodyRec.container?.channel_id ?? ''),
        text: String(act.value ?? act.action_id ?? ''),
        attachments: [],
        platformMessageId: String(act.action_id ?? Date.now()),
        metadata: {
          isBlockAction: true,
          actionId: act.action_id,
          blockId: act.block_id,
          value: act.value,
        },
        timestamp: Date.now(),
      };

      void this.deps!.onMessage(unified);
    });

    // Slash command: /friday
    this.app.command('/friday', async ({ command, ack }) => {
      await ack();

      const unified: UnifiedMessage = {
        id: `sl_cmd_${Date.now()}`,
        integrationId: config.id,
        platform: 'slack',
        direction: 'inbound',
        senderId: command.user_id,
        senderName: command.user_name,
        chatId: command.channel_id,
        text: command.text || '/friday',
        attachments: [],
        platformMessageId: command.trigger_id,
        metadata: {
          isSlashCommand: true,
          commandName: '/friday',
        },
        timestamp: Date.now(),
      };

      void this.deps!.onMessage(unified);
    });

    // Slash command: /friday-status
    this.app.command('/friday-status', async ({ command, ack, respond }) => {
      await ack();
      await respond({
        text: `Agent: ${config.displayName}\nPlatform: Slack\nStatus: Connected`,
      });
    });

    // Slash command: /friday-modal — opens a modal dialog
    this.app.command('/friday-modal', async ({ command, ack, client }) => {
      await ack();

      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'friday_modal',
          title: { type: 'plain_text', text: 'FRIDAY' },
          submit: { type: 'plain_text', text: 'Submit' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: 'task_block',
              element: {
                type: 'plain_text_input',
                action_id: 'task_input',
                multiline: true,
                placeholder: { type: 'plain_text', text: 'Describe your task...' },
              },
              label: { type: 'plain_text', text: 'Task' },
            },
          ],
        },
      });
    });

    // Modal view submission: friday_modal
    this.app.view('friday_modal', async ({ ack, view, body }) => {
      await ack();

      const taskText = (view.state.values as any)?.task_block?.task_input?.value ?? '';
      const user = (body as any).user as Record<string, any>;

      const unified: UnifiedMessage = {
        id: `sl_modal_${Date.now()}`,
        integrationId: config.id,
        platform: 'slack',
        direction: 'inbound',
        senderId: String(user?.id ?? ''),
        senderName: String(user?.name ?? 'Unknown'),
        chatId: String((body as any).view?.root_view_id ?? ''),
        text: taskText,
        attachments: [],
        platformMessageId: view.id,
        metadata: {
          isModalSubmit: true,
          modalCallbackId: view.callback_id,
        },
        timestamp: Date.now(),
      };

      void this.deps!.onMessage(unified);
    });

    // Workflow step: friday_process
    const ws = new WorkflowStep('friday_process', {
      edit: async ({ ack, step, configure }) => {
        await ack();
        await configure({
          blocks: [
            {
              type: 'input',
              block_id: 'task_block',
              element: {
                type: 'plain_text_input',
                action_id: 'task_input',
                placeholder: { type: 'plain_text', text: 'Task to process...' },
              },
              label: { type: 'plain_text', text: 'Task' },
            },
          ],
        });
      },
      save: async ({ ack, step, view, update }) => {
        await ack();
        const taskText = (view.state.values as any)?.task_block?.task_input?.value ?? '';
        await update({ inputs: { task: { value: taskText } }, outputs: [] });
      },
      execute: async ({ step, complete, fail }) => {
        const taskText = String((step.inputs as any)?.task?.value ?? '');

        const unified: UnifiedMessage = {
          id: `sl_wf_${Date.now()}`,
          integrationId: config.id,
          platform: 'slack',
          direction: 'inbound',
          senderId: 'workflow',
          senderName: 'Workflow',
          chatId: 'workflow',
          text: taskText,
          attachments: [],
          platformMessageId: `wf_${Date.now()}`,
          metadata: {
            isWorkflowStep: true,
            workflowStepId: 'friday_process',
          },
          timestamp: Date.now(),
        };

        try {
          await this.deps!.onMessage(unified);
          await complete({ outputs: {} });
        } catch (err) {
          await fail({ error: { message: err instanceof Error ? err.message : String(err) } });
        }
      },
    });

    this.app.step(ws);

    this.logger?.info('Slack integration initialized');
  }

  async start(): Promise<void> {
    if (!this.app) throw new Error('Integration not initialized');
    if (this.running) return;

    await this.app.start();
    this.running = true;
    this.logger?.info('Slack bot connected (socket mode)');
  }

  async stop(): Promise<void> {
    if (!this.app || !this.running) return;
    this.running = false;
    await this.app.stop();
    this.logger?.info('Slack bot disconnected');
  }

  async sendMessage(
    chatId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.app) throw new Error('Integration not initialized');

    const threadTs = metadata?.threadTs as string | undefined;
    const blocks = metadata?.blocks as any[] | undefined;

    const result = await this.app.client.chat.postMessage({
      channel: chatId,
      text,
      ...(blocks ? { blocks } : {}),
      thread_ts: threadTs,
    });

    return result.ts ?? '';
  }

  isHealthy(): boolean {
    return this.running;
  }
}
