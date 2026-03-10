/**
 * Shared OAuth fetch utilities for integration routes.
 *
 * Extracts the two patterns that repeat across every OAuth-backed integration:
 *   1. fetchWithOAuthRetry — fetch + single 401-recovery via token refresh
 *   2. createApiErrorFormatter — factory for human-readable HTTP error messages
 *
 * Usage:
 *   const fetchGithub = (url, opts, tokenId, token) =>
 *     fetchWithOAuthRetry(url, opts, { Authorization: `Bearer ${token}`, ...githubHeaders }, tokenId, token, oauthTokenService);
 */

import type { OAuthTokenService } from '../gateway/oauth-token-service.js';

/**
 * Perform a fetch with automatic 401 recovery.
 *
 * On a 401 response the token is force-refreshed and the request is retried
 * once with the new access token. If refresh fails or returns the same stale
 * token, the original 401 response is returned unchanged.
 *
 * @param url          Full request URL
 * @param opts         Base RequestInit (headers merged with authHeaders)
 * @param authHeaders  Authorization headers for the first attempt
 * @param tokenId      Token record ID used for force-refresh
 * @param accessToken  Current access token (used to detect stale-refresh)
 * @param svc          OAuthTokenService instance
 * @param refreshHeaders  Authorization headers override for the retry attempt (defaults to authHeaders with the new token replacing the Bearer value)
 */
export async function fetchWithOAuthRetry(
  url: string,
  opts: RequestInit,
  authHeaders: Record<string, string>,
  tokenId: string,
  accessToken: string,
  svc: OAuthTokenService,
  buildRefreshHeaders?: (newToken: string) => Record<string, string>
): Promise<Response> {
  const baseHeaders = opts.headers as Record<string, string> | undefined;

  const timeout = AbortSignal.timeout(30_000);
  let resp = await fetch(url, {
    ...opts,
    headers: { ...baseHeaders, ...authHeaders },
    signal: timeout,
  });

  if (resp.status === 401) {
    const newToken = await svc.forceRefreshById(tokenId);
    if (newToken && newToken !== accessToken) {
      const retryHeaders = buildRefreshHeaders
        ? buildRefreshHeaders(newToken)
        : { ...authHeaders, Authorization: `Bearer ${newToken}` };

      resp = await fetch(url, {
        ...opts,
        headers: { ...baseHeaders, ...retryHeaders },
        signal: AbortSignal.timeout(30_000),
      });
    }
  }

  return resp;
}

/**
 * Build a human-readable API error message.
 *
 * Provides generic 401 and default messages for any integration. Pass
 * `overrides` to inject service-specific 403, 404, or other messages.
 *
 * @param apiName   Display name (e.g. 'GitHub', 'Gmail')
 * @param overrides Map of HTTP status → message string or message builder
 */
export function createApiErrorFormatter(
  apiName: string,
  overrides?: Partial<Record<number, string | ((body: string) => string)>>
): (status: number, body: string) => string {
  return (status: number, body: string): string => {
    const override = overrides?.[status];
    if (override !== undefined) {
      return typeof override === 'function' ? override(body) : override;
    }
    if (status === 401) {
      return `${apiName} authentication failed: your access token is invalid or expired. Please reconnect your ${apiName} account via Settings → Connections → OAuth.`;
    }
    return `${apiName} API error (${status}): ${body}`;
  };
}
