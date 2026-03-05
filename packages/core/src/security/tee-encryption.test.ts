import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockOpenSync,
  mockReadSync,
  mockCloseSync,
  mockExecFileSync,
  mockRandomBytes,
  mockCreateCipheriv,
  mockCreateDecipheriv,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockOpenSync: vi.fn(),
  mockReadSync: vi.fn(),
  mockCloseSync: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockRandomBytes: vi.fn(),
  mockCreateCipheriv: vi.fn(),
  mockCreateDecipheriv: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  openSync: mockOpenSync,
  readSync: mockReadSync,
  closeSync: mockCloseSync,
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    randomBytes: mockRandomBytes,
    createCipheriv: mockCreateCipheriv,
    createDecipheriv: mockCreateDecipheriv,
    default: actual,
  };
});

import { TeeEncryptionManager } from './tee-encryption.js';

describe('TeeEncryptionManager', () => {
  let manager: TeeEncryptionManager;

  // Build a valid sealed buffer for tests
  const MAGIC = Buffer.from('SEALED_V1');
  const fakeIv = Buffer.alloc(12, 0xaa);
  const fakeAuthTag = Buffer.alloc(16, 0xbb);
  const fakeCiphertext = Buffer.from('encrypted-data');

  function buildSealedBuffer(keySourceTag: number): Buffer {
    return Buffer.concat([MAGIC, fakeIv, fakeAuthTag, Buffer.from([keySourceTag]), fakeCiphertext]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new TeeEncryptionManager();
  });

  afterEach(() => {
    delete process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY;
  });

  describe('sealModelWeights', () => {
    it('throws when model file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(() => manager.sealModelWeights('/missing/model.bin', 'keyring')).toThrow(
        'Model file not found'
      );
    });

    it('seals a model file with keyring key source', () => {
      process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model data'));
      mockRandomBytes.mockReturnValue(fakeIv);

      const mockCipher = {
        update: vi.fn(() => Buffer.from('enc')),
        final: vi.fn(() => Buffer.from('')),
        getAuthTag: vi.fn(() => fakeAuthTag),
      };
      mockCreateCipheriv.mockReturnValue(mockCipher);

      const result = manager.sealModelWeights('/path/model.bin', 'keyring');
      expect(result).toBe('/path/model.bin.sealed');
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenData = mockWriteFileSync.mock.calls[0][1] as Buffer;
      expect(writtenData.subarray(0, 9).toString()).toBe('SEALED_V1');
    });
  });

  describe('unsealModelWeights', () => {
    it('throws when sealed file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(() => manager.unsealModelWeights('/missing/model.sealed')).toThrow(
        'Sealed file not found'
      );
    });

    it('throws on invalid magic header', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('NOT_VALID_HEADER_AND_MORE_DATA'));
      expect(() => manager.unsealModelWeights('/bad/file.sealed')).toThrow(
        'Invalid sealed file format'
      );
    });

    it('throws on unknown key source tag', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(buildSealedBuffer(0xff));
      expect(() => manager.unsealModelWeights('/file.sealed')).toThrow(
        'Unknown key source tag: 0xff'
      );
    });

    it('unseals with keyring source from embedded tag', () => {
      process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY = 'b'.repeat(64);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(buildSealedBuffer(0x03)); // keyring

      const mockDecipher = {
        setAuthTag: vi.fn(),
        update: vi.fn(() => Buffer.from('decrypted')),
        final: vi.fn(() => Buffer.from('')),
      };
      mockCreateDecipheriv.mockReturnValue(mockDecipher);

      const result = manager.unsealModelWeights('/file.sealed');
      expect(result.toString()).toBe('decrypted');
    });

    it('uses explicit keySource override instead of embedded tag', () => {
      process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY = 'c'.repeat(64);
      mockExistsSync.mockReturnValue(true);
      // File has tpm tag (0x01) but we override with keyring
      mockReadFileSync.mockReturnValue(buildSealedBuffer(0x01));

      const mockDecipher = {
        setAuthTag: vi.fn(),
        update: vi.fn(() => Buffer.from('data')),
        final: vi.fn(() => Buffer.from('')),
      };
      mockCreateDecipheriv.mockReturnValue(mockDecipher);

      const result = manager.unsealModelWeights('/file.sealed', 'keyring');
      expect(result.toString()).toBe('data');
    });
  });

  describe('isSealed', () => {
    it('returns false when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(manager.isSealed('/nope')).toBe(false);
    });

    it('returns true for a valid sealed file', () => {
      mockExistsSync.mockReturnValue(true);
      mockOpenSync.mockReturnValue(42);
      mockReadSync.mockImplementation(
        (_fd: number, buf: Buffer, _off: number, _len: number, _pos: number) => {
          MAGIC.copy(buf);
          return MAGIC.length;
        }
      );

      expect(manager.isSealed('/sealed.bin')).toBe(true);
      expect(mockCloseSync).toHaveBeenCalledWith(42);
    });

    it('returns false for a non-sealed file', () => {
      mockExistsSync.mockReturnValue(true);
      mockOpenSync.mockReturnValue(43);
      mockReadSync.mockImplementation(
        (_fd: number, buf: Buffer, _off: number, _len: number, _pos: number) => {
          Buffer.from('NOT_SEAL').copy(buf);
          return 8;
        }
      );

      expect(manager.isSealed('/regular.bin')).toBe(false);
      expect(mockCloseSync).toHaveBeenCalledWith(43);
    });

    it('returns false on read error', () => {
      mockExistsSync.mockReturnValue(true);
      mockOpenSync.mockImplementation(() => {
        throw new Error('permission denied');
      });
      expect(manager.isSealed('/locked.bin')).toBe(false);
    });
  });

  describe('key derivation', () => {
    it('derives key from TPM', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model'));
      mockRandomBytes.mockReturnValue(fakeIv);

      const hexKey = 'ab'.repeat(32); // 64 hex chars
      mockExecFileSync.mockReturnValue(hexKey + '\n');

      const mockCipher = {
        update: vi.fn(() => Buffer.from('enc')),
        final: vi.fn(() => Buffer.from('')),
        getAuthTag: vi.fn(() => fakeAuthTag),
      };
      mockCreateCipheriv.mockReturnValue(mockCipher);

      manager.sealModelWeights('/model.bin', 'tpm');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tpm2_unseal',
        ['-c', '0x81000001'],
        expect.any(Object)
      );
    });

    it('throws when TPM key is too short', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model'));
      mockExecFileSync.mockReturnValue('shortkey');

      expect(() => manager.sealModelWeights('/model.bin', 'tpm')).toThrow(
        'TPM sealed data too short'
      );
    });

    it('throws when TPM command fails', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model'));
      mockExecFileSync.mockImplementation(() => {
        throw new Error('tpm2_unseal: command not found');
      });

      expect(() => manager.sealModelWeights('/model.bin', 'tpm')).toThrow(
        'TPM key derivation failed'
      );
    });

    it('throws for TEE key source (not implemented)', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model'));
      expect(() => manager.sealModelWeights('/model.bin', 'tee')).toThrow(
        'TEE key source not yet implemented'
      );
    });

    it('throws when keyring env var is not set', () => {
      delete process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model'));
      expect(() => manager.sealModelWeights('/model.bin', 'keyring')).toThrow(
        'SECUREYEOMAN_MODEL_ENCRYPTION_KEY environment variable not set'
      );
    });

    it('throws when keyring env var is too short', () => {
      process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY = 'tooshort';
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model'));
      expect(() => manager.sealModelWeights('/model.bin', 'keyring')).toThrow(
        'Model encryption key must be at least 32 bytes'
      );
    });

    it('caches derived keys', () => {
      process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY = 'd'.repeat(64);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('model'));
      mockRandomBytes.mockReturnValue(fakeIv);

      const mockCipher = {
        update: vi.fn(() => Buffer.from('enc')),
        final: vi.fn(() => Buffer.from('')),
        getAuthTag: vi.fn(() => fakeAuthTag),
      };
      mockCreateCipheriv.mockReturnValue(mockCipher);

      manager.sealModelWeights('/model1.bin', 'keyring');
      manager.sealModelWeights('/model2.bin', 'keyring');
      // Key should only be derived once (cached after first call)
      // Env var is read once
    });
  });

  describe('clearKeyCache', () => {
    it('clears the key cache without error', () => {
      expect(() => manager.clearKeyCache()).not.toThrow();
    });
  });
});
