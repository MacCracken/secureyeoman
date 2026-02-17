/**
 * MediaHandler — Download, validate, and manage media attachments.
 *
 * Handles:
 * - Size limit enforcement (default 10MB)
 * - Temp file management with automatic cleanup
 * - Content scanning hook point (interface, not implemented)
 */

import { writeFileSync, readFileSync, mkdirSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { MessageAttachment } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';

export interface MediaHandlerOptions {
  /** Max file size in bytes (default 10MB) */
  maxSizeBytes?: number;
  /** Temp directory for downloaded files */
  tempDir?: string;
  /** Logger */
  logger: SecureLogger;
  /** Optional content scanner hook */
  contentScanner?: ContentScanner;
}

export interface ContentScanner {
  /** Scan a file and return true if safe, false if suspicious */
  scan(filePath: string, mimeType?: string): Promise<boolean>;
}

export interface DownloadedMedia {
  /** Local file path */
  filePath: string;
  /** Original attachment metadata */
  attachment: MessageAttachment;
  /** File size in bytes */
  sizeBytes: number;
}

export class MediaHandler {
  private readonly maxSizeBytes: number;
  private readonly tempDir: string;
  private readonly logger: SecureLogger;
  private readonly contentScanner?: ContentScanner;
  private readonly trackedFiles = new Set<string>();

  constructor(opts: MediaHandlerOptions) {
    this.maxSizeBytes = opts.maxSizeBytes ?? 10 * 1024 * 1024; // 10MB
    this.tempDir = opts.tempDir ?? join(tmpdir(), 'friday-media');
    this.logger = opts.logger;
    this.contentScanner = opts.contentScanner;

    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Process an attachment — download or decode, validate size, scan
   */
  async processAttachment(attachment: MessageAttachment): Promise<DownloadedMedia> {
    // Check declared size first
    if (attachment.size && attachment.size > this.maxSizeBytes) {
      throw new MediaError(
        `Attachment exceeds size limit: ${attachment.size} bytes > ${this.maxSizeBytes} bytes`,
        'SIZE_LIMIT_EXCEEDED',
      );
    }

    const filename = attachment.fileName ?? `${randomBytes(8).toString('hex')}`;
    const filePath = join(this.tempDir, filename);

    if (attachment.data) {
      // Inline base64 data
      const buffer = Buffer.from(attachment.data, 'base64');
      if (buffer.length > this.maxSizeBytes) {
        throw new MediaError(
          `Decoded attachment exceeds size limit: ${buffer.length} bytes`,
          'SIZE_LIMIT_EXCEEDED',
        );
      }
      writeFileSync(filePath, buffer);
    } else if (attachment.url) {
      // Download from URL
      await this.downloadFile(attachment.url, filePath);
    } else {
      throw new MediaError('Attachment has neither data nor URL', 'INVALID_ATTACHMENT');
    }

    const stat = statSync(filePath);
    if (stat.size > this.maxSizeBytes) {
      unlinkSync(filePath);
      throw new MediaError(
        `Downloaded file exceeds size limit: ${stat.size} bytes`,
        'SIZE_LIMIT_EXCEEDED',
      );
    }

    // Run content scanner if available
    if (this.contentScanner) {
      const safe = await this.contentScanner.scan(filePath, attachment.mimeType);
      if (!safe) {
        unlinkSync(filePath);
        throw new MediaError('Content scanner flagged the file', 'CONTENT_REJECTED');
      }
    }

    this.trackedFiles.add(filePath);
    this.logger.debug('Media processed', {
      fileName: filename,
      size: stat.size,
      mimeType: attachment.mimeType,
    });

    return {
      filePath,
      attachment,
      sizeBytes: stat.size,
    };
  }

  /**
   * Download a file from URL to local path
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new MediaError(`Failed to download: HTTP ${response.status}`, 'DOWNLOAD_FAILED');
    }

    // Check content-length header if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > this.maxSizeBytes) {
      throw new MediaError(
        `Remote file exceeds size limit: ${contentLength} bytes`,
        'SIZE_LIMIT_EXCEEDED',
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > this.maxSizeBytes) {
      throw new MediaError(
        `Downloaded data exceeds size limit: ${buffer.length} bytes`,
        'SIZE_LIMIT_EXCEEDED',
      );
    }

    writeFileSync(destPath, buffer);
  }

  /**
   * Clean up a specific tracked file
   */
  cleanupFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      this.trackedFiles.delete(filePath);
    } catch (err) {
      this.logger.warn(`Failed to clean up media file: ${filePath}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Clean up all tracked temp files
   */
  cleanupAll(): void {
    for (const filePath of this.trackedFiles) {
      this.cleanupFile(filePath);
    }
  }

  /**
   * Read a tracked file and return its contents as a base64-encoded string.
   */
  toBase64(filePath: string): string {
    const resolved = resolve(filePath);
    const tempDir = resolve(this.tempDir);
    if (!resolved.startsWith(tempDir + sep)) {
      throw new MediaError('File path outside allowed directory', 'PATH_TRAVERSAL');
    }
    if (!existsSync(resolved)) {
      throw new MediaError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    }
    return readFileSync(resolved).toString('base64');
  }

  /**
   * Get count of tracked temp files
   */
  getTrackedFileCount(): number {
    return this.trackedFiles.size;
  }
}

export class MediaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}
