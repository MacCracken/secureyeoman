/**
 * Local Embedding Provider
 *
 * Runs sentence-transformers via a Python child process.
 * Uses JSON-line stdin/stdout protocol for embedding requests.
 */

import { spawn, type ChildProcess } from 'child_process';
import { BaseEmbeddingProvider, type EmbeddingProviderConfig } from './base.js';
import type { SecureLogger } from '../../logging/logger.js';

export interface LocalEmbeddingConfig extends EmbeddingProviderConfig {
  model?: string;
  pythonPath?: string;
}

const PYTHON_SCRIPT = `
import sys, json
from sentence_transformers import SentenceTransformer

model_name = sys.argv[1] if len(sys.argv) > 1 else 'all-MiniLM-L6-v2'
model = SentenceTransformer(model_name)
sys.stderr.write(f"Loaded {model_name}\\n")
sys.stderr.flush()

for line in sys.stdin:
    try:
        req = json.loads(line.strip())
        texts = req.get("texts", [])
        embeddings = model.encode(texts).tolist()
        resp = json.dumps({"embeddings": embeddings})
        sys.stdout.write(resp + "\\n")
        sys.stdout.flush()
    except Exception as e:
        err = json.dumps({"error": str(e)})
        sys.stdout.write(err + "\\n")
        sys.stdout.flush()
`;

export class LocalEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name = 'local';
  private readonly model: string;
  private readonly pythonPath: string;
  private process: ChildProcess | null = null;
  private responseQueue: Array<{
    resolve: (value: number[][]) => void;
    reject: (err: Error) => void;
  }> = [];
  private buffer = '';

  constructor(config: LocalEmbeddingConfig = {}, logger?: SecureLogger) {
    super(config, logger);
    this.model = config.model ?? 'all-MiniLM-L6-v2';
    this.pythonPath = config.pythonPath ?? 'python3';
  }

  dimensions(): number {
    return 384;
  }

  protected async doEmbed(texts: string[]): Promise<number[][]> {
    await this.ensureProcess();

    return new Promise((resolve, reject) => {
      this.responseQueue.push({ resolve, reject });
      const request = JSON.stringify({ texts }) + '\n';
      this.process!.stdin!.write(request);
    });
  }

  private async ensureProcess(): Promise<void> {
    if (this.process && !this.process.killed) return;

    this.process = spawn(this.pythonPath, ['-c', PYTHON_SCRIPT, this.model], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;
        const handler = this.responseQueue.shift();
        if (!handler) continue;

        try {
          const resp = JSON.parse(line);
          if (resp.error) {
            handler.reject(new Error(`Embedding error: ${resp.error}`));
          } else {
            handler.resolve(resp.embeddings);
          }
        } catch (err) {
          handler.reject(new Error(`Failed to parse embedding response: ${line}`));
        }
      }
    });

    this.process.stderr!.on('data', (data: Buffer) => {
      this.logger?.debug('Local embedding process stderr', { message: data.toString().trim() });
    });

    this.process.on('exit', (code) => {
      this.logger?.warn('Local embedding process exited', { code });
      this.process = null;
      // Reject pending requests
      for (const handler of this.responseQueue) {
        handler.reject(new Error(`Embedding process exited with code ${code}`));
      }
      this.responseQueue = [];
    });

    // Wait for the model to load
    await new Promise<void>((resolve) => {
      const onData = (data: Buffer) => {
        if (data.toString().includes('Loaded')) {
          this.process!.stderr!.off('data', onData);
          resolve();
        }
      };
      this.process!.stderr!.on('data', onData);
      // Timeout after 60s
      setTimeout(() => resolve(), 60000);
    });
  }

  async close(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill();
      this.process = null;
    }
  }
}
