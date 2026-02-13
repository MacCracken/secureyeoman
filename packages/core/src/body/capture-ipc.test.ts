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
  });
});
