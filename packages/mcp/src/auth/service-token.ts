/**
 * Self-mint a service JWT for MCP → Core authentication.
 *
 * Uses the shared SECUREYEOMAN_TOKEN_SECRET (HS256) so no manual token
 * management is needed for the internal MCP service.
 */

import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

/**
 * Mint a short-lived service JWT matching core's exact signing pattern.
 *
 * Claims mirror what core's AuthService produces, but scoped to only the
 * permissions the MCP service actually needs.  The 1h TTL is paired with
 * automatic refresh in CoreApiClient.refreshTokenIfNeeded() so the service
 * never holds a long-lived credential.
 */
export async function mintServiceToken(tokenSecret: string): Promise<string> {
  const secret = new TextEncoder().encode(tokenSecret);

  return new SignJWT({
    sub: 'mcp-service',
    role: 'service',
    permissions: [
      'mcp:execute',
      'mcp:read',
      'brain:read',
      'brain:write',
      'soul:read',
      'internal:read',
    ],
    type: 'access',
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}
