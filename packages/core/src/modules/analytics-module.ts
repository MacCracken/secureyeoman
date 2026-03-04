/**
 * AnalyticsModule — owns conversation analytics storages and background workers.
 *
 * Extracted from SecureYeoman Step 6m.
 */

import { BaseModule } from './types.js';
import { AnalyticsStorage } from '../analytics/analytics-storage.js';
import { SentimentAnalyzer } from '../analytics/sentiment-analyzer.js';
import { ConversationSummarizer } from '../analytics/conversation-summarizer.js';
import { EntityExtractor } from '../analytics/entity-extractor.js';
import { EngagementMetricsService } from '../analytics/engagement-metrics.js';
import { UsageAnomalyDetector } from '../analytics/usage-anomaly-detector.js';
import { getPool } from '../storage/pg-pool.js';
import type { AIClient } from '../ai/client.js';

export interface AnalyticsModuleDeps {
  aiClient?: AIClient | null;
}

export class AnalyticsModule extends BaseModule {
  private analyticsStorage: AnalyticsStorage | null = null;
  private sentimentAnalyzer: SentimentAnalyzer | null = null;
  private conversationSummarizer: ConversationSummarizer | null = null;
  private entityExtractor: EntityExtractor | null = null;
  private engagementMetricsService: EngagementMetricsService | null = null;
  private usageAnomalyDetector: UsageAnomalyDetector | null = null;

  constructor(private readonly deps: AnalyticsModuleDeps) {
    super();
  }

  protected async doInit(): Promise<void> {
    const pool = getPool();
    this.analyticsStorage = new AnalyticsStorage(pool);
    this.engagementMetricsService = new EngagementMetricsService(pool);
    this.usageAnomalyDetector = new UsageAnomalyDetector(
      this.analyticsStorage,
      this.logger.child({ component: 'UsageAnomalyDetector' })
    );
    if (this.deps.aiClient) {
      this.sentimentAnalyzer = new SentimentAnalyzer(
        pool,
        this.deps.aiClient,
        this.analyticsStorage,
        this.logger.child({ component: 'SentimentAnalyzer' })
      );
      this.conversationSummarizer = new ConversationSummarizer(
        pool,
        this.deps.aiClient,
        this.analyticsStorage,
        this.logger.child({ component: 'ConversationSummarizer' })
      );
      this.entityExtractor = new EntityExtractor(
        pool,
        this.deps.aiClient,
        this.analyticsStorage,
        this.logger.child({ component: 'EntityExtractor' })
      );
      this.sentimentAnalyzer.start();
      this.conversationSummarizer.start();
      this.entityExtractor.start();
    }
    this.logger.debug('Conversation Analytics initialized');
  }

  async cleanup(): Promise<void> {
    if (this.sentimentAnalyzer) {
      this.sentimentAnalyzer.stop();
      this.sentimentAnalyzer = null;
    }
    if (this.conversationSummarizer) {
      this.conversationSummarizer.stop();
      this.conversationSummarizer = null;
    }
    if (this.entityExtractor) {
      this.entityExtractor.stop();
      this.entityExtractor = null;
    }
    if (this.analyticsStorage) {
      this.analyticsStorage.close();
      this.analyticsStorage = null;
    }
    this.engagementMetricsService = null;
    this.usageAnomalyDetector = null;
  }

  getAnalyticsStorage(): AnalyticsStorage | null { return this.analyticsStorage; }
  getSentimentAnalyzer(): SentimentAnalyzer | null { return this.sentimentAnalyzer; }
  getConversationSummarizer(): ConversationSummarizer | null { return this.conversationSummarizer; }
  getEntityExtractor(): EntityExtractor | null { return this.entityExtractor; }
  getEngagementMetricsService(): EngagementMetricsService | null { return this.engagementMetricsService; }
  getUsageAnomalyDetector(): UsageAnomalyDetector | null { return this.usageAnomalyDetector; }
}
