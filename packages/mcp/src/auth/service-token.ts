/**
 * Self-mint a service JWT for MCP → Core authentication.
 *
 * Uses the shared SECUREYEOMAN_TOKEN_SECRET (HS256) so no manual token
 * management is needed for the internal MCP service.
 */

import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

/**
 * Mint a long-lived service JWT matching core's exact signing pattern.
 *
 * Claims mirror what core's AuthService produces for admin users:
 *   sub, role, permissions, type, jti — signed with HS256.
 */
export async function mintServiceToken(tokenSecret: string): Promise<string> {
  const secret = new TextEncoder().encode(tokenSecret);

  return new SignJWT({
    sub: 'mcp-service',
    role: 'admin',
    permissions: ['*:*'],
    type: 'access',
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(secret);
}
