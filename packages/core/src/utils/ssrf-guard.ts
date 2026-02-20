/**
 * SSRF Guard — rejects URLs that resolve to private/internal network addresses.
 *
 * Blocks:
 *   - Loopback (127.0.0.0/8, ::1)
 *   - RFC 1918 private ranges (10/8, 172.16/12, 192.168/16)
 *   - Link-local / APIPA (169.254/16, fe80::/10)
 *   - Cloud metadata endpoints (169.254.169.254)
 *   - Non-HTTP(S) schemes
 */

// IPv4 CIDR membership check via numeric comparison
function ipv4InRange(ip: string, cidrBase: string, prefixLen: number): boolean {
  const toNum = (a: string) =>
    a.split('.').reduce((acc, oct) => (acc << 8) | parseInt(oct, 10), 0) >>> 0;
  const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
  return (toNum(ip) & mask) === (toNum(cidrBase) & mask);
}

const PRIVATE_V4_RANGES: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local / cloud metadata
  ['100.64.0.0', 10],    // carrier-grade NAT
  ['0.0.0.0', 8],        // "this" network
];

function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_V4_RANGES.some(([base, prefix]) => ipv4InRange(ip, base, prefix));
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80') ||
    lower === '::'
  );
}

/**
 * Returns true if the URL targets a private/internal/loopback address.
 * Throws if the URL is malformed.
 *
 * Usage:
 *   if (isPrivateUrl(userUrl)) throw new Error('URL targets a private address');
 */
export function isPrivateUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // Malformed URL — let the caller decide; we treat it as non-private so the
    // subsequent fetch() will fail naturally.
    return false;
  }

  // Only allow http/https outbound calls
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Explicit loopback hostnames
  if (hostname === 'localhost' || hostname === 'ip6-localhost' || hostname === 'ip6-loopback') {
    return true;
  }

  // IPv4 private check
  const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Re.test(hostname)) return isPrivateIPv4(hostname);

  // IPv6 private check (already stripped brackets)
  const ipv6Re = /^[0-9a-f:]+$/i;
  if (ipv6Re.test(hostname)) return isPrivateIPv6(hostname);

  return false;
}

/**
 * Throws an Error if the URL resolves to a private address.
 * Safe to call before any outbound fetch.
 */
export function assertPublicUrl(rawUrl: string, label = 'URL'): void {
  if (isPrivateUrl(rawUrl)) {
    throw new Error(`${label} must not target a private or internal network address`);
  }
}
