# Security Testing Guide

SecureYeoman includes comprehensive security, load, and chaos testing suites.

## Security Tests

Located in `tests/security/`, these Vitest tests verify security boundaries using Fastify's `inject()` method (no real network required).

### Running Security Tests

```bash
npx vitest run tests/security/
```

### Test Suites

| File | Tests | Description |
|------|-------|-------------|
| `injection.test.ts` | ~20 | SQL injection, XSS, command injection, path traversal |
| `jwt-manipulation.test.ts` | ~10 | Expired tokens, invalid signatures, alg:none, reuse after logout |
| `rate-limit-bypass.test.ts` | ~8 | Rate limit enforcement, IP spoofing, concurrent requests |
| `rbac-enforcement.test.ts` | ~10 | Role-based access control boundaries |
| `audit-integrity.test.ts` | ~8 | Tamper detection, gap detection, concurrent writes |

## Load Tests

Located in `tests/load/`, these use [k6](https://k6.io) (a Go-based load testing tool).

### Prerequisites

```bash
# Install k6
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Running Load Tests

```bash
# Start the SecureYeoman server first
npm run dev --workspace=@secureyeoman/core

# Run all load tests
bash tests/load/run.sh

# Run specific suite
bash tests/load/run.sh api
bash tests/load/run.sh auth
bash tests/load/run.sh ws
bash tests/load/run.sh tasks
```

### Test Suites

| Script | Description | Thresholds |
|--------|-------------|-----------|
| `api-endpoints.js` | Sustained 50 VUs, spike to 200, stress 500 | p95<200ms, p99<500ms, errors<1% |
| `auth-flow.js` | Login/refresh/logout cycle + rate limit verification | p95<200ms |
| `websocket.js` | 50-200 concurrent WebSocket connections | ws_errors<5% |
| `task-creation.js` | Task submission throughput at 100/s | p95<200ms |

### Results

Results are saved to `tests/load/results/` as JSON files. Import into Grafana k6 dashboard for visualization.

## Chaos Tests

Located in `tests/chaos/`, these test system resilience under adverse conditions.

```bash
npx vitest run tests/chaos/
```

### Test Suites

| File | Description |
|------|-------------|
| `db-corruption.test.ts` | SQLite WAL recovery, missing SHM files, concurrent access |
| `crash-recovery.test.ts` | Committed transaction preservation, uncommitted rollback |
| `resource-exhaustion.test.ts` | Large payloads, concurrent readers, rapid schema operations |

## Kubernetes Smoke Test

Located in `tests/k8s/`, a script to validate Helm chart deployment on a local cluster.

### Prerequisites

- [kind](https://kind.sigs.k8s.io/) or [k3d](https://k3d.io/)
- kubectl
- Helm 3

### Running

```bash
bash tests/k8s/smoke-test.sh
```

The smoke test:
1. Creates a local kind/k3d cluster
2. Lints the Helm chart
3. Deploys with minimal configuration (core only, no DB)
4. Waits for rollout, port-forwards, and curls `/health`
5. Runs `helm test` to verify connectivity
6. Cleans up the cluster

Environment variables: `CLUSTER_NAME`, `NAMESPACE`, `TIMEOUT`.

## Proxy Security

When proxy integration is enabled (`MCP_PROXY_ENABLED=true`), the following security properties are maintained:

- **SSRF validation** still applies to the original target URL. Private/reserved IPs (127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, etc.) and blocked hostnames (localhost, metadata.google.internal) are rejected regardless of proxy configuration.
- **Proxy credentials** (API keys, proxy URLs) are never exposed in tool output or error messages.
- **Domain allowlist** (`MCP_ALLOWED_URLS`) is enforced on the target URL, not the proxy URL.

## CI Integration

Security tests run as part of the CI pipeline. See `.github/workflows/ci.yml` for the security test job configuration.

```yaml
security-tests:
  name: Security Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: ".nvmrc"
        cache: "npm"
    - run: npm ci
    - run: npx vitest run tests/security/ tests/chaos/
```
