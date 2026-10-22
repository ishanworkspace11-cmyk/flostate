import dns from 'dns/promises';
import net from 'net';

export class SsrfError extends Error {
  public readonly isPermanent = true;
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/**
 * Checks if a given IP address belongs to loopback, private, link-local,
 * multicast, carrier-grade NAT, or cloud metadata ranges.
 */
export function isPrivateOrBlockedIp(ipAddress: string): boolean {
  let ip = ipAddress.trim();

  // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  const family = net.isIP(ip);
  if (!family) {
    return true; // Malformed IP is blocked
  }

  if (family === 4) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 10.0.0.0/8 (Private)
    if (a === 10) return true;

    // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && parts[2] === 0) return true;

    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation/TEST-NET)
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;

    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 (Reserved / Future use) & 255.255.255.255 (Broadcast)
    if (a >= 240) return true;

    return false;
  }

  if (family === 6) {
    const norm = ip.toLowerCase();

    // ::1 (Loopback)
    if (norm === '::1' || norm === '0:0:0:0:0:0:0:1') return true;

    // :: (Unspecified)
    if (norm === '::' || norm === '0:0:0:0:0:0:0:0') return true;

    // fe80::/10 (Link-local)
    if (norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) {
      return true;
    }

    // fc00::/7 (Unique local address: fc00::/8 and fd00::/8)
    if (norm.startsWith('fc') || norm.startsWith('fd')) {
      return true;
    }

    // ff00::/8 (Multicast)
    if (norm.startsWith('ff')) return true;

    return false;
  }

  return true;
}

/**
 * Validates a target outbound URL against SSRF vulnerabilities.
 * Checks protocol, parses hostname, blocks loopback/private/link-local ranges,
 * and performs DNS lookup to ensure domain does not resolve to private/metadata IPs.
 */
export async function validateSsrfTargetUrl(
  urlString: string,
  options: { allowLoopbackForTests?: boolean } = {}
): Promise<{ url: URL; resolvedIp?: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch (_err) {
    throw new SsrfError(`Invalid URL format: "${urlString}"`);
  }

  // 1. Enforce allowed schemes
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new SsrfError(
      `SSRF Safeguard: Protocol "${parsedUrl.protocol}" is forbidden. Only "http:" and "https:" are allowed.`
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // 2. Block prohibited hostnames directly
  const prohibitedHostnames = [
    'localhost',
    'metadata.google.internal',
    'instance-data',
    'metadata',
  ];

  const isLocalhostName =
    prohibitedHostnames.includes(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal');

  if (isLocalhostName) {
    if (options.allowLoopbackForTests || process.env.ALLOW_SSRF_LOOPBACK_FOR_TESTS === 'true') {
      return { url: parsedUrl, resolvedIp: '127.0.0.1' };
    }
    throw new SsrfError(`SSRF Safeguard: Outbound request to local or internal domain "${hostname}" is prohibited.`);
  }

  // 3. Check if hostname is an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      if (options.allowLoopbackForTests || process.env.ALLOW_SSRF_LOOPBACK_FOR_TESTS === 'true') {
        return { url: parsedUrl, resolvedIp: hostname };
      }
      throw new SsrfError(
        `SSRF Safeguard: Direct connection to private, loopback, or metadata IP "${hostname}" is prohibited.`
      );
    }
    return { url: parsedUrl, resolvedIp: hostname };
  }

  // 4. Resolve domain via DNS and verify all resolved addresses
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new SsrfError(`SSRF Safeguard: Unable to resolve hostname "${hostname}".`);
    }

    for (const addr of addresses) {
      if (isPrivateOrBlockedIp(addr.address)) {
        if (options.allowLoopbackForTests || process.env.ALLOW_SSRF_LOOPBACK_FOR_TESTS === 'true') {
          return { url: parsedUrl, resolvedIp: addr.address };
        }
        throw new SsrfError(
          `SSRF Safeguard: Hostname "${hostname}" resolved to restricted IP "${addr.address}". Request blocked.`
        );
      }
    }

    return { url: parsedUrl, resolvedIp: addresses[0].address };
  } catch (err: any) {
    if (err instanceof SsrfError) throw err;
    throw new SsrfError(`SSRF Safeguard: DNS resolution failed for "${hostname}": ${err?.message || err}`);
  }
}
