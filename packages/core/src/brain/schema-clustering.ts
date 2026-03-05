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
 * STATUS: Scaffold — types and interface defined, implementation pending.
 */

import type { AIProvider } from '../ai/providers/base.js';
import type { EmbeddingProvider } from '../ai/embeddings/types.js';
import type { BrainStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';

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

/**
 * SchemaClusteringManager — Placeholder for periodic schema discovery.
 *
 * Will run on a schedule to cluster embeddings, generate schema labels
 * via LLM, and upsert schema knowledge entries.
 */
export class SchemaClusteringManager {
  private readonly config: SchemaClusteringConfig;
  private readonly deps: SchemaClusteringDeps;
  private schemas: Schema[] = [];

  constructor(config: Partial<SchemaClusteringConfig>, deps: SchemaClusteringDeps) {
    this.config = { ...DEFAULT_SCHEMA_CLUSTERING_CONFIG, ...config };
    this.deps = deps;
  }

  /**
   * Run a clustering cycle.
   *
   * TODO: Implement full pipeline:
   * 1. Export all embeddings from vector store
   * 2. Run kMeans
   * 3. Filter clusters by minClusterSize
   * 4. Label clusters via LLM (or keyword extraction)
   * 5. Upsert schema knowledge entries
   */
  async runClustering(): Promise<Schema[]> {
    if (!this.config.enabled) return [];
    // Future implementation
    return this.schemas;
  }

  getSchemas(): Schema[] {
    return [...this.schemas];
  }

  start(): void {
    // Future: schedule periodic clustering
  }

  stop(): void {
    // Future: clear scheduler
  }
}
