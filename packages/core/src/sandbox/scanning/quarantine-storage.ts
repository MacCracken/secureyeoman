/**
 * Quarantine Storage — File-based quarantine for blocked artifacts (Phase 116-B)
 *
 * Stores quarantined artifacts under <dataDir>/quarantine/<uuid>/ with
 * artifact.bin + metadata.json sidecar.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanResult } from '@secureyeoman/shared';

export interface QuarantineMetadata {
  id: string;
  artifactId: string;
  artifactType: string;
  sourceContext: string;
  personalityId?: string;
  userId?: string;
  scanResult: ScanResult;
  status: 'quarantined' | 'approved' | 'released' | 'deleted';
  approvedBy?: string;
  approvedAt?: number;
  createdAt: number;
}

export class QuarantineStorage {
  private readonly baseDir: string;

  constructor(dataDir: string) {
    this.baseDir = join(dataDir, 'quarantine');
  }

  async quarantine(
    artifactContent: string | Buffer,
    scanResult: ScanResult,
    meta: {
      artifactType: string;
      sourceContext: string;
      personalityId?: string;
      userId?: string;
    },
  ): Promise<QuarantineMetadata> {
    const id = randomUUID();
    const dir = join(this.baseDir, id);
    await mkdir(dir, { recursive: true });

    const metadata: QuarantineMetadata = {
      id,
      artifactId: scanResult.artifactId,
      artifactType: meta.artifactType,
      sourceContext: meta.sourceContext,
      personalityId: meta.personalityId,
      userId: meta.userId,
      scanResult,
      status: 'quarantined',
      createdAt: Date.now(),
    };

    const content = typeof artifactContent === 'string'
      ? Buffer.from(artifactContent, 'utf-8')
      : artifactContent;

    await Promise.all([
      writeFile(join(dir, 'artifact.bin'), content),
      writeFile(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2)),
    ]);

    return metadata;
  }

  async list(): Promise<QuarantineMetadata[]> {
    const entries: QuarantineMetadata[] = [];
    let dirs: string[];
    try {
      dirs = await readdir(this.baseDir);
    } catch {
      return entries; // No quarantine dir yet
    }

    for (const name of dirs) {
      try {
        const meta = await this.readMetadata(name);
        if (meta) entries.push(meta);
      } catch {
        // skip broken entries
      }
    }

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<QuarantineMetadata | null> {
    return this.readMetadata(id);
  }

  async getArtifact(id: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.baseDir, id, 'artifact.bin'));
    } catch {
      return null;
    }
  }

  async approve(id: string, approvedBy: string): Promise<QuarantineMetadata | null> {
    const meta = await this.readMetadata(id);
    if (!meta) return null;

    meta.status = 'approved';
    meta.approvedBy = approvedBy;
    meta.approvedAt = Date.now();

    await this.writeMetadata(id, meta);
    return meta;
  }

  async release(id: string): Promise<boolean> {
    const meta = await this.readMetadata(id);
    if (!meta || meta.status !== 'approved') return false;

    meta.status = 'released';
    await this.writeMetadata(id, meta);
    return true;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await rm(join(this.baseDir, id), { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async readMetadata(id: string): Promise<QuarantineMetadata | null> {
    try {
      const raw = await readFile(join(this.baseDir, id, 'metadata.json'), 'utf-8');
      return JSON.parse(raw) as QuarantineMetadata;
    } catch {
      return null;
    }
  }

  private async writeMetadata(id: string, meta: QuarantineMetadata): Promise<void> {
    const path = join(this.baseDir, id, 'metadata.json');
    const tmpPath = path + '.tmp';
    await writeFile(tmpPath, JSON.stringify(meta, null, 2));
    await rename(tmpPath, path);
  }

  close(): void {
    // No-op: filesystem-based storage, no connections to close
  }
}
