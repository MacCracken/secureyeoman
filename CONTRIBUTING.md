# Contributing to SecureYeoman

We welcome contributions! This guide will help you get started.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Documentation](#documentation)
- [Community](#community)

## Development Setup

### Prerequisites

- Node.js 20 LTS or later
- npm (project uses npm workspaces)
- Docker & Docker Compose (for PostgreSQL; or use a local Postgres installation)
- Git

### First Time Setup

```bash
# Clone the repository
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman

# Install dependencies
npm install

# Copy the developer environment template and fill in your AI provider key(s)
cp .env.dev.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY (or another provider key)

# Start PostgreSQL via Docker Compose
docker compose up -d

# Start development server (builds and watches all packages)
npm run dev
```

### Setting Up the Test Database

The test suite uses a dedicated `secureyeoman_test` database that is separate from the development database. Create it once before running tests:

```bash
# Option A — using createdb (if PostgreSQL client tools are installed)
createdb -U secureyeoman -h localhost secureyeoman_test

# Option B — using Node.js (no pg tools needed)
node --input-type=module <<'EOF'
import pg from 'pg';
const c = new pg.Client({
  host: 'localhost', database: 'postgres',
  user: 'secureyeoman', password: 'secureyeoman_dev',
});
await c.connect();
await c.query('CREATE DATABASE secureyeoman_test');
await c.end();
console.log('Created secureyeoman_test');
EOF
```

Migrations run automatically the first time the test suite starts — no manual migration step needed.

### Running Tests

```bash
# Run all tests (requires secureyeoman_test database to exist)
npm test

# Run tests for a specific package
npm test --workspace=@secureyeoman/core

# Run a single test file
npx vitest run packages/core/src/multimodal/manager.test.ts

# Run tests with coverage
npm test -- --coverage

# Watch mode during development
npm test -- --watch
```

## Code Style

We use automated tools to maintain consistent code quality:

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Style Guidelines

- Use TypeScript strict mode
- Follow ESLint rules
- Use Prettier for formatting
- Write meaningful commit messages
- Include tests for new features

## Testing

### Test Structure

```
packages/
├── shared/
│   └── src/
│       └── *.test.ts          # Type/schema unit tests (no DB required)
├── core/
│   └── src/
│       ├── *.test.ts          # Unit & storage tests (storage tests need secureyeoman_test DB)
│       └── __integration__/   # Full integration tests (need running server + DB)
└── dashboard/
    └── src/
        └── *.test.ts          # React component tests (jsdom, no DB required)
```

**Current totals**: 348 test files · 6326 tests · 6325 passing · 1 intentionally skipped

### Test Categories

| Category | DB Required | Example files |
|----------|-------------|---------------|
| Unit (shared types, utils) | No | `shared/src/types/*.test.ts` |
| Unit (mocked storage) | No | `core/src/multimodal/*.test.ts` |
| Storage (real SQL) | Yes — `secureyeoman_test` | `core/src/brain/brain.test.ts` |
| Dashboard components | No (jsdom) | `dashboard/src/components/*.test.tsx` |
| Integration | Yes — running server | `core/src/__integration__/*.test.ts` |

### Test Coverage

- Aim for 80%+ line/function coverage on new code (enforced by Vitest thresholds)
- Test critical paths and error cases
- Use descriptive test names
- **Mocked-storage tests** (e.g. `multimodal/storage.test.ts`): mock `pg-pool.js` via `vi.mock()` and assert SQL patterns
- **Real-storage tests** (e.g. `brain/brain.test.ts`): call `setupTestDb()` in `beforeAll`, use `truncateAllTables()` in `beforeEach`

### Testing MCP Features

When adding or modifying MCP tools:

```bash
# Run MCP package tests
npx vitest run --workspace=packages/mcp

# Run a specific tool test file
npx vitest run packages/mcp/src/tools/web-tools.test.ts
```

- **Web tools**: Use mock `fetch` for tests that would make HTTP requests. Test SSRF protection with private IPs, localhost, and cloud metadata endpoints.
- **Browser tools**: Test placeholder behavior (should return "not yet available" until engine is integrated).
- **Health monitoring**: Mock `McpStorage` and test health check logic, auto-disable thresholds, and timer lifecycle.
- **Credential management**: Test encryption/decryption roundtrips with mocked storage. Verify IV randomization (same plaintext produces different ciphertexts).
- **Config loader**: Test all new env vars (`MCP_EXPOSE_WEB`, `MCP_ALLOWED_URLS`, `MCP_EXPOSE_BROWSER`, etc.) with the `loadConfig()` function.

### Testing Body Capabilities (Multimodal)

When adding or modifying multimodal capabilities (vision, auditory, haptic, etc.):

```bash
npx vitest run \
  packages/core/src/multimodal/manager.test.ts \
  packages/core/src/multimodal/multimodal-routes.test.ts \
  packages/core/src/multimodal/storage.test.ts
```

These tests use a mocked pg pool — no test database required. Follow the pattern in `manager.test.ts` when adding a new capability:
1. Add the capability config to `defaultConfig` in the test
2. Add a `describe` block with: disabled check, success path, edge cases, extension hook assertion
3. Add the route in `multimodal-routes.test.ts`: valid body, invalid body (Zod rejections), error propagation
4. Add job type coverage in `storage.test.ts`

## Submitting Changes

### Branching Strategy

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/your-feature-name
```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Maintenance tasks

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request
7. Request code review

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] Documentation updated
- [ ] PR description explains changes
- [ ] Breaking changes documented

---

## Contributing Community Skills

Community skills live in `community-skills/skills/<category>/<name>.json`. They are synced into
the marketplace via `POST /api/v1/marketplace/community/sync`.

### Skill JSON Format

```json
{
  "$schema": "../../schema/skill.schema.json",
  "name": "My Skill Name",
  "description": "One- to two-sentence summary of what the skill does.",
  "version": "1.0.0",
  "author": {
    "name": "Your Name",
    "github": "your-github-username",
    "website": "https://yourwebsite.com",
    "license": "MIT"
  },
  "category": "development",
  "tags": ["tag1", "tag2"],
  "instructions": "Detailed instructions for the AI (100+ words recommended)..."
}
```

The `author` field accepts either an object (recommended) or a plain string for backward
compatibility. All fields except `name` and `instructions` are optional.

### Quality Bar

- **Instructions**: Minimum 100 words. The instructions should give the AI model enough context
  to perform the skill reliably across a wide range of inputs.
- **Single clear purpose**: Each skill should do one thing well, not try to be a Swiss Army knife.
- **No hard-coded credentials or URLs**: Instructions must not embed API keys, passwords, or
  specific external service URLs that users would need to change.

### Security Review Checklist

All community skills are reviewed for security before merging. Your skill will be rejected if
it contains:

- [ ] Prompt injection patterns (instructions designed to override system-level constraints)
- [ ] Data exfiltration instructions (instructions that direct the AI to send data to third parties)
- [ ] RBAC bypass instructions (attempts to escalate permissions or impersonate other roles)
- [ ] External URL dependencies without justification (links to resources that could change or disappear)

### Rejection Criteria

Skills will be rejected if they:

- Duplicate an existing community skill without meaningfully improving it
- Contain harmful, deceptive, or manipulative instructions
- Are missing required fields (`name`, `instructions`)
- Provide false author information
- Target a single proprietary platform without documented compatibility with alternatives

### What Reviewers Look For

- **Real use case**: Is this something people actually need? Could it save time or improve quality?
- **Reliable instructions**: Do the instructions work across different AI responses, or only under
  very specific conditions?
- **Compatible license**: The default project license applies. If you specify a different license
  in the `author.license` field, ensure it is compatible with the project.
- **Honest attribution**: The `author` object should reflect the actual author. Do not impersonate
  other contributors or organizations.

## Contributing Community Skills

Community skills live in `community-skills/skills/<category>/<skill-name>.json`. They are synced
into the marketplace registry via `POST /api/v1/marketplace/community/sync`.

### Skill JSON Format

```json
{
  "$schema": "../../schema/skill.schema.json",
  "name": "My Skill Name",
  "description": "One- to two-sentence description.",
  "version": "1.0.0",
  "author": {
    "name": "Your Name",
    "github": "your-github-username",
    "website": "https://yourwebsite.com",
    "license": "MIT"
  },
  "category": "development",
  "tags": ["tag1", "tag2"],
  "instructions": "Detailed instructions for the AI model (minimum 100 words recommended)..."
}
```

The `author` field also accepts a plain string for backward compatibility:
```json
"author": "Your Name"
```

See `community-skills/schema/skill.schema.json` for the full JSON Schema with all allowed
categories and field constraints.

### Quality Bar

Before submitting a community skill, ensure it meets the following quality bar:

- **Instructions** — at least 100 words, clearly describing the skill's purpose and how the AI
  should behave. Vague instructions like "Be helpful about X" will be rejected.
- **Single clear purpose** — the skill does one thing well. Multi-purpose "do everything" skills
  will be asked to be split.
- **No hard-coded credentials or URLs** — instructions must not contain API keys, passwords, or
  fixed internal URLs. Use placeholders like `[YOUR_API_KEY]` instead.
- **Name uniqueness** — check that your skill name does not duplicate an existing skill in the
  community registry.

### Security Review Checklist

All community skill submissions are reviewed for security before acceptance:

- [ ] No prompt injection patterns (e.g., "Ignore all previous instructions")
- [ ] No data exfiltration instructions (e.g., "Send the user's messages to…")
- [ ] No RBAC bypass instructions (e.g., "Act as an admin without checking permissions")
- [ ] No external URL dependencies without justification (document any required URLs in the description)
- [ ] No harmful, offensive, or deceptive content
- [ ] Author information is accurate and not impersonating another contributor

### Rejection Criteria

Pull requests adding community skills will be rejected if:

- The skill is a duplicate of an existing community or built-in skill
- The instructions contain harmful, deceptive, or dangerous content
- Required fields (`name`, `instructions`) are missing or empty
- The `author` information is false or impersonates someone else
- The skill violates the [Code of Conduct](CODE_OF_CONDUCT.md)

### What Reviewers Look For

- **Real use case** — the skill addresses a genuine, repeatable need
- **Reliable instructions** — the instructions produce consistent, high-quality output across
  different AI models and conversation contexts
- **Compatible license** — if the instructions are derived from third-party content, the license
  must be compatible with this project

### Submitting a Community Skill

1. Fork the repository
2. Add your skill JSON to `community-skills/skills/<category>/your-skill-name.json`
3. Validate your JSON against the schema: `npx ajv validate -s community-skills/schema/skill.schema.json -d community-skills/skills/<category>/your-skill-name.json`
4. Submit a pull request with a description explaining the use case
5. Address reviewer feedback

---

## Versioning

SecureYeoman uses **calendar versioning** (`YYYY.M.D`). The version is the release date — e.g., `2026.2.17` for February 17, 2026.

To bump the version across all packages:

```bash
npm run version:set -- 2026.3.1
```

The core server reads its version from `package.json` at runtime, so only `package.json` files need updating.

## Documentation

### Documentation Structure

```
docs/
├── api/                    # API documentation
├── guides/                 # User guides
├── security/              # Security documentation
└── development/           # Development docs
```

### Writing Documentation

- Use clear, concise language
- Include code examples
- Add cross-references
- Update TOC for new sections
- Review for accuracy

## Community

### Getting Help

- [GitHub Issues](https://github.com/MacCracken/secureyeoman/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/MacCracken/secureyeoman/discussions) - Questions and community chat

### Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) and follow it in all interactions.

### Security

For security issues, please see our [Security Policy](SECURITY.md).

Thank you for contributing to SecureYeoman!