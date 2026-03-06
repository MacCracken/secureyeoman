import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { registerSoulRoutes } from './soul-routes.js';
import type { SoulManager } from './manager.js';
import type { Personality } from './types.js';

const PERSONALITY: Personality = {
  id: 'pers-1',
  name: 'FRIDAY',
  description: 'A helpful assistant',
  systemPrompt: 'You are FRIDAY, a helpful assistant.',
  traits: { formality: 'balanced', humor: 'dry' },
  sex: 'unspecified',
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  modelFallbacks: [],
  includeArchetypes: true,
  injectDateTime: false,
  empathyResonance: false,
  avatarUrl: null,
  isActive: true,
  isDefault: false,
  isArchetype: false,
  body: {
    enabled: false,
    capabilities: [],
    heartEnabled: true,
    creationConfig: {
      skills: false,
      tasks: false,
      personalities: false,
      subAgents: false,
      customRoles: false,
      roleAssignments: false,
      experiments: false,
      allowA2A: false,
      allowSwarms: false,
      allowDynamicTools: false,
      workflows: false,
    },
    selectedServers: [],
    selectedIntegrations: [],
    integrationAccess: [],
    mcpFeatures: {
      exposeGit: false,
      exposeFilesystem: false,
      exposeWeb: false,
      exposeWebScraping: false,
      exposeWebSearch: false,
      exposeBrowser: false,
      exposeDesktopControl: false,
      exposeNetworkDevices: false,
      exposeNetworkDiscovery: false,
      exposeNetworkAudit: false,
      exposeNetBox: false,
      exposeNvd: false,
      exposeNetworkUtils: false,
      exposeTwingate: false,
      exposeGmail: false,
      exposeTwitter: false,
      exposeGithub: false,
      exposeDocker: false,
      exposeCicd: false,
    },
    proactiveConfig: {
      enabled: false,
      builtins: {
        dailyStandup: false,
        weeklySummary: false,
        contextualFollowup: false,
        integrationHealthAlert: false,
        securityAlertDigest: false,
      },
      builtinModes: {
        dailyStandup: 'auto',
        weeklySummary: 'suggest',
        contextualFollowup: 'suggest',
        integrationHealthAlert: 'auto',
        securityAlertDigest: 'suggest',
      },
      learning: { enabled: true, minConfidence: 0.7 },
    },
    activeHours: {
      enabled: false,
      start: '09:00',
      end: '17:00',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
      timezone: 'UTC',
    },
    omnipresentMind: false,
    knowledgeMode: 'rag',
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function makeMockManager(overrides?: Partial<SoulManager>): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    listPersonalities: vi.fn().mockResolvedValue({ personalities: [PERSONALITY], total: 1 }),
    createPersonality: vi.fn().mockResolvedValue(PERSONALITY),
    updatePersonality: vi.fn().mockResolvedValue(PERSONALITY),
    deletePersonality: vi.fn().mockResolvedValue(undefined),
    setPersonality: vi.fn().mockResolvedValue(undefined),
    getPersonality: vi.fn().mockImplementation(async (id: string) => {
      return id === 'pers-1' ? PERSONALITY : null;
    }),
    listPersonalityPresets: vi.fn().mockReturnValue([]),
    createPersonalityFromPreset: vi.fn().mockResolvedValue(PERSONALITY),
    listSkills: vi.fn().mockResolvedValue({ skills: [], total: 0 }),
    createSkill: vi.fn().mockResolvedValue({}),
    updateSkill: vi.fn().mockResolvedValue({}),
    getSkill: vi.fn().mockResolvedValue(null),
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
    updatePersonalityAvatar: vi.fn().mockResolvedValue(PERSONALITY),
    ...overrides,
  } as unknown as SoulManager;
}

async function buildApp(managerOverrides?: Partial<SoulManager>) {
  const app = Fastify();
  await app.register(multipart);
  const manager = makeMockManager(managerOverrides);
  registerSoulRoutes(app, { soulManager: manager });
  return { app, manager };
}

describe('Personality Export/Import Routes', () => {
  describe('GET /api/v1/soul/personalities/:id/export', () => {
    it('exports as markdown by default', async () => {
      const { app } = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/export',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['content-disposition']).toContain('FRIDAY.md');
      expect(res.body).toContain('---');
      expect(res.body).toContain('name: "FRIDAY"');
      expect(res.body).toContain('# Identity & Purpose');
    });

    it('exports as JSON with format=json', async () => {
      const { app } = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/pers-1/export?format=json',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-disposition']).toContain('FRIDAY.json');
      const body = JSON.parse(res.body);
      expect(body.id).toBe('pers-1');
      expect(body.name).toBe('FRIDAY');
    });

    it('returns 404 for missing personality', async () => {
      const { app } = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/soul/personalities/nonexistent/export',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/soul/personalities/import', () => {
    it('imports a .md file and creates personality', async () => {
      const { app, manager } = await buildApp();
      const mdContent = [
        '---',
        'name: "ImportedBot"',
        'description: "An imported personality"',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'You are ImportedBot.',
        '',
      ].join('\n');

      const boundary = '----FormBoundary123';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="imported.md"',
        'Content-Type: text/markdown',
        '',
        mdContent,
        `--${boundary}--`,
      ].join('\r\n');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(201);
      expect((manager.createPersonality as any).mock.calls.length).toBe(1);
      const callArg = (manager.createPersonality as any).mock.calls[0][0];
      expect(callArg.name).toBe('ImportedBot');
    });

    it('imports a .json file and creates personality', async () => {
      const { app, manager } = await buildApp();
      const jsonContent = JSON.stringify({
        name: 'JSONBot',
        description: 'From JSON',
        systemPrompt: 'You are JSONBot.',
        traits: {},
      });

      const boundary = '----FormBoundary456';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="bot.json"',
        'Content-Type: application/json',
        '',
        jsonContent,
        `--${boundary}--`,
      ].join('\r\n');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(201);
      expect((manager.createPersonality as any).mock.calls.length).toBe(1);
    });

    it('returns warnings from markdown parsing', async () => {
      const { app } = await buildApp();
      const mdContent = [
        '---',
        'name: "WarnBot"',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'Hello.',
        '',
        '# Unknown Section',
        '',
        'Content.',
        '',
      ].join('\n');

      const boundary = '----FormBoundary789';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="warn.md"',
        'Content-Type: text/markdown',
        '',
        mdContent,
        `--${boundary}--`,
      ].join('\r\n');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(201);
      const resBody = JSON.parse(res.body);
      expect(resBody.warnings).toContainEqual(expect.stringContaining('Unknown section'));
    });

    it('rejects invalid markdown (no frontmatter)', async () => {
      const { app } = await buildApp();
      const boundary = '----FormBoundaryBad';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="bad.md"',
        'Content-Type: text/markdown',
        '',
        'no frontmatter here',
        `--${boundary}--`,
      ].join('\r\n');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/soul/personalities/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
