/**
 * Semantic Clustering / Schema Formation (Phase 125 — Future)
 *
 * Periodically clusters all memory embeddings to discover emergent topic
 * groups ("schemas"). Each cluster gets an LLM-generated label and summary
 * that becomes a first-class knowledge entry.
 *
 * Uses k-means over the vector store embeddings. Combined with LLM labeling,
 * this creates self-organizing knowledge the system discovers from its own
 * memories.
 *
 * STATUS: Implemented — Phase 141
 */

import type { AIProvider } from '../ai/providers/base.js';
import type { EmbeddingProvider } from '../ai/embeddings/types.js';
import type { BrainStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

export interface Schema {
  id: string;
  label: string;
  summary: string;
  memberIds: string[];
  centroid: number[];
  coherence: number;
  createdAt: number;
  updatedAt: number;
}

export interface SchemaClusteringConfig {
  enabled: boolean;
  /** Target number of clusters. Default 10 */
  k: number;
  /** Minimum cluster size to form a schema. Default 3 */
  minClusterSize: number;
  /** Maximum k-means iterations. Default 50 */
  maxIterations: number;
  /** Schedule for clustering runs (cron). Default daily at 3 AM */
  schedule: string;
  /** Whether to use LLM for labeling (vs simple keyword extraction). Default true */
  useLlmLabeling: boolean;
}

export const DEFAULT_SCHEMA_CLUSTERING_CONFIG: SchemaClusteringConfig = {
  enabled: false,
  k: 10,
  minClusterSize: 3,
  maxIterations: 50,
  schedule: '0 3 * * *',
  useLlmLabeling: true,
};

export interface SchemaClusteringDeps {
  embeddingProvider: EmbeddingProvider;
  aiProvider?: AIProvider;
  storage: BrainStorage;
  logger: SecureLogger;
}

/**
 * K-Means clustering over embedding vectors.
 * Pure function — no I/O dependencies.
 *
 * @returns Array of cluster assignments (index into centroids) for each point.
 */
export function kMeans(
  points: number[][],
  k: number,
  maxIterations: number
): { assignments: number[]; centroids: number[][] } {
  if (points.length === 0 || k <= 0) {
    return { assignments: [], centroids: [] };
  }

  const n = points.length;
  const dim = points[0]!.length;
  const effectiveK = Math.min(k, n);

  // Initialize centroids with k-means++ seeding
  const centroids: number[][] = [];
  const usedIndices = new Set<number>();

  // First centroid: random
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...points[firstIdx]!]);
  usedIndices.add(firstIdx);

  // Remaining centroids: proportional to squared distance
  for (let c = 1; c < effectiveK; c++) {
    const distances = points.map((p, i) => {
      if (usedIndices.has(i)) return 0;
      let minDist = Infinity;
      for (const centroid of centroids) {
        let dist = 0;
        for (let d = 0; d < dim; d++) {
          const diff = p[d]! - centroid[d]!;
          dist += diff * diff;
        }
        minDist = Math.min(minDist, dist);
      }
      return minDist;
    });

    const totalDist = distances.reduce((a, b) => a + b, 0);
    if (totalDist === 0) break;

    let target = Math.random() * totalDist;
    let selectedIdx = 0;
    for (let i = 0; i < n; i++) {
      target -= distances[i]!;
      if (target <= 0) {
        selectedIdx = i;
        break;
      }
    }

    centroids.push([...points[selectedIdx]!]);
    usedIndices.add(selectedIdx);
  }

  // Iterative assignment + update
  let assignments = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest centroid
    const newAssignments = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        let dist = 0;
        for (let d = 0; d < dim; d++) {
          const diff = points[i]![d]! - centroids[c]![d]!;
          dist += diff * diff;
        }
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }
      newAssignments[i] = bestCluster;
    }

    // Check convergence
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (newAssignments[i] !== assignments[i]) {
        changed = true;
        break;
      }
    }
    assignments = newAssignments;
    if (!changed) break;

    // Update centroids
    for (let c = 0; c < centroids.length; c++) {
      const members = [];
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) members.push(points[i]!);
      }
      if (members.length === 0) continue;

      for (let d = 0; d < dim; d++) {
        centroids[c]![d] = members.reduce((s, m) => s + m[d]!, 0) / members.length;
      }
    }
  }

  return { assignments, centroids };
}

const LABEL_PROMPT = `You are labeling a cluster of related text items. Below are representative samples from the cluster.

Samples:
{samples}

Provide a concise label (3-6 words) and a one-sentence summary of the common theme.

Respond with JSON only:
{
  "label": "...",
  "summary": "..."
}`;

/**
 * SchemaClusteringManager — Periodic schema discovery via k-means clustering.
 *
 * Clusters memory/knowledge embeddings, filters by size, labels via LLM,
 * and upserts schema knowledge entries.
 */
export class SchemaClusteringManager {
  private readonly config: SchemaClusteringConfig;
  private readonly deps: SchemaClusteringDeps;
  private schemas: Schema[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<SchemaClusteringConfig>, deps: SchemaClusteringDeps) {
    this.config = { ...DEFAULT_SCHEMA_CLUSTERING_CONFIG, ...config };
    this.deps = deps;
  }

