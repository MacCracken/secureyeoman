/**
 * Init Command — Interactive onboarding for SecureYeoman.
 *
 * Prompts for agent name, personality traits, AI provider, model, database
 * backend, and gateway port.  Generates security keys and writes a .env file
 * and a secureyeoman.yaml config file.  Zero external dependencies — uses
 * Node.js readline for prompts.
 */

import { createInterface } from 'node:readline';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { Command, CommandContext } from '../router.js';
import {
  extractBoolFlag,
  extractCommonFlags,
  generateSecretKey,
  prompt,
  promptChoice,
  apiCall,
} from '../utils.js';

// ─── Provider defaults ────────────────────────────────────────────────────────

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'ollama', 'deepseek', 'mistral'] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_DEFAULTS: Record<
  Provider,
  { model: string; apiKeyEnv: string; needsBaseUrl: boolean }
> = {
  anthropic: {
    model: 'claude-sonnet-4-6',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    needsBaseUrl: false,
  },
  openai: { model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY', needsBaseUrl: false },
  gemini: { model: 'gemini-2.0-flash', apiKeyEnv: 'GEMINI_API_KEY', needsBaseUrl: false },
  ollama: { model: 'llama3.2', apiKeyEnv: '', needsBaseUrl: true },
  deepseek: { model: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY', needsBaseUrl: false },
  mistral: { model: 'mistral-large-latest', apiKeyEnv: 'MISTRAL_API_KEY', needsBaseUrl: false },
};

// ─── Command ──────────────────────────────────────────────────────────────────

export const initCommand: Command = {
  name: 'init',
  description: 'Interactive onboarding wizard',
  usage: 'secureyeoman init [--url URL] [--non-interactive] [--env-only]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    // --help
    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Set up a new SecureYeoman instance interactively.

Options:
      --url <url>         Server URL for API calls (default: http://127.0.0.1:3000)
      --non-interactive   Use all defaults without prompting
      --env-only          Only generate .env file (skip personality setup and YAML)
  -h, --help              Show this help
\n`);
      return 0;
    }
    argv = helpResult.rest;

    const { baseUrl, rest: argvAfterFlags } = extractCommonFlags(argv);
    argv = argvAfterFlags;
    const nonInteractive = extractBoolFlag(argv, 'non-interactive');
    argv = nonInteractive.rest;
    const envOnly = extractBoolFlag(argv, 'env-only');

    ctx.stdout.write(`
  ╔════════════════════════════════════════════════╗
  ║         SecureYeoman Setup Wizard              ║
  ║  Configure your AI agent in under 2 minutes.  ║
  ╚════════════════════════════════════════════════╝
\n`);

    // ── Defaults ─────────────────────────────────────────────────────────────

    let agentName = 'FRIDAY';
    let description = 'Friendly, Reliable, Intelligent Digital Assistant Yielding results';
    let formality: 'casual' | 'balanced' | 'formal' = 'balanced';
    let humor: 'none' | 'subtle' | 'witty' = 'subtle';
    let verbosity: 'concise' | 'balanced' | 'detailed' = 'balanced';
    let provider: Provider = 'anthropic';
    let modelName = PROVIDER_DEFAULTS.anthropic.model;
    let apiKey = '';
    let ollamaBaseUrl = 'http://localhost:11434';
    let gatewayPort = 3000;
    let dbBackend: 'sqlite' | 'postgresql' = 'sqlite';
    let databaseUrl = '';
    let generateKeys = true;
    let writeEnvFile = true;

    if (!nonInteractive.value) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const totalSteps = envOnly.value ? 5 : 8;
      const step = (n: number, label: string) => {
        ctx.stdout.write(`\n  [${String(n)}/${String(totalSteps)}] ${label}\n`);
      };

      try {
        // ── Step 1: Agent name ────────────────────────────────────────────────
        step(1, 'Agent identity');
        const nameInput = await prompt(rl, '  Agent name', 'FRIDAY');
        agentName = nameInput.slice(0, 50);

        if (!envOnly.value) {
          // ── Step 2–4: Personality ─────────────────────────────────────────
          step(2, 'Personality — description');
          description = await prompt(rl, '  Description', description);

          step(3, 'Personality — style');
          const formalityChoices = ['casual', 'balanced', 'formal'];
          formality = (await promptChoice(
            rl,
            '  Formality level?',
            formalityChoices,
            1
          )) as typeof formality;

          const humorChoices = ['none', 'subtle', 'witty'];
          humor = (await promptChoice(rl, '  Humor style?', humorChoices, 1)) as typeof humor;

          const verbosityChoices = ['concise', 'balanced', 'detailed'];
          verbosity = (await promptChoice(
            rl,
            '  Verbosity?',
            verbosityChoices,
            1
          )) as typeof verbosity;
        }

        // ── Step (env-only:2, full:5): AI Provider ────────────────────────────
        step(envOnly.value ? 2 : 5, 'AI provider & model');
        provider = (await promptChoice(rl, '  AI provider?', [...PROVIDERS], 0)) as Provider;

        const pDef = PROVIDER_DEFAULTS[provider];

        const modelInput = await prompt(rl, '  Model name', pDef.model);
        modelName = modelInput || pDef.model;

        // ── Step (env-only:3, full:6): API key / base URL ─────────────────────
        if (pDef.needsBaseUrl || pDef.apiKeyEnv) {
          step(envOnly.value ? 3 : 6, 'Authentication');
          if (pDef.needsBaseUrl) {
            ollamaBaseUrl = await prompt(rl, '  Ollama base URL', ollamaBaseUrl);
          } else if (pDef.apiKeyEnv) {
            apiKey = await prompt(rl, `  ${pDef.apiKeyEnv} (leave blank to skip)`, '');
          }
        }

        // ── Step (env-only:4, full:7): Gateway port & database ───────────────
        step(envOnly.value ? 4 : 7, 'Server & database');
        const portInput = await prompt(rl, '  Gateway port', '3000');
        gatewayPort = Math.max(1024, Math.min(65535, parseInt(portInput, 10) || 3000));

        const dbChoices = ['sqlite', 'postgresql'];
        dbBackend = (await promptChoice(rl, '  Database backend?', dbChoices, 0)) as
          | 'sqlite'
          | 'postgresql';

        if (dbBackend === 'postgresql') {
          databaseUrl = await prompt(
            rl,
            '  DATABASE_URL',
            'postgresql://user:pass@localhost/secureyeoman'
          );
        }

        // ── Step (env-only:5, full:8): Security keys ──────────────────────────
        step(envOnly.value ? 5 : 8, 'Security keys');
        const keysAnswer = await prompt(rl, '  Generate security keys? (y/n)', 'y');
        generateKeys = keysAnswer.toLowerCase() !== 'n';

        if (generateKeys) {
          const envAnswer = await prompt(rl, '  Write .env file? (y/n)', 'y');
          writeEnvFile = envAnswer.toLowerCase() !== 'n';
        }
      } finally {
        rl.close();
      }
    }

    // ── Generate keys ─────────────────────────────────────────────────────────

    const keys: Record<string, string> = {};
    if (generateKeys) {
      keys.SECUREYEOMAN_SIGNING_KEY = generateSecretKey(32);
      keys.SECUREYEOMAN_TOKEN_SECRET = generateSecretKey(32);
      keys.SECUREYEOMAN_ENCRYPTION_KEY = generateSecretKey(32);
      keys.SECUREYEOMAN_ADMIN_PASSWORD = generateSecretKey(16);

      ctx.stdout.write('\n  Generated security keys:\n');
      for (const [k, v] of Object.entries(keys)) {
        ctx.stdout.write(`    ${k}=${v}\n`);
      }
    }

    // ── Write .env file ───────────────────────────────────────────────────────

    if (generateKeys && writeEnvFile) {
      const envPath = '.env';
      const existingEnv: Record<string, string> = {};

      if (existsSync(envPath)) {
        const content = readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              existingEnv[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
            }
          }
        }
      }

      // Merge: security keys + optional API key + optional DATABASE_URL
      const envAdditions: Record<string, string> = { ...keys };

      const pDef = PROVIDER_DEFAULTS[provider];
      if (!pDef.needsBaseUrl && pDef.apiKeyEnv && apiKey) {
        envAdditions[pDef.apiKeyEnv] = apiKey;
      }
      if (dbBackend === 'postgresql' && databaseUrl) {
        envAdditions.DATABASE_URL = databaseUrl;
      }

      const merged = { ...existingEnv, ...envAdditions };
      const envContent =
        Object.entries(merged)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n') + '\n';

      writeFileSync(envPath, envContent, 'utf-8');
      ctx.stdout.write(`\n  .env file written to ${envPath}\n`);
    }

    // ── Try to call the onboarding API if the server is running ──────────────

    if (!envOnly.value) {
      try {
        const healthResult = await apiCall(baseUrl, '/health');
        if (healthResult.ok) {
          const personalityData = {
            agentName,
            name: `${agentName} Default`,
            description,
            traits: { formality, humor, verbosity },
          };

          const result = await apiCall(baseUrl, '/api/v1/soul/onboarding/complete', {
            method: 'POST',
            body: personalityData,
          });

          if (result.ok) {
            ctx.stdout.write(`\n  Onboarding completed via API.\n`);
            ctx.stdout.write(`  Agent "${agentName}" is ready.\n`);
            printNextSteps(ctx);
            return 0;
          }
        }
      } catch {
        // Server not running — fall through to config file
      }

      // ── Write secureyeoman.yaml ───────────────────────────────────────────

      const pDef = PROVIDER_DEFAULTS[provider];
      const yamlLines = [
        '# SecureYeoman Configuration — generated by `secureyeoman init`',
        `# Generated: ${new Date().toISOString()}`,
        '',
        'core:',
        `  name: "${agentName}"`,
        '',
        'model:',
        `  provider: "${provider}"`,
        `  model: "${modelName}"`,
        pDef.needsBaseUrl
          ? `  baseUrl: "${ollamaBaseUrl}"`
          : `  apiKeyEnv: "${pDef.apiKeyEnv || 'ANTHROPIC_API_KEY'}"`,
        '',
        'gateway:',
        `  port: ${String(gatewayPort)}`,
        '',
        'storage:',
        `  backend: "${dbBackend}"`,
        '',
        'soul:',
        `  agentName: "${agentName}"`,
        '  defaultPersonality:',
        `    name: "${agentName} Default"`,
        `    description: "${description}"`,
        '    traits:',
        `      formality: "${formality}"`,
        `      humor: "${humor}"`,
        `      verbosity: "${verbosity}"`,
        '',
      ];

      const configPath = 'secureyeoman.yaml';
      if (!existsSync(configPath)) {
        writeFileSync(configPath, yamlLines.join('\n'), 'utf-8');
        ctx.stdout.write(`\n  Config written to ${configPath}\n`);
      } else {
        ctx.stdout.write(`\n  ${configPath} already exists — skipping config write.\n`);
      }
    }

    ctx.stdout.write(`\n  Setup complete! Agent "${agentName}" is configured.\n`);
    printNextSteps(ctx);
    return 0;
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printNextSteps(ctx: CommandContext): void {
  ctx.stdout.write('\n  Next steps:\n');
  ctx.stdout.write('    secureyeoman start         — start the gateway server\n');
  ctx.stdout.write('    secureyeoman health        — verify the server is healthy\n');
  ctx.stdout.write('    secureyeoman repl          — interactive REPL shell\n');
  ctx.stdout.write('    secureyeoman integration   — manage integrations\n');
  ctx.stdout.write('\n');
}
