/**
 * Init Command — Interactive onboarding for SecureYeoman.
 *
 * Follows the same 5-step flow as the dashboard OnboardingWizard:
 *   1. Personality  — agent name, description, style traits
 *   2. API Keys     — create a dashboard API key (skippable)
 *   3. Security     — 5 key policy toggles (skippable)
 *   4. Model        — AI provider, model name, provider API key
 *   5. Done         — gateway port, database, security key generation
 *
 * Generates a .env file and a secureyeoman.yaml config file.
 * Zero external dependencies — uses Node.js readline for prompts.
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
Mirrors the 5-step dashboard wizard:
  1. Personality — agent name & style
  2. API Keys    — dashboard API key (skippable)
  3. Security    — capability toggles (skippable)
  4. Model       — AI provider & model
  5. Done        — port, database, security keys

Options:
      --url <url>         Server URL for API calls (default: http://127.0.0.1:3000)
      --non-interactive   Use all defaults without prompting
      --env-only          Only generate .env file (skip personality/policy steps)
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

    // Check server reachability upfront so we can tailor step prompts
    let serverReachable = false;
    try {
      const healthResult = await apiCall(baseUrl, '/health');
      serverReachable = healthResult.ok;
    } catch {
      // not running — fall through to config-file path
    }

    if (serverReachable) {
      ctx.stdout.write(`  Server detected at ${baseUrl}\n`);
    } else {
      ctx.stdout.write(`  Server not running — will write config files instead.\n`);
    }

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

    // Security policy defaults (Step 3)
    let allowCodeEditor = true;
    let allowAdvancedEditor = false;
    let allowIntentEditor = true;
    let allowFileSystemAccess = false;
    let allowNetworkAccess = false;
    let securityPolicyChanged = false;

    if (!nonInteractive.value) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const WIZARD_STEPS = envOnly.value ? 2 : 5;
      const step = (n: number, label: string) => {
        ctx.stdout.write(`\n  [${String(n)}/${String(WIZARD_STEPS)}] ${label}\n`);
      };

      // Helper: y/n toggle prompt
      const readToggle = async (label: string, current: boolean): Promise<boolean> => {
        const defaultVal = current ? 'y' : 'n';
        const ans = await prompt(rl, `  ${label} [${defaultVal}]`, defaultVal);
        const lower = ans.trim().toLowerCase();
        return lower === '' ? current : lower === 'y' || lower === 'yes' || lower === '1';
      };

      try {
        if (!envOnly.value) {
          // ── Step 1: Personality — Meet your agent ───────────────────────────
          step(1, 'Personality — Meet your agent');
          const nameInput = await prompt(rl, '  Agent name', 'FRIDAY');
          agentName = nameInput.slice(0, 50);
          description = await prompt(rl, '  Description', description);

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

          // ── Step 2: API Keys — Connect AI providers ─────────────────────────
          step(2, 'API Keys — Connect AI providers');
          if (serverReachable) {
            ctx.stdout.write('  The server is running. You can create a dashboard API key now.\n');
            const createDashKey = await prompt(rl, '  Create a dashboard API key? (y/n/skip)', 'n');
            if (createDashKey.toLowerCase() === 'y') {
              const keyName = await prompt(rl, '  Key name', `${agentName}-cli`);
              try {
                const result = await apiCall(baseUrl, '/api/v1/auth/api-keys', {
                  method: 'POST',
                  body: { name: keyName },
                });
                if (result.ok && (result as { ok: boolean; data?: { key?: string } }).data?.key) {
                  ctx.stdout.write(`\n  Dashboard API key created (save this — shown once):\n`);
                  ctx.stdout.write(
                    `    ${String((result as { ok: boolean; data?: { key?: string } }).data?.key)}\n`
                  );
                }
              } catch {
                ctx.stdout.write('  (Could not create dashboard API key — skipping)\n');
              }
            } else {
              ctx.stdout.write('  Skipping dashboard API key creation.\n');
            }
          } else {
            ctx.stdout.write('  Provider API keys will be prompted in the Model step (Step 4).\n');
            ctx.stdout.write('  Press Enter to continue or type "skip" to skip this step.\n');
            await prompt(rl, '  [Enter to continue]', '');
          }

          // ── Step 3: Security — Security policy ─────────────────────────────
          step(3, 'Security — Security policy');
          ctx.stdout.write('  Configure which capabilities your agent is allowed to use.\n');
          ctx.stdout.write('  Press Enter to keep each default (y = allow, n = deny).\n\n');

          const prev = {
            allowCodeEditor,
            allowAdvancedEditor,
            allowIntentEditor,
            allowFileSystemAccess,
            allowNetworkAccess,
          };

          allowCodeEditor = await readToggle('Allow Code Editor?', allowCodeEditor);
          allowAdvancedEditor = await readToggle('Allow Advanced Editor?', allowAdvancedEditor);
          allowIntentEditor = await readToggle('Allow Intent Editor?', allowIntentEditor);
          allowFileSystemAccess = await readToggle(
            'Allow File System Access?',
            allowFileSystemAccess
          );
          allowNetworkAccess = await readToggle('Allow Network Tools?', allowNetworkAccess);

          securityPolicyChanged =
            allowCodeEditor !== prev.allowCodeEditor ||
            allowAdvancedEditor !== prev.allowAdvancedEditor ||
            allowIntentEditor !== prev.allowIntentEditor ||
            allowFileSystemAccess !== prev.allowFileSystemAccess ||
            allowNetworkAccess !== prev.allowNetworkAccess;

          const applyPolicy = await prompt(rl, '  Apply these settings? (y/skip)', 'y');
          if (applyPolicy.toLowerCase() === 'skip') {
            securityPolicyChanged = false;
          }
        }

        // ── Step 4 (full) / Step 1 (env-only): Model — Default model ─────────
        step(envOnly.value ? 1 : 4, 'Model — Default model');
        provider = (await promptChoice(rl, '  AI provider?', [...PROVIDERS], 0)) as Provider;

        const pDef = PROVIDER_DEFAULTS[provider];
        const modelInput = await prompt(rl, '  Model name', pDef.model);
        modelName = modelInput || pDef.model;

        if (pDef.needsBaseUrl) {
          ollamaBaseUrl = await prompt(rl, '  Ollama base URL', ollamaBaseUrl);
        } else if (pDef.apiKeyEnv) {
          apiKey = await prompt(rl, `  ${pDef.apiKeyEnv} (leave blank to skip)`, '');
        }

        // ── Step 5 (full) / Step 2 (env-only): Infrastructure & keys ─────────
        step(envOnly.value ? 2 : 5, 'Done — Server & security keys');
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

    // ── Apply security policy via API (if server running & policy changed) ────

    if (serverReachable && securityPolicyChanged) {
      try {
        await apiCall(baseUrl, '/api/v1/security/policy', {
          method: 'PATCH',
          body: {
            allowCodeEditor,
            allowAdvancedEditor,
            allowIntentEditor,
            allowNetworkTools: allowNetworkAccess,
          },
        });
        ctx.stdout.write('\n  Security policy updated via API.\n');
      } catch {
        ctx.stdout.write('\n  (Could not update security policy — config defaults will apply)\n');
      }
    }

    // ── Generate security keys ────────────────────────────────────────────────

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

    // ── Complete onboarding via API or write config file ──────────────────────

    if (!envOnly.value) {
      if (serverReachable) {
        try {
          const result = await apiCall(baseUrl, '/api/v1/soul/onboarding/complete', {
            method: 'POST',
            body: {
              agentName,
              name: `${agentName} Default`,
              description,
              traits: { formality, humor, verbosity },
            },
          });

          if (result.ok) {
            ctx.stdout.write(`\n  Onboarding completed via API.\n`);
            ctx.stdout.write(`  Agent "${agentName}" is ready.\n`);
            printNextSteps(ctx);
            return 0;
          }
        } catch {
          // fall through to config file
        }
      }

      // Write secureyeoman.yaml when server is not available
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
        'security:',
        `  allowCodeEditor: ${String(allowCodeEditor)}`,
        `  allowAdvancedEditor: ${String(allowAdvancedEditor)}`,
        `  allowIntentEditor: ${String(allowIntentEditor)}`,
        `  allowFileSystemAccess: ${String(allowFileSystemAccess)}`,
        `  allowNetworkTools: ${String(allowNetworkAccess)}`,
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
