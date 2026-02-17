/**
 * Embedding Provider Types
 *
 * Interface for text embedding providers used by the vector memory system.
 */

export interface EmbeddingProvider {
  /** Generate embeddings for one or more text inputs. */
  embed(texts: string[]): Promise<number[][]>;

  /** The dimensionality of the embedding vectors produced. */
  dimensions(): number;

  /** Provider name for logging. */
  readonly name: string;
}
