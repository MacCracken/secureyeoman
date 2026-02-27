/**
 * OpaClient — Phase 50: Governance Hardening
 *
 * Thin wrapper around the OPA REST API (v1).
 * Used to upload Rego policies and evaluate decisions.
 *
 * Security note: OPA capabilities must disable http.send and
 * net.lookup_ip_addr before accepting user-authored Rego.
 * The docker-compose OPA service is configured accordingly.
 */

// ─── OpaClient ────────────────────────────────────────────────────────────────

export class OpaClient {
  private readonly addr: string;

  constructor(addr: string) {
    // Strip trailing slash
    this.addr = addr.replace(/\/$/, '');
  }

  /**
   * Returns an OpaClient if OPA_ADDR env var is set, otherwise null.
   * Callers should treat null as "OPA not available" and fall back to
   * natural-language rule matching.
   */
  static fromEnv(): OpaClient | null {
    const addr = process.env.OPA_ADDR;
    return addr ? new OpaClient(addr) : null;
  }

  /**
   * Upload a Rego policy source to OPA.
   * OPA policy IDs must be alphanumeric with underscores/hyphens.
   * Throws on non-2xx HTTP responses.
   */
  async uploadPolicy(id: string, rego: string): Promise<void> {
    const resp = await fetch(`${this.addr}/v1/policies/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: rego,
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`OPA uploadPolicy failed (${resp.status}): ${body}`);
    }
  }

  /**
   * Delete a Rego policy from OPA.
   * Ignores 404 (policy not found — already removed or never uploaded).
   */
  async deletePolicy(id: string): Promise<void> {
    const resp = await fetch(`${this.addr}/v1/policies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.text().catch(() => '');
      throw new Error(`OPA deletePolicy failed (${resp.status}): ${body}`);
    }
  }

  /**
   * Evaluate a decision at the given OPA data path.
   * Returns the boolean `result` field from OPA's response.
   *
   * Convention: path is `package_name/allow` — e.g. "boundary_hb1/allow".
   *
   * Returns null on OPA unavailability (network error / timeout),
   * allowing callers to fall back to local evaluation.
   */
  async evaluate(path: string, input: Record<string, unknown>): Promise<boolean | null> {
    try {
      const resp = await fetch(`${this.addr}/v1/data/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return null;
      const body = (await resp.json()) as { result?: unknown };
      if (typeof body.result === 'boolean') return body.result;
      return null;
    } catch {
      return null;
    }
  }

  /** Liveness check — returns true if OPA is reachable. */
  async isHealthy(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.addr}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
