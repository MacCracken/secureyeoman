/**
 * IP Address Utilities — normalization and classification.
 *
 * IPv6-mapped IPv4 addresses (e.g. `::ffff:192.168.1.1`) are normalized
 * to their IPv4 form so that per-IP tracking in rate limiters, reputation
 * systems, and connection limiters treats them as the same client.
 */

/**
 * Normalize an IP address:
 *  - Strip `::ffff:` IPv6-mapped IPv4 prefix
 *  - Trim whitespace
 *  - Fallback to 'unknown' for empty/null values
 */
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return 'unknown';
  const trimmed = ip.trim();
  if (!trimmed) return 'unknown';
  // IPv6-mapped IPv4: ::ffff:192.168.1.1 → 192.168.1.1
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

/**
 * Check if an IP address belongs to a private/loopback range.
 * Covers 127.0.0.0/8, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
 */
export function isPrivateIp(ip: string): boolean {
  const addr = normalizeIp(ip);

  if (addr === '127.0.0.1' || addr === '::1' || addr === 'localhost') return true;
  if (addr.startsWith('10.') || addr.startsWith('192.168.')) return true;

  // 172.16.0.0/12 → second octet 16–31
  if (addr.startsWith('172.')) {
    const secondOctet = Number(addr.split('.')[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return false;
}
