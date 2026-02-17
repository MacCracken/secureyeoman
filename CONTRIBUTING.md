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
- Git

### First Time Setup

```bash
# Clone the repository
git clone https://github.com/MacCracken/secureyeoman.git
cd friday

# Install dependencies
npm install

# Set required environment variables
export SECUREYEOMAN_SIGNING_KEY="your-signing-key-at-least-32-chars"
export SECUREYEOMAN_TOKEN_SECRET="your-token-secret-at-least-32-chars"
export SECUREYEOMAN_ENCRYPTION_KEY="your-encryption-key-at-least-32-chars"
export SECUREYEOMAN_ADMIN_PASSWORD="your-admin-password-at-least-32-chars"
export ANTHROPIC_API_KEY="sk-ant-..."

# Start development server
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific package
npm test --workspace=@friday/core

# Run tests with coverage
npm test -- --coverage
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
│       └── *.test.ts
├── core/
│   └── src/
│       └── *.test.ts
└── dashboard/
    └── src/
        └── *.test.ts
```

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm test:integration

# Security + chaos tests
npx vitest run tests/security/ tests/chaos/

# Watch mode
npm test -- --watch
```

### Test Coverage

- Aim for 80%+ coverage on new code
- Test critical paths and error cases
- Use descriptive test names

### Testing MCP Features

When adding or modifying MCP tools:

```bash
# Run MCP package tests
cd packages/mcp && npx vitest run

# Run specific test file
cd packages/mcp && npx vitest run src/tools/web-tools.test.ts
```

- **Web tools**: Use mock `fetch` for tests that would make HTTP requests. Test SSRF protection with private IPs, localhost, and cloud metadata endpoints.
- **Browser tools**: Test placeholder behavior (should return "not yet available" until engine is integrated).
- **Health monitoring**: Mock `McpStorage` and test health check logic, auto-disable thresholds, and timer lifecycle.
- **Credential management**: Test encryption/decryption roundtrips with mocked storage. Verify IV randomization (same plaintext produces different ciphertexts).
- **Config loader**: Test all new env vars (`MCP_EXPOSE_WEB`, `MCP_ALLOWED_URLS`, `MCP_EXPOSE_BROWSER`, etc.) with the `loadConfig()` function.

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

## Versioning

SecureYeoman uses **calendar versioning** (`YYYY.M.D`). The version is the release date — e.g., `2026.2.16` for February 16, 2026.

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