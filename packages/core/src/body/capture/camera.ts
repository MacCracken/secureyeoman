/**
 * Camera Capture Driver
 *
 * Captures a single frame from the system camera using ffmpeg subprocess.
 *
 * Platform device sources:
 *   Linux:   -f v4l2 -i /dev/video0
 *   macOS:   -f avfoundation -i "0"
 *   Windows: -f dshow -i video="Integrated Camera"
 *
 * Requires allowCamera: true in SecurityConfig.
 * Writes a temp file, reads it, then cleans up.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 15_000;

export interface CameraFrame {
  imageBase64: string;
  mimeType: 'image/jpeg';
  deviceId: string;
}

function buildFfmpegArgs(deviceId?: string): string[] {
  const outFile = join(tmpdir(), `sy-camera-${randomUUID()}.jpg`);

  switch (process.platform) {
    case 'darwin':
      return [
        '-y',
        '-f', 'avfoundation',
        '-framerate', '1',
        '-i', deviceId ?? '0',
        '-frames:v', '1',
        '-q:v', '2',
        outFile,
      ];
    case 'win32':
      return [
        '-y',
        '-f', 'dshow',
        '-framerate', '1',
        '-i', `video=${deviceId ?? 'Integrated Camera'}`,
        '-frames:v', '1',
        '-q:v', '2',
        outFile,
      ];
    default: // Linux
      return [
        '-y',
        '-f', 'v4l2',
        '-framerate', '1',
        '-i', deviceId ?? '/dev/video0',
        '-frames:v', '1',
        '-q:v', '2',
        outFile,
      ];
  }
}

function getOutputFile(args: string[]): string {
  return args[args.length - 1] ?? '';
}

/**
 * Capture a single camera frame.
 * Requires ffmpeg to be installed on the host.
 */
export async function captureCamera(deviceId?: string): Promise<CameraFrame> {
  const args = buildFfmpegArgs(deviceId);
  const outFile = getOutputFile(args);

  if (!outFile) {
    throw new Error('Failed to build ffmpeg output file path');
  }

  try {
    await execFileAsync('ffmpeg', args, { timeout: FFMPEG_TIMEOUT_MS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Camera capture failed: ${msg}. Ensure ffmpeg is installed and a camera device is available.`);
  }

  let imageBase64: string;
  try {
    const buf = await readFile(outFile);
    imageBase64 = buf.toString('base64');
  } finally {
    await unlink(outFile).catch(() => {
      // Best-effort cleanup
    });
  }

  return {
    imageBase64,
    mimeType: 'image/jpeg',
    deviceId: deviceId ?? (process.platform === 'linux' ? '/dev/video0' : '0'),
  };
}
