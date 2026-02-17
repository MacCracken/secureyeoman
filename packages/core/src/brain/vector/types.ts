/**
 * Vector Store Types
 *
 * Interface for vector storage backends (FAISS, Qdrant).
 */

export interface VectorResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorStore {
  /** Insert a single vector with associated ID and optional metadata. */
  insert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void>;

  /** Insert multiple vectors in batch. */
  insertBatch(items: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>): Promise<void>;

  /** Search for nearest neighbors. Returns results sorted by descending similarity. */
  search(vector: number[], limit: number, threshold?: number): Promise<VectorResult[]>;

  /** Delete a vector by ID. */
  delete(id: string): Promise<boolean>;

  /** Get the number of stored vectors. */
  count(): Promise<number>;

  /** Shut down and release resources. */
  close(): Promise<void>;
}