  /**
   * Run a full clustering cycle:
   * 1. Export all knowledge entries + embeddings
   * 2. Run kMeans
   * 3. Filter clusters by minClusterSize
   * 4. Label clusters via LLM or keyword extraction
   * 5. Upsert schema knowledge entries
   */
  async runClustering(): Promise<Schema[]> {
    if (!this.config.enabled) return [];

    const entries = await this.deps.storage.queryKnowledge({ limit: 5000 });
    if (entries.length < this.config.minClusterSize) {
      this.deps.logger.debug({ count: entries.length }, 'Not enough entries for clustering');
      return this.schemas;
    }

    // Get embeddings for all entries
    const texts = entries.map((e) => `${e.topic}: ${e.content}`);
    const embeddings = await this.deps.embeddingProvider.embed(texts);

    if (embeddings.length !== entries.length) {
      this.deps.logger.warn(
        {
          entries: entries.length,
          embeddings: embeddings.length,
        },
        'Embedding count mismatch'
      );
      return this.schemas;
    }

    // Run k-means
    const { assignments, centroids } = kMeans(embeddings, this.config.k, this.config.maxIterations);

    // Group entries by cluster
    const clusters = new Map<number, { entryIds: string[]; texts: string[]; indices: number[] }>();
    for (let i = 0; i < assignments.length; i++) {
      const cluster = assignments[i]!;
      if (!clusters.has(cluster)) {
        clusters.set(cluster, { entryIds: [], texts: [], indices: [] });
      }
      const c = clusters.get(cluster)!;
      c.entryIds.push(entries[i]!.id);
      c.texts.push(texts[i]!);
      c.indices.push(i);
    }

    // Filter by minClusterSize and label
    const now = Date.now();
    const newSchemas: Schema[] = [];

    for (const [clusterIdx, cluster] of clusters) {
      if (cluster.entryIds.length < this.config.minClusterSize) continue;

      const centroid = centroids[clusterIdx]!;
      const coherence = this.computeCoherence(embeddings, cluster.indices, centroid);

      // Sample up to 5 texts for labeling
      const samples = cluster.texts.slice(0, 5);
      const { label, summary } = await this.labelCluster(samples);

      const schema: Schema = {
        id: uuidv7(),
        label,
        summary,
        memberIds: cluster.entryIds,
        centroid,
        coherence,
        createdAt: now,
        updatedAt: now,
      };
      newSchemas.push(schema);

      // Persist as knowledge entry (create new; ignore if already exists)
      try {
        await this.deps.storage.createKnowledge({
          topic: `schema:${label}`,
          content: summary,
          source: 'schema-clustering',
          confidence: coherence,
        });
      } catch (err) {
        this.deps.logger.warn(
          {
            label,
            error: String(err),
          },
          'Failed to create schema knowledge'
        );
      }
    }

    this.schemas = newSchemas;
    this.deps.logger.info(
      {
        totalEntries: entries.length,
        clustersFormed: newSchemas.length,
      },
      'Schema clustering complete'
    );

    return newSchemas;
  }

  private async labelCluster(samples: string[]): Promise<{ label: string; summary: string }> {
    if (this.config.useLlmLabeling && this.deps.aiProvider) {
      try {
        const prompt = LABEL_PROMPT.replace(
          '{samples}',
          samples.map((s, i) => `${i + 1}. ${s.slice(0, 200)}`).join('\n')
        );
        const response = await this.deps.aiProvider.chat({
          messages: [{ role: 'user' as const, content: prompt }],
          temperature: 0,
          maxTokens: 200,
          stream: false,
        });
        const json = JSON.parse(response.content);
        return {
          label: String(json.label || 'Unlabeled'),
          summary: String(json.summary || 'No summary'),
        };
      } catch {
        // Fall through to keyword extraction
      }
    }

    // Keyword extraction fallback: most common words
    return this.extractKeywords(samples);
  }

  private extractKeywords(samples: string[]): { label: string; summary: string } {
    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'can',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'and',
      'or',
      'but',
      'not',
      'this',
      'that',
      'it',
      'its',
      'they',
      'them',
      'their',
      'we',
      'our',
    ]);

    for (const sample of samples) {
      const words = sample
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/);
      for (const word of words) {
        if (word.length > 2 && !stopWords.has(word)) {
          wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
        }
      }
    }

    const topWords = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w);

    const label = topWords.join(' ') || 'Unlabeled';
    const summary = `Cluster of ${samples.length} related entries about ${topWords.join(', ')}`;
    return { label, summary };
  }

  private computeCoherence(embeddings: number[][], indices: number[], centroid: number[]): number {
    if (indices.length === 0) return 0;

    let totalSim = 0;
    for (const idx of indices) {
      const emb = embeddings[idx]!;
      let dot = 0;
      let normA = 0;
      let normB = 0;
      for (let d = 0; d < emb.length; d++) {
        dot += emb[d]! * centroid[d]!;
        normA += emb[d]! * emb[d]!;
        normB += centroid[d]! * centroid[d]!;
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      totalSim += denom > 0 ? dot / denom : 0;
    }

    return totalSim / indices.length;
  }

  getSchemas(): Schema[] {
    return [...this.schemas];
  }

  start(): void {
    // Periodic clustering not started in unit context; caller schedules via cron
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
