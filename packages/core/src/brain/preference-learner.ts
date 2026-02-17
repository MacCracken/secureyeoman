/**
 * PreferenceLearner — Adaptive Learning Engine
 *
 * Learns from user feedback and conversation patterns to build a
 * preference profile. Stores preferences as 'preference' type memories
 * via BrainManager, and injects them into the system prompt.
 */

import type { BrainManager } from './manager.js';
import type { Memory } from './types.js';
import type { SecureLogger } from '../logging/logger.js';

export type FeedbackType = 'positive' | 'negative' | 'correction';

export interface FeedbackRecord {
  conversationId: string;
  messageId: string;
  feedback: FeedbackType;
  details?: string;
  timestamp: number;
}

export interface PreferenceSummary {
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  correctionCount: number;
  preferences: string[];
}

export class PreferenceLearner {
  private readonly brainManager: BrainManager;
  private readonly logger?: SecureLogger;

  constructor(brainManager: BrainManager, logger?: SecureLogger) {
    this.brainManager = brainManager;
    this.logger = logger;
  }

  /**
   * Record user feedback on a specific message.
   */
  async recordFeedback(
    conversationId: string,
    messageId: string,
    feedback: FeedbackType,
    details?: string,
  ): Promise<Memory> {
    const content = this.formatFeedbackContent(feedback, details);
    const context: Record<string, string> = {
      conversationId,
      messageId,
      feedbackType: feedback,
    };
    if (details) {
      context.details = details;
    }

    const importance = feedback === 'correction' ? 0.9 : feedback === 'negative' ? 0.7 : 0.5;

    const memory = await this.brainManager.remember(
      'preference',
      content,
      'user_feedback',
      context,
      importance,
    );

    this.logger?.info('Recorded user feedback', { conversationId, messageId, feedback });
    return memory;
  }

  /**
   * Analyze conversation patterns and extract preferences.
   */
  async learnFromConversation(
    messages: Array<{ role: string; content: string }>,
  ): Promise<string[]> {
    const patterns: string[] = [];

    // Analyze response length preferences
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    if (assistantMessages.length >= 3) {
      const avgLength =
        assistantMessages.reduce((sum, m) => sum + m.content.length, 0) / assistantMessages.length;

      if (avgLength < 200) {
        patterns.push('User prefers concise, brief responses');
      } else if (avgLength > 1000) {
        patterns.push('User prefers detailed, thorough responses');
      }
    }

    // Detect code-heavy conversations
    const codeBlockCount = messages.filter(
      (m) => m.content.includes('```') || m.content.includes('function') || m.content.includes('const '),
    ).length;
    if (codeBlockCount > messages.length * 0.4) {
      patterns.push('User frequently works with code');
    }

    // Store extracted patterns as preference memories
    for (const pattern of patterns) {
      try {
        await this.brainManager.remember(
          'preference',
          pattern,
          'conversation_analysis',
          {},
          0.6,
        );
      } catch {
        // Best effort — don't fail if storage is unavailable
      }
    }

    return patterns;
  }

  /**
   * Retrieve aggregated preference summary.
   */
  async getPreferences(userId?: string): Promise<PreferenceSummary> {
    const context = userId ? { userId } : undefined;
    const memories = await this.brainManager.recall({
      type: 'preference',
      limit: 50,
      context,
    });

    let positiveCount = 0;
    let negativeCount = 0;
    let correctionCount = 0;
    const preferences: string[] = [];

    for (const memory of memories) {
      const feedbackType = memory.context?.feedbackType;
      if (feedbackType === 'positive') positiveCount++;
      else if (feedbackType === 'negative') negativeCount++;
      else if (feedbackType === 'correction') correctionCount++;

      // Non-feedback preferences (from conversation analysis)
      if (!feedbackType) {
        preferences.push(memory.content);
      }
    }

    return {
      totalFeedback: positiveCount + negativeCount + correctionCount,
      positiveCount,
      negativeCount,
      correctionCount,
      preferences,
    };
  }

  /**
   * Inject learned preferences into a system prompt.
   * Returns the augmented prompt.
   */
  async injectPreferences(systemPrompt: string, userId?: string): Promise<string> {
    try {
      const summary = await this.getPreferences(userId);

      if (summary.preferences.length === 0 && summary.totalFeedback === 0) {
        return systemPrompt;
      }

      const lines: string[] = ['\n\n## Learned User Preferences'];

      if (summary.preferences.length > 0) {
        for (const pref of summary.preferences) {
          lines.push(`- ${pref}`);
        }
      }

      if (summary.totalFeedback > 0) {
        lines.push(
          `\nFeedback summary: ${summary.positiveCount} positive, ${summary.negativeCount} negative, ${summary.correctionCount} corrections.`,
        );
      }

      return systemPrompt + lines.join('\n');
    } catch {
      // If Brain is unavailable, return the original prompt
      return systemPrompt;
    }
  }

  private formatFeedbackContent(feedback: FeedbackType, details?: string): string {
    switch (feedback) {
      case 'positive':
        return details
          ? `User liked this response: ${details}`
          : 'User gave positive feedback on response';
      case 'negative':
        return details
          ? `User disliked this response: ${details}`
          : 'User gave negative feedback on response';
      case 'correction':
        return details
          ? `User corrected response: ${details}`
          : 'User provided a correction';
    }
  }
}
