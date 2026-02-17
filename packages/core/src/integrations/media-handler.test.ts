import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MediaHandler, MediaError } from './media-handler.js';
import type { MessageAttachment } from '@friday/shared';
import type { SecureLogger } from '../logging/logger.js';

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  };
}

describe('MediaHandler', () => {
  let tmpDir: string;
  let handler: MediaHandler;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'friday-media-test-'));
    handler = new MediaHandler({
      maxSizeBytes: 1024, // 1KB for tests
      tempDir: tmpDir,
      logger: noopLogger(),
    });
  });

  afterEach(() => {
    handler.cleanupAll();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should process a base64 attachment', async () => {
    const data = Buffer.from('Hello, world!').toString('base64');
    const attachment: MessageAttachment = {
      type: 'file',
      data,
      fileName: 'test.txt',
      mimeType: 'text/plain',
    };

    const result = await handler.processAttachment(attachment);
    expect(result.filePath).toContain('test.txt');
    expect(result.sizeBytes).toBe(13);
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('should enforce size limit on base64 data', async () => {
    const data = Buffer.alloc(2048).toString('base64'); // 2KB > 1KB limit
    const attachment: MessageAttachment = {
      type: 'file',
      data,
      fileName: 'big.bin',
    };

    await expect(handler.processAttachment(attachment)).rejects.toThrow(MediaError);
    await expect(handler.processAttachment(attachment)).rejects.toThrow(/size limit/i);
  });

  it('should enforce declared size limit', async () => {
    const attachment: MessageAttachment = {
      type: 'file',
      url: 'https://example.com/huge.bin',
      size: 99999999,
    };

    await expect(handler.processAttachment(attachment)).rejects.toThrow(/size limit/i);
  });

  it('should reject attachment with neither data nor URL', async () => {
    const attachment: MessageAttachment = {
      type: 'image',
    };

    await expect(handler.processAttachment(attachment)).rejects.toThrow('neither data nor URL');
  });

  it('should clean up tracked temp files', async () => {
    const data = Buffer.from('test').toString('base64');
    const result = await handler.processAttachment({
      type: 'file',
      data,
      fileName: 'cleanup-test.txt',
    });

    expect(handler.getTrackedFileCount()).toBe(1);
    handler.cleanupFile(result.filePath);
    expect(existsSync(result.filePath)).toBe(false);
    expect(handler.getTrackedFileCount()).toBe(0);
  });

  it('should clean up all files at once', async () => {
    const data = Buffer.from('a').toString('base64');
    await handler.processAttachment({ type: 'file', data, fileName: 'f1.txt' });
    await handler.processAttachment({ type: 'file', data, fileName: 'f2.txt' });

    expect(handler.getTrackedFileCount()).toBe(2);
    handler.cleanupAll();
    expect(handler.getTrackedFileCount()).toBe(0);
  });

  it('should reject file flagged by content scanner', async () => {
    const scanningHandler = new MediaHandler({
      maxSizeBytes: 1024,
      tempDir: tmpDir,
      logger: noopLogger(),
      contentScanner: {
        scan: async () => false, // Always reject
      },
    });

    const data = Buffer.from('malicious').toString('base64');
    await expect(
      scanningHandler.processAttachment({ type: 'file', data, fileName: 'bad.exe' })
    ).rejects.toThrow('Content scanner flagged');
  });
});
