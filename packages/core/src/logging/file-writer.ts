/**
 * Append-Only JSONL Log Writer
 *
 * Writes structured log entries as newline-delimited JSON (JSONL)
 * to a file opened with O_APPEND for safe concurrent appends.
 */

import { openSync, writeSync, closeSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { constants } from 'node:fs';

export class AppendOnlyLogWriter {
  private fd: number | null = null;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.open();
  }

  /**
   * Open (or reopen) the log file for appending.
   * Creates parent directories if they do not exist.
   */
  private open(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.fd = openSync(
      this.filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND,
    );
  }

  /**
   * Serialize an entry as JSON and append it as a single line.
   */
  write(entry: Record<string, unknown>): void {
    if (this.fd === null) {
      throw new Error('Writer is closed');
    }
    const line = JSON.stringify(entry) + '\n';
    writeSync(this.fd, line);
  }

  /**
   * Close the underlying file descriptor.
   */
  close(): void {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
  }

  /**
   * Reopen the file (useful after log rotation renames the file).
   */
  reopen(): void {
    this.close();
    this.open();
  }

  /**
   * Return the path this writer is appending to.
   */
  getCurrentPath(): string {
    return this.filePath;
  }
}
