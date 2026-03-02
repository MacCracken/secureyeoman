/**
 * BranchingManager — Conversation branching and replay orchestration (Phase 99).
 *
 * Supports fork-from-message, branch tree visualization, single and batch
 * replay with different models, and pairwise comparison.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type { AIClient } from '../ai/client.js';
import type { ConversationStorage, Conversation, ConversationMessage } from './conversation-storage.js';
import type { BranchTreeNode, ReplayJob, ReplayBatchReport, ReplayResult } from '@secureyeoman/shared';

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface BranchingManagerDeps {
  conversationStorage: ConversationStorage;
  pool: Pool;
  logger: SecureLogger;
  aiClient?: AIClient;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class BranchingManager {
  private readonly storage: ConversationStorage;
  private readonly pool: Pool;
  private readonly logger: SecureLogger;
  private readonly aiClient?: AIClient;

  constructor(deps: BranchingManagerDeps) {
    this.storage = deps.conversationStorage;
    this.pool = deps.pool;
    this.logger = deps.logger;
    this.aiClient = deps.aiClient;
  }

  // ── Branch Operations ─────────────────────────────────────────────────────

  async branchFromMessage(
    sourceId: string,
    messageIndex: number,
    opts?: { title?: string; branchLabel?: string }
  ): Promise<Conversation> {
    this.logger.info('Creating branch from message', { sourceId, messageIndex });
    return this.storage.branchFromMessage(sourceId, messageIndex, opts);
  }

  async getBranchTree(conversationId: string): Promise<BranchTreeNode> {
    // Walk to root first, then build tree from there
    const root = await this.storage.getRootConversation(conversationId);
    return this.storage.getBranchTree(root.id);
  }

  async getChildBranches(conversationId: string): Promise<Conversation[]> {
    return this.storage.getChildBranches(conversationId);
  }

  // ── Single Replay ─────────────────────────────────────────────────────────

  async replayConversation(
    sourceId: string,
    config: { model: string; provider: string; personalityId?: string }
  ): Promise<{ replayConversationId: string; replayJobId: string }> {
    const source = await this.storage.getConversation(sourceId);
    if (!source) throw new Error(`Conversation not found: ${sourceId}`);

    const messages = await this.storage.getMessages(sourceId);
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) throw new Error('No user messages to replay');

    // Create the branch conversation
    const branch = await this.storage.createConversation({
      title: `Replay: ${source.title} [${config.model}]`,
      personalityId: config.personalityId ?? source.personalityId,
      parentConversationId: sourceId,
      forkMessageIndex: 0,
      branchLabel: `replay:${config.model}`,
    });

    // Create a replay job
    const job = await this.storage.createReplayJob({
      sourceConversationIds: [sourceId],
      replayModel: config.model,
      replayProvider: config.provider,
      replayPersonalityId: config.personalityId,
    });

    // Kick off async replay
    setImmediate(() => {
      void this._runReplay(job.id, sourceId, branch.id, userMessages, config).catch((err) => {
        this.logger.error('Replay failed', { jobId: job.id, error: String(err) });
      });
    });

    return { replayConversationId: branch.id, replayJobId: job.id };
  }

  // ── Batch Replay ──────────────────────────────────────────────────────────

  async replayBatch(config: {
    sourceConversationIds: string[];
    replayModel: string;
    replayProvider: string;
    replayPersonalityId?: string;
  }): Promise<ReplayJob> {
    if (config.sourceConversationIds.length === 0) {
      throw new Error('At least one source conversation is required');
    }

    const job = await this.storage.createReplayJob({
      sourceConversationIds: config.sourceConversationIds,
      replayModel: config.replayModel,
      replayProvider: config.replayProvider,
      replayPersonalityId: config.replayPersonalityId,
    });

    setImmediate(() => {
      void this._runBatchReplay(job.id, config).catch((err) => {
        this.logger.error('Batch replay failed', { jobId: job.id, error: String(err) });
      });
    });

    return job;
  }

  // ── Replay Report ─────────────────────────────────────────────────────────

  async getReplayJob(jobId: string): Promise<ReplayJob | null> {
    return this.storage.getReplayJob(jobId);
  }

  async listReplayJobs(): Promise<ReplayJob[]> {
    return this.storage.listReplayJobs();
  }

  async getReplayReport(jobId: string): Promise<ReplayBatchReport> {
    const job = await this.storage.getReplayJob(jobId);
    if (!job) throw new Error(`Replay job not found: ${jobId}`);

    const results = await this.storage.getReplayResults(jobId);
    const summary = this._buildSummary(results);

    return { job, results, summary };
  }

  // ── Private Replay Logic ──────────────────────────────────────────────────

  private async _runReplay(
    jobId: string,
    sourceId: string,
    branchId: string,
    userMessages: ConversationMessage[],
    config: { model: string; provider: string }
  ): Promise<void> {
    await this.storage.updateReplayJob(jobId, { status: 'running' });

    try {
      const history: { role: 'user' | 'assistant'; content: string }[] = [];

      for (const msg of userMessages) {
        // Add user message to history and branch conversation
        history.push({ role: 'user', content: msg.content });
        await this.storage.addMessage({
          conversationId: branchId,
          role: 'user',
          content: msg.content,
        });

        // Generate assistant response if AI client available
        if (this.aiClient) {
          try {
            const response = await this.aiClient.chat({
              messages: history.map((m) => ({ role: m.role, content: m.content })),
              model: config.model,
              stream: false,
            });

            const assistantContent = response.content ?? '';
            history.push({ role: 'assistant', content: assistantContent });

            await this.storage.addMessage({
              conversationId: branchId,
              role: 'assistant',
              content: assistantContent,
              model: config.model,
              provider: config.provider,
            });
          } catch (err) {
            this.logger.warn('Replay turn failed, continuing', {
              jobId,
              error: String(err),
            });
            // Add a placeholder so history stays aligned
            history.push({ role: 'assistant', content: '[replay error]' });
            await this.storage.addMessage({
              conversationId: branchId,
              role: 'assistant',
              content: '[replay error]',
              model: config.model,
              provider: config.provider,
            });
          }
        }
      }

      // Score and compare
      const sourceQuality = await this._getQualityScore(sourceId);
      const replayQuality = await this._getQualityScore(branchId);

      // Determine pairwise winner from quality scores
      let pairwiseWinner: 'source' | 'replay' | 'tie' | null = null;
      let pairwiseReason: string | null = null;
      if (sourceQuality != null && replayQuality != null) {
        const diff = replayQuality - sourceQuality;
        if (Math.abs(diff) < 0.05) {
          pairwiseWinner = 'tie';
          pairwiseReason = 'Quality scores within 0.05 tolerance';
        } else if (diff > 0) {
          pairwiseWinner = 'replay';
          pairwiseReason = `Replay scored ${diff.toFixed(3)} higher`;
        } else {
          pairwiseWinner = 'source';
          pairwiseReason = `Source scored ${(-diff).toFixed(3)} higher`;
        }
      }

      await this.storage.createReplayResult({
        replayJobId: jobId,
        sourceConversationId: sourceId,
        replayConversationId: branchId,
        sourceModel: null, // Could be mixed models in source
        replayModel: config.model,
        sourceQualityScore: sourceQuality,
        replayQualityScore: replayQuality,
        pairwiseWinner,
        pairwiseReason,
      });

      await this.storage.updateReplayJob(jobId, {
        status: 'completed',
        completedConversations: 1,
      });
    } catch (err) {
      await this.storage.updateReplayJob(jobId, {
        status: 'failed',
        failedConversations: 1,
        errorMessage: String(err),
      });
    }
  }

  private async _runBatchReplay(
    jobId: string,
    config: {
      sourceConversationIds: string[];
      replayModel: string;
      replayProvider: string;
      replayPersonalityId?: string;
    }
  ): Promise<void> {
    await this.storage.updateReplayJob(jobId, { status: 'running' });

    let completed = 0;
    let failed = 0;

    for (const sourceId of config.sourceConversationIds) {
      try {
        const source = await this.storage.getConversation(sourceId);
        if (!source) {
          failed++;
          continue;
        }

        const messages = await this.storage.getMessages(sourceId);
        const userMessages = messages.filter((m) => m.role === 'user');
        if (userMessages.length === 0) {
          failed++;
          continue;
        }

        const branch = await this.storage.createConversation({
          title: `Replay: ${source.title} [${config.replayModel}]`,
          personalityId: config.replayPersonalityId ?? source.personalityId,
          parentConversationId: sourceId,
          forkMessageIndex: 0,
          branchLabel: `batch-replay:${config.replayModel}`,
        });

        await this._runReplayInline(
          jobId,
          sourceId,
          branch.id,
          userMessages,
          config
        );

        completed++;
      } catch (err) {
        this.logger.warn('Batch replay item failed', {
          jobId,
          sourceId,
          error: String(err),
        });
        failed++;
      }

      await this.storage.updateReplayJob(jobId, {
        completedConversations: completed,
        failedConversations: failed,
      });
    }

    const finalStatus = failed === config.sourceConversationIds.length ? 'failed' : 'completed';
    await this.storage.updateReplayJob(jobId, { status: finalStatus });
  }

  /** Inline replay (no separate job update — caller tracks progress) */
  private async _runReplayInline(
    jobId: string,
    sourceId: string,
    branchId: string,
    userMessages: ConversationMessage[],
    config: { replayModel: string; replayProvider: string }
  ): Promise<void> {
    const history: { role: 'user' | 'assistant'; content: string }[] = [];

    for (const msg of userMessages) {
      history.push({ role: 'user', content: msg.content });
      await this.storage.addMessage({
        conversationId: branchId,
        role: 'user',
        content: msg.content,
      });

      if (this.aiClient) {
        try {
          const response = await this.aiClient.chat({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            model: config.replayModel,
            stream: false,
          });

          const assistantContent = response.content ?? '';
          history.push({ role: 'assistant', content: assistantContent });

          await this.storage.addMessage({
            conversationId: branchId,
            role: 'assistant',
            content: assistantContent,
            model: config.replayModel,
            provider: config.replayProvider,
          });
        } catch {
          history.push({ role: 'assistant', content: '[replay error]' });
          await this.storage.addMessage({
            conversationId: branchId,
            role: 'assistant',
            content: '[replay error]',
            model: config.replayModel,
            provider: config.replayProvider,
          });
        }
      }
    }

    const sourceQuality = await this._getQualityScore(sourceId);
    const replayQuality = await this._getQualityScore(branchId);

    let pairwiseWinner: 'source' | 'replay' | 'tie' | null = null;
    let pairwiseReason: string | null = null;
    if (sourceQuality != null && replayQuality != null) {
      const diff = replayQuality - sourceQuality;
      if (Math.abs(diff) < 0.05) {
        pairwiseWinner = 'tie';
        pairwiseReason = 'Quality scores within 0.05 tolerance';
      } else if (diff > 0) {
        pairwiseWinner = 'replay';
        pairwiseReason = `Replay scored ${diff.toFixed(3)} higher`;
      } else {
        pairwiseWinner = 'source';
        pairwiseReason = `Source scored ${(-diff).toFixed(3)} higher`;
      }
    }

    await this.storage.createReplayResult({
      replayJobId: jobId,
      sourceConversationId: sourceId,
      replayConversationId: branchId,
      replayModel: config.replayModel,
      sourceQualityScore: sourceQuality,
      replayQualityScore: replayQuality,
      pairwiseWinner,
      pairwiseReason,
    });
  }

  private async _getQualityScore(conversationId: string): Promise<number | null> {
    try {
      const result = await this.pool.query<{ quality_score: number }>(
        'SELECT quality_score FROM training.conversation_quality WHERE conversation_id = $1 LIMIT 1',
        [conversationId]
      );
      return result.rows[0]?.quality_score ?? null;
    } catch {
      return null;
    }
  }

  private _buildSummary(results: ReplayResult[]): {
    sourceWins: number;
    replayWins: number;
    ties: number;
    avgSourceQuality: number | null;
    avgReplayQuality: number | null;
  } {
    let sourceWins = 0;
    let replayWins = 0;
    let ties = 0;
    let sourceQualitySum = 0;
    let sourceQualityCount = 0;
    let replayQualitySum = 0;
    let replayQualityCount = 0;

    for (const r of results) {
      if (r.pairwiseWinner === 'source') sourceWins++;
      else if (r.pairwiseWinner === 'replay') replayWins++;
      else if (r.pairwiseWinner === 'tie') ties++;

      if (r.sourceQualityScore != null) {
        sourceQualitySum += r.sourceQualityScore;
        sourceQualityCount++;
      }
      if (r.replayQualityScore != null) {
        replayQualitySum += r.replayQualityScore;
        replayQualityCount++;
      }
    }

    return {
      sourceWins,
      replayWins,
      ties,
      avgSourceQuality: sourceQualityCount > 0 ? sourceQualitySum / sourceQualityCount : null,
      avgReplayQuality: replayQualityCount > 0 ? replayQualitySum / replayQualityCount : null,
    };
  }
}
