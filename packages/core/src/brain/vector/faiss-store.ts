/**
 * FAISS Vector Store
 *
 * Uses faiss-node for local vector search with disk persistence.
 * Flat L2 index with cosine similarity via normalization.
 */

import type { VectorStore, VectorResult } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

interface SidecarData {
  idToIndex: Record<string, number>;
  indexToId: Record<number, string>;
  nextIndex: number;
}

export class FaissVectorStore implements VectorStore {
  private index: any = null;
  private readonly dimensions: number;
  private readonly persistDir: string;
  private sidecar: SidecarData = { idToIndex: {}, indexToId: {}, nextIndex: 0 };
  private faissModule: any = null;

  constructor(dimensions: number, persistDir: string) {
    this.dimensions = dimensions;
    this.persistDir = persistDir;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.index) return;

    try {
      this.faissModule = await import('faiss-node');
    } catch {
      throw new Error('faiss-node not installed. Install with: npm install faiss-node');
    }

    fs.mkdirSync(this.persistDir, { recursive: true });

    const indexPath = path.join(this.persistDir, 'index.faiss');
    const sidecarPath = path.join(this.persistDir, 'sidecar.json');

    if (fs.existsSync(indexPath) && fs.existsSync(sidecarPath)) {
      this.index = this.faissModule.IndexFlatL2.read(indexPath);
      this.sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    } else {
      this.index = new this.faissModule.IndexFlatL2(this.dimensions);
    }
  }

  private persist(): void {
    const indexPath = path.join(this.persistDir, 'index.faiss');
    const sidecarPath = path.join(this.persistDir, 'sidecar.json');

    this.index.write(indexPath);
    fs.writeFileSync(sidecarPath, JSON.stringify(this.sidecar));
  }

  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) return vector;
    return vector.map((v) => v / magnitude);
  }

  async insert(id: string, vector: number[], _metadata?: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized();

    // If ID already exists, delete first
    if (this.sidecar.idToIndex[id] !== undefined) {
      await this.delete(id);
    }

    const normalized = this.normalize(vector);
    this.index.add(normalized);

    const idx = this.sidecar.nextIndex++;
    this.sidecar.idToIndex[id] = idx;
    this.sidecar.indexToId[idx] = id;

    this.persist();
  }

  async insertBatch(items: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>): Promise<void> {
    await this.ensureInitialized();

    for (const item of items) {
      if (this.sidecar.idToIndex[item.id] !== undefined) {
        await this.delete(item.id);
      }

      const normalized = this.normalize(item.vector);
      this.index.add(normalized);

      const idx = this.sidecar.nextIndex++;
      this.sidecar.idToIndex[item.id] = idx;
      this.sidecar.indexToId[idx] = item.id;
    }

    this.persist();
  }

  async search(vector: number[], limit: number, threshold?: number): Promise<VectorResult[]> {
    await this.ensureInitialized();

    const totalVectors = this.index.ntotal();
    if (totalVectors === 0) return [];

    const k = Math.min(limit, totalVectors);
    const normalized = this.normalize(vector);
    const { distances, labels } = this.index.search(normalized, k);

    const results: VectorResult[] = [];
    for (let i = 0; i < labels.length; i++) {
      const faissIdx = labels[i];
      if (faissIdx === -1) continue;

      const id = this.sidecar.indexToId[faissIdx];
      if (!id) continue;

      // Convert L2 distance to cosine similarity (normalized vectors: sim = 1 - d²/2)
      const similarity = 1 - distances[i] / 2;

      if (threshold !== undefined && similarity < threshold) continue;

      results.push({ id, score: similarity });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  async delete(id: string): Promise<boolean> {
    // FAISS flat index doesn't support deletion; we mark as deleted
    // and rebuild on next persist cycle. For now, just remove from sidecar.
    if (this.sidecar.idToIndex[id] === undefined) return false;

    const idx = this.sidecar.idToIndex[id];
    delete this.sidecar.idToIndex[id];
    delete this.sidecar.indexToId[idx];

    this.persist();
    return true;
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return Object.keys(this.sidecar.idToIndex).length;
  }

  async close(): Promise<void> {
    if (this.index) {
      this.persist();
      this.index = null;
    }
  }
}
