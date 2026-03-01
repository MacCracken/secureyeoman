#!/usr/bin/env tsx
/**
 * generate-license-key.ts — Maintainer tool for issuing SecureYeoman license keys.
 *
 * Usage:
 *
 *   # 1. First-time setup: generate the Ed25519 signing keypair
 *   npx tsx scripts/generate-license-key.ts --init
 *
 *   # 2. Issue an enterprise license key
 *   npx tsx scripts/generate-license-key.ts \
 *     --org "Acme Corp" \
 *     --tier enterprise \
 *     --seats 50 \
 *     --features adaptive_learning,sso_saml,cicd_integration \
 *     --expires 365
 *
 *   # 3. Issue a perpetual key (no expiry)
 *   npx tsx scripts/generate-license-key.ts \
 *     --org "Acme Corp" \
 *     --tier enterprise \
 *     --seats 100 \
 *     --features adaptive_learning,sso_saml,multi_tenancy,cicd_integration,advanced_observability
 *
 * The private key is read from .license-private.pem (gitignored).
 * Never share or commit .license-private.pem.
 *
 * After running --init, copy the printed public key PEM into:
 *   packages/core/src/licensing/license-manager.ts → PUBLIC_KEY_PEM
 */

import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const PRIVATE_KEY_PATH = '.license-private.pem';

type EnterpriseFeature =
  | 'adaptive_learning'
  | 'sso_saml'
  | 'multi_tenancy'
  | 'cicd_integration'
  | 'advanced_observability';

const VALID_FEATURES: EnterpriseFeature[] = [
  'adaptive_learning',
  'sso_saml',
  'multi_tenancy',
  'cicd_integration',
  'advanced_observability',
];

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

function initKeypair(): void {
  if (existsSync(PRIVATE_KEY_PATH)) {
    console.error(`\n⚠  ${PRIVATE_KEY_PATH} already exists. Delete it first to regenerate.\n`);
    process.exit(1);
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });

  console.log('\n✅ Ed25519 keypair generated.\n');
  console.log(`Private key saved to: ${PRIVATE_KEY_PATH}  (keep secret, never commit)\n`);
  console.log('Public key (embed in packages/core/src/licensing/license-manager.ts → PUBLIC_KEY_PEM):\n');
  console.log(publicKey);
  console.log('\nDone. Now update PUBLIC_KEY_PEM in license-manager.ts with the key above.\n');
}

function issueKey(args: Record<string, string>): void {
  if (!existsSync(PRIVATE_KEY_PATH)) {
    console.error(`\n❌ ${PRIVATE_KEY_PATH} not found. Run --init first.\n`);
    process.exit(1);
  }

  const org = args['org'];
  const tier = args['tier'] ?? 'enterprise';
  const seats = parseInt(args['seats'] ?? '1', 10);
  const featuresRaw = args['features'] ?? '';
  const expiresDays = args['expires'] ? parseInt(args['expires'], 10) : null;

  if (!org) {
    console.error('\n❌ --org is required\n');
    process.exit(1);
  }

  if (tier !== 'enterprise' && tier !== 'community') {
    console.error('\n❌ --tier must be enterprise or community\n');
    process.exit(1);
  }

  const features: EnterpriseFeature[] = featuresRaw
    ? featuresRaw.split(',').map((f) => f.trim() as EnterpriseFeature)
    : [];

  const invalidFeatures = features.filter((f) => !VALID_FEATURES.includes(f));
  if (invalidFeatures.length > 0) {
    console.error(`\n❌ Unknown features: ${invalidFeatures.join(', ')}`);
    console.error(`Valid features: ${VALID_FEATURES.join(', ')}\n`);
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    tier,
    organization: org,
    seats,
    features,
    licenseId: randomUUID(),
    iat: now,
    ...(expiresDays !== null ? { exp: now + expiresDays * 86400 } : {}),
  };

  const header = b64url(Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'LICENSE' })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const message = Buffer.from(`${header}.${payload}`);

  const privateKeyPem = readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const privKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, message, privKey);

  const licenseKey = `${header}.${payload}.${b64url(signature)}`;

  console.log('\n✅ License key issued:\n');
  console.log(licenseKey);
  console.log('\nDetails:');
  console.log(`  Organization : ${org}`);
  console.log(`  Tier         : ${tier}`);
  console.log(`  Seats        : ${seats}`);
  console.log(`  Features     : ${features.length ? features.join(', ') : '(none)'}`);
  console.log(`  License ID   : ${claims.licenseId}`);
  if (expiresDays !== null) {
    const exp = new Date((now + expiresDays * 86400) * 1000);
    console.log(`  Expires      : ${exp.toISOString()} (${expiresDays} days)`);
  } else {
    console.log('  Expires      : never (perpetual)');
  }
  console.log('\nSet on the target instance via:');
  console.log('  SECUREYEOMAN_LICENSE_KEY=<key> in .env');
  console.log('  or: secureyeoman license set <key>\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args['init']) {
  initKeypair();
} else if (args['org'] || args['tier']) {
  issueKey(args);
} else {
  console.log(`
Usage:
  npx tsx scripts/generate-license-key.ts --init
  npx tsx scripts/generate-license-key.ts --org "Org" --tier enterprise --seats 50 --features adaptive_learning,sso_saml --expires 365

Options:
  --init               Generate a new Ed25519 keypair (first-time setup)
  --org <name>         Organization name (required for key issuance)
  --tier <tier>        License tier: enterprise | community (default: enterprise)
  --seats <n>          Seat count (default: 1)
  --features <list>    Comma-separated features to enable:
                         adaptive_learning, sso_saml, multi_tenancy,
                         cicd_integration, advanced_observability
  --expires <days>     Expiry in days from now (omit for perpetual)
`);
}
