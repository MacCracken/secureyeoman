/**
 * Capture IPC Tests
 *
 * @see NEXT_STEP_05: Sandboxing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecureIPC,
  MessageChannel,
  initializeCaptureIPC,
  getCaptureIPC,
  resetCaptureIPC,
} from './capture-ipc.js';

describe('SecureIPC', () => {
  beforeEach(() => {
    resetCaptureIPC();
  });

  describe('initialize', () => {
    it('should initialize with default key', async () => {
      const ipc = new SecureIPC();
      await ipc.initialize();
      expect(ipc.isInitialized()).toBe(true);
    });

    it('should initialize with custom key', async () => {
      const key = Buffer.alloc(32, 'x');
      const ipc = new SecureIPC({ key });
      await ipc.initialize();
      expect(ipc.isInitialized()).toBe(true);
      expect(ipc.getKey()).toEqual(key);
    });
  });

  describe('encryption/decryption', () => {
    let ipc: SecureIPC;

    beforeEach(async () => {
      ipc = new SecureIPC();
      await ipc.initialize();
    });

    it('should encrypt and decrypt a message', () => {
      const message = {
        id: 'test-1',
        type: 'command' as const,
        action: 'capture',
        data: { foo: 'bar' },
        timestamp: Date.now(),
      };

      const encrypted = ipc.encrypt(message);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.data).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      const decrypted = ipc.decrypt(encrypted);
      expect(decrypted).toEqual(message);
    });

    it('should produce different IVs for same message', () => {
      const message = {
        id: 'test-1',
        type: 'command' as const,
        action: 'capture',
        timestamp: Date.now(),
      };

      const encrypted1 = ipc.encrypt(message);
      const encrypted2 = ipc.encrypt(message);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });
  });

  describe('MessageChannel', () => {
    it('should encode and decode messages', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      const message = {
        id: 'test-1',
        type: 'command' as const,
        action: 'capture',
        data: { foo: 'bar' },
        timestamp: Date.now(),
      };

      const encoded = channel.encode(message);
      const decoded = channel.decode(encoded);

      expect(decoded).toEqual(message);
    });

    it('should handle message handlers', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      const handler = vi.fn();
      channel.onMessage('capture', handler);

      const message = {
        id: 'test-1',
        type: 'command' as const,
        action: 'capture',
        data: { foo: 'bar' },
        timestamp: Date.now(),
      };

      channel.handleMessage(message);
      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    });
  });

  describe('global instance', () => {
    it('should initialize global instance', () => {
      const ipc = initializeCaptureIPC();
      expect(ipc).toBeDefined();
    });

    it('should get global instance', () => {
      initializeCaptureIPC();
      const ipc = getCaptureIPC();
      expect(ipc).toBeDefined();
    });

    it('should throw if not initialized', () => {
      expect(() => getCaptureIPC()).toThrow('not initialized');
    });

    it('should reset global instance', () => {
      initializeCaptureIPC();
      resetCaptureIPC();
      expect(() => getCaptureIPC()).toThrow('not initialized');
    });

    it('should initialize with custom config', () => {
      const key = Buffer.alloc(32, 'a');
      const ipc = initializeCaptureIPC({ key });
      expect(ipc.getKey()).toEqual(key);
    });
  });

  describe('send and receive', () => {
    let ipc: SecureIPC;

    beforeEach(async () => {
      ipc = new SecureIPC();
      await ipc.initialize();
    });

    it('should send encrypted message over a writable channel', async () => {
      let writtenData = '';
      const mockWritable = {
        write: vi.fn((data: string, callback: (error?: Error | null) => void) => {
          writtenData = data;
          callback(null);
        }),
      } as unknown as import('node:stream').Writable;

      await ipc.send(mockWritable, { type: 'command', action: 'test', data: { foo: 'bar' } });
      expect(mockWritable.write).toHaveBeenCalledTimes(1);

      // Verify the written data is valid JSON with encrypted payload
      const parsed = JSON.parse(writtenData.trim());
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('tag');
    });

    it('should reject on write error', async () => {
      const mockWritable = {
        write: vi.fn((_data: string, callback: (error?: Error | null) => void) => {
          callback(new Error('write failed'));
        }),
      } as unknown as import('node:stream').Writable;

      await expect(ipc.send(mockWritable, { type: 'command', action: 'test' })).rejects.toThrow(
        'write failed'
      );
    });

    it('should receive and decrypt message from a readable channel', async () => {
      const originalMessage = {
        id: 'msg-1',
        type: 'response' as const,
        action: 'result',
        data: { value: 42 },
        timestamp: Date.now(),
      };

      const encrypted = ipc.encrypt(originalMessage);
      const payload = JSON.stringify(encrypted) + '\n';

      const mockReadable = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            // Simulate data arriving
            setTimeout(() => handler(Buffer.from(payload)), 5);
          }
        }),
        removeListener: vi.fn(),
      } as unknown as import('node:stream').Readable;

      const received = await ipc.receive(mockReadable);
      expect(received).toEqual(originalMessage);
    });

    it('should handle error on readable channel', async () => {
      const mockReadable = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('stream error')), 5);
          }
        }),
        removeListener: vi.fn(),
      } as unknown as import('node:stream').Readable;

      await expect(ipc.receive(mockReadable)).rejects.toThrow('stream error');
    });

    it('should skip empty lines in received data', async () => {
      const originalMessage = {
        id: 'msg-2',
        type: 'event' as const,
        action: 'notify',
        data: null,
        timestamp: Date.now(),
      };

      const encrypted = ipc.encrypt(originalMessage);
      // Send empty line followed by valid payload
      const payload = '\n\n' + JSON.stringify(encrypted) + '\n';

      const mockReadable = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            setTimeout(() => handler(Buffer.from(payload)), 5);
          }
        }),
        removeListener: vi.fn(),
      } as unknown as import('node:stream').Readable;

      const received = await ipc.receive(mockReadable);
      expect(received).toEqual(originalMessage);
    });

    it('should handle partial data chunks that arrive in pieces', async () => {
      const originalMessage = {
        id: 'msg-3',
        type: 'command' as const,
        action: 'capture',
        timestamp: Date.now(),
      };

      const encrypted = ipc.encrypt(originalMessage);
      const fullPayload = JSON.stringify(encrypted) + '\n';

      // Split the payload into two chunks
      const midpoint = Math.floor(fullPayload.length / 2);
      const chunk1 = fullPayload.slice(0, midpoint);
      const chunk2 = fullPayload.slice(midpoint);

      let _dataHandler: ((chunk: Buffer) => void) | null = null;

      const mockReadable = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            _dataHandler = handler;
            // Send first chunk immediately
            setTimeout(() => handler(Buffer.from(chunk1)), 5);
            // Send second chunk after a short delay
            setTimeout(() => handler(Buffer.from(chunk2)), 15);
          }
        }),
        removeListener: vi.fn(),
      } as unknown as import('node:stream').Readable;

      const received = await ipc.receive(mockReadable);
      expect(received).toEqual(originalMessage);
    });

    it('should continue reading when a line contains invalid JSON', async () => {
      const originalMessage = {
        id: 'msg-4',
        type: 'command' as const,
        timestamp: Date.now(),
      };

      const encrypted = ipc.encrypt(originalMessage);
      // First line is invalid JSON, second is valid
      const payload = 'not-valid-json\n' + JSON.stringify(encrypted) + '\n';

      const mockReadable = {
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          if (event === 'data') {
            setTimeout(() => handler(Buffer.from(payload)), 5);
          }
        }),
        removeListener: vi.fn(),
      } as unknown as import('node:stream').Readable;

      const received = await ipc.receive(mockReadable);
      expect(received).toEqual(originalMessage);
    });
  });

  describe('SecureIPC — edge cases', () => {
    it('should generate a random key with custom keyLength', () => {
      const ipc = new SecureIPC({ keyLength: 32 });
      expect(ipc.getKey().length).toBe(32);
    });

    it('should report isInitialized as false before initialize()', () => {
      const ipc = new SecureIPC();
      expect(ipc.isInitialized()).toBe(false);
    });

    it('should decrypt with a different SecureIPC instance sharing the same key', () => {
      const key = Buffer.alloc(32, 'z');
      const ipc1 = new SecureIPC({ key });
      const ipc2 = new SecureIPC({ key });

      const message = {
        id: 'shared-1',
        type: 'event' as const,
        data: { hello: 'world' },
        timestamp: Date.now(),
      };

      const encrypted = ipc1.encrypt(message);
      const decrypted = ipc2.decrypt(encrypted);
      expect(decrypted).toEqual(message);
    });

    it('should fail to decrypt with wrong key', () => {
      const ipc1 = new SecureIPC({ key: Buffer.alloc(32, 'a') });
      const ipc2 = new SecureIPC({ key: Buffer.alloc(32, 'b') });

      const message = {
        id: 'wrong-key-1',
        type: 'command' as const,
        timestamp: Date.now(),
      };

      const encrypted = ipc1.encrypt(message);
      expect(() => ipc2.decrypt(encrypted)).toThrow();
    });

    it('should createMessageChannel that works end-to-end', () => {
      const ipc = new SecureIPC();
      const channel = ipc.createMessageChannel();

      const payload = channel.send('test-action', { value: 123 });
      expect(payload).toBeInstanceOf(Buffer);

      const decoded = channel.decode(payload);
      expect(decoded.action).toBe('test-action');
      expect(decoded.data).toEqual({ value: 123 });
      expect(decoded.type).toBe('command');
    });
  });

  describe('MessageChannel — additional coverage', () => {
    it('should not call handler when action does not match', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      const handler = vi.fn();
      channel.onMessage('capture', handler);

      const message = {
        id: 'test-no-match',
        type: 'command' as const,
        action: 'different-action',
        data: { foo: 'bar' },
        timestamp: Date.now(),
      };

      channel.handleMessage(message);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle message with undefined action', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      const handler = vi.fn();
      channel.onMessage('', handler);

      const message = {
        id: 'test-no-action',
        type: 'command' as const,
        timestamp: Date.now(),
      };

      // action is undefined, so it looks up '' in the map
      channel.handleMessage(message);
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('should handle message with no matching handler and no action', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      // No handlers registered
      const message = {
        id: 'test-no-handler',
        type: 'command' as const,
        action: 'unregistered',
        data: 'ignored',
        timestamp: Date.now(),
      };

      // Should not throw
      expect(() => channel.handleMessage(message)).not.toThrow();
    });

    it('should overwrite handler when onMessage is called twice for the same type', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      channel.onMessage('capture', handler1);
      channel.onMessage('capture', handler2);

      const message = {
        id: 'test-overwrite',
        type: 'command' as const,
        action: 'capture',
        data: 'test',
        timestamp: Date.now(),
      };

      channel.handleMessage(message);
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith('test');
    });

    it('should encode and decode messages with no data field', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      const message = {
        id: 'no-data',
        type: 'response' as const,
        action: 'ack',
        timestamp: Date.now(),
      };

      const encoded = channel.encode(message);
      const decoded = channel.decode(encoded);
      expect(decoded.id).toBe('no-data');
      expect(decoded.action).toBe('ack');
    });

    it('should send method return a Buffer with correct structure', () => {
      const key = Buffer.alloc(32, 'x');
      const channel = new MessageChannel(key);

      const payload = channel.send('myAction', { key: 'value' });
      expect(Buffer.isBuffer(payload)).toBe(true);

      // Decode and verify
      const decoded = channel.decode(payload);
      expect(decoded.type).toBe('command');
      expect(decoded.action).toBe('myAction');
      expect(decoded.data).toEqual({ key: 'value' });
      expect(decoded.id).toBeDefined();
      expect(decoded.timestamp).toBeGreaterThan(0);
    });
  });
});
