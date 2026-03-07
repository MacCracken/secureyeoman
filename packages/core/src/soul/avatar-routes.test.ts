/**
 * Avatar Routes Tests
 *
 * Tests for POST/DELETE/GET /api/v1/soul/personalities/:id/avatar
 */

import { describe, it, expect, vi, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { registerSoulRoutes } from './soul-routes.js';
import type { SoulManager } from './manager.js';

const PERSONALITY = {
  id: 'pers-1',
  name: 'FRIDAY',
  systemPrompt: 'You are helpful.',
  description: '',
  traits: {},
  sex: 'unspecified',
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  modelFallbacks: [],
  includeArchetypes: true,
  injectDateTime: false,
  empathyResonance: false,
  avatarUrl: null,
  isActive: false,
  isDefault: false,
  body: {},
  createdAt: 1000,
  updatedAt: 2000,
};

const PERSONALITY_WITH_AVATAR = {
  ...PERSONALITY,
  avatarUrl: '/soul/personalities/pers-1/avatar',
};

function makeMockManager(overrides?: Partial<SoulManager>): SoulManager {
  return {
    getPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    updatePersonalityAvatar: vi.fn().mockResolvedValue(PERSONALITY_WITH_AVATAR),
    getActivePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    listPersonalities: vi.fn().mockResolvedValue({ personalities: [PERSONALITY], total: 1 }),
    createPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    updatePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    deletePersonality: vi.fn().mockResolvedValue(undefined),
    setPersonality: vi.fn().mockResolvedValue(undefined),
    listPersonalityPresets: vi.fn().mockReturnValue([]),
    createPersonalityFromPreset: vi.fn().mockResolvedValue(PERSONALITY),
    listSkills: vi.fn().mockResolvedValue({ skills: [], total: 0 }),
    createSkill: vi.fn().mockResolvedValue({}),
    updateSkill: vi.fn().mockResolvedValue({}),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
    enableSkill: vi.fn().mockResolvedValue(undefined),
    disableSkill: vi.fn().mockResolvedValue(undefined),
    approveSkill: vi.fn().mockResolvedValue({}),
    rejectSkill: vi.fn().mockResolvedValue(undefined),
    listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
    getOwner: vi.fn().mockResolvedValue(null),
    getUser: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({}),
    updateUser: vi.fn().mockResolvedValue({}),
    deleteUser: vi.fn().mockResolvedValue(true),
    composeSoulPrompt: vi.fn().mockResolvedValue('You are FRIDAY.'),
    getActiveTools: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockReturnValue({
      enabled: true,
      maxSkills: 50,
      maxPromptTokens: 32000,
      learningMode: ['user_authored'],
    }),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    getAgentName: vi.fn().mockResolvedValue('FRIDAY'),
    setAgentName: vi.fn().mockResolvedValue(undefined),
    needsOnboarding: vi.fn().mockResolvedValue(false),
    enablePersonality: vi.fn().mockResolvedValue(undefined),
    disablePersonality: vi.fn().mockResolvedValue(undefined),
    setDefaultPersonality: vi.fn().mockResolvedValue(undefined),
    clearDefaultPersonality: vi.fn().mockResolvedValue(undefined),
    getEnabledPersonalities: vi.fn().mockResolvedValue([PERSONALITY]),
    ...overrides,
  } as unknown as SoulManager;
}

let tmpDir: string;

function buildApp(overrides?: Partial<SoulManager>, dataDirOverride?: string) {
  if (!tmpDir) tmpDir = mkdtempSync(join(tmpdir(), 'avatar-test-'));
  const dataDir = dataDirOverride ?? tmpDir;
  const app = Fastify({ logger: false });
  void app.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024 } });
  registerSoulRoutes(app, {
    soulManager: makeMockManager(overrides),
    dataDir,
  });
  return app;
}

/** Build a minimal multipart/form-data body with a single file field. */
function buildMultipart(
  boundary: string,
  fieldName: string,
  filename: string,
  mimeType: string,
  data: Buffer
): Buffer {
  const crlf = '\r\n';
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join(crlf);
  const footer = `${crlf}--${boundary}--${crlf}`;
  return Buffer.concat([Buffer.from(header), data, Buffer.from(footer)]);
}

afterAll(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── POST /avatar ─────────────────────────────────────────────

describe('POST /api/v1/soul/personalities/:id/avatar', () => {
  it('saves file and returns updated personality on happy path', async () => {
    const app = buildApp();
    const boundary = 'testboundary';
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const payload = buildMultipart(boundary, 'avatar', 'photo.png', 'image/png', pngData);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.personality).toBeDefined();
    expect(body.personality.avatarUrl).toBe('/soul/personalities/pers-1/avatar');
  });

  it('creates avatar file on the filesystem', async () => {
    const app = buildApp();
    const boundary = 'testboundary2';
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const payload = buildMultipart(boundary, 'avatar', 'test.png', 'image/png', pngData);

    await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    const avatarDir = join(tmpDir, 'avatars');
    const files = existsSync(avatarDir)
      ? (await import('node:fs'))
          .readdirSync(avatarDir)
          .filter((f: string) => f.startsWith('pers-1.'))
      : [];
    expect(files.length).toBeGreaterThan(0);
  });

  it('returns 400 for unsupported MIME type', async () => {
    const app = buildApp();
    const boundary = 'badboundary';
    const payload = buildMultipart(
      boundary,
      'avatar',
      'file.pdf',
      'application/pdf',
      Buffer.from('data')
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Unsupported image type/);
  });

  it('returns 404 when personality not found', async () => {
    const app = buildApp({ getPersonality: vi.fn().mockResolvedValue(null) });
    const boundary = 'notfoundboundary';
    const payload = buildMultipart(
      boundary,
      'avatar',
      'photo.png',
      'image/png',
      Buffer.from([0x89, 0x50])
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/missing/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/not found/i);
  });

  it('returns 400 when no file uploaded', async () => {
    const app = buildApp();
    const boundary = 'emptyboundary';
    const emptyPayload = `--${boundary}--\r\n`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: emptyPayload,
    });

    expect(res.statusCode).toBe(400);
  });

  it('supports JPEG uploads', async () => {
    const app = buildApp();
    const boundary = 'jpegboundary';
    const jpegData = Buffer.from([0xff, 0xd8, 0xff]); // JPEG magic bytes
    const payload = buildMultipart(boundary, 'avatar', 'photo.jpg', 'image/jpeg', jpegData);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it('supports WebP uploads', async () => {
    const app = buildApp();
    const boundary = 'webpboundary';
    const webpData = Buffer.from('RIFF....WEBP'); // simplified WebP
    const payload = buildMultipart(boundary, 'avatar', 'photo.webp', 'image/webp', webpData);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it('supports SVG uploads', async () => {
    const app = buildApp();
    const boundary = 'svgboundary';
    const svgData = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const payload = buildMultipart(boundary, 'avatar', 'icon.svg', 'image/svg+xml', svgData);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 503 when dataDir not configured', async () => {
    const app = Fastify({ logger: false });
    void app.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024 } });
    registerSoulRoutes(app, { soulManager: makeMockManager() });
    const boundary = 'nodataboundary';
    const payload = buildMultipart(
      boundary,
      'avatar',
      'photo.png',
      'image/png',
      Buffer.from([0x89])
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/soul/personalities/pers-1/avatar',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(res.statusCode).toBe(503);
  });
});

// ── DELETE /avatar ───────────────────────────────────────────

describe('DELETE /api/v1/soul/personalities/:id/avatar', () => {
  it('removes the file and nulls avatar_url', async () => {
    const personalityNoAvatar = { ...PERSONALITY, avatarUrl: null };
    const app = buildApp({
      updatePersonalityAvatar: vi.fn().mockResolvedValue(personalityNoAvatar),
    });

    // Seed an avatar file so there is something to delete
    const avatarDir = join(tmpDir, 'avatars');
    mkdirSync(avatarDir, { recursive: true });
    writeFileSync(join(avatarDir, 'pers-1.png'), 'fake-image-data');

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/soul/personalities/pers-1/avatar',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.personality.avatarUrl).toBeNull();
    expect(existsSync(join(avatarDir, 'pers-1.png'))).toBe(false);
  });

  it('returns 404 when personality not found', async () => {
    const app = buildApp({ getPersonality: vi.fn().mockResolvedValue(null) });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/soul/personalities/missing/avatar',
    });

    expect(res.statusCode).toBe(404);
  });

  it('succeeds even if no file exists on disk', async () => {
    const personalityNoAvatar = { ...PERSONALITY, avatarUrl: null };
    const app = buildApp({
      updatePersonalityAvatar: vi.fn().mockResolvedValue(personalityNoAvatar),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/soul/personalities/pers-no-file/avatar',
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 503 when dataDir not configured', async () => {
    const app = Fastify({ logger: false });
    void app.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024 } });
    registerSoulRoutes(app, { soulManager: makeMockManager() });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/soul/personalities/pers-1/avatar',
    });

    expect(res.statusCode).toBe(503);
  });
});

// ── GET /avatar ──────────────────────────────────────────────

describe('GET /api/v1/soul/personalities/:id/avatar', () => {
  it('streams PNG file with correct Content-Type', async () => {
    const app = buildApp();

    // Seed avatar file
    const avatarDir = join(tmpDir, 'avatars');
    mkdirSync(avatarDir, { recursive: true });
    const imgData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    writeFileSync(join(avatarDir, 'pers-get.png'), imgData);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/soul/personalities/pers-get/avatar',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  it('sets Cache-Control header', async () => {
    const app = buildApp();
    const avatarDir = join(tmpDir, 'avatars');
    mkdirSync(avatarDir, { recursive: true });
    writeFileSync(join(avatarDir, 'pers-cache.png'), Buffer.from([0x89, 0x50]));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/soul/personalities/pers-cache/avatar',
    });

    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
  });

  it('serves SVG with correct Content-Type', async () => {
    const app = buildApp();
    const avatarDir = join(tmpDir, 'avatars');
    mkdirSync(avatarDir, { recursive: true });
    writeFileSync(join(avatarDir, 'pers-svg.svg'), '<svg></svg>');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/soul/personalities/pers-svg/avatar',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
  });

  it('returns 404 when no avatar uploaded', async () => {
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/soul/personalities/no-such-id/avatar',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 503 when dataDir not configured', async () => {
    const app = Fastify({ logger: false });
    void app.register(fastifyMultipart, { limits: { fileSize: 2 * 1024 * 1024 } });
    registerSoulRoutes(app, { soulManager: makeMockManager() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/soul/personalities/pers-1/avatar',
    });

    expect(res.statusCode).toBe(503);
  });

  it('serves JPEG file', async () => {
    const app = buildApp();
    const avatarDir = join(tmpDir, 'avatars');
    mkdirSync(avatarDir, { recursive: true });
    writeFileSync(join(avatarDir, 'pers-jpg.jpg'), Buffer.from([0xff, 0xd8, 0xff]));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/soul/personalities/pers-jpg/avatar',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
  });
});
