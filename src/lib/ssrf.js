import dns from 'node:dns/promises';

// Checks a single resolved IP (IPv4 or IPv6) against private/reserved ranges.
// Also unwraps IPv6-mapped IPv4 (::ffff:x.x.x.x) so those bypass the old explicit-list approach.
export function isBlockedIp(ip) {
  const h = ip.toLowerCase();
  if (h === '::1') return true; // IPv6 loopback
  // fe80::/10 link-local — the /10 only fixes the first 10 bits, so the true range is
  // fe80:: through febf::, not just literal "fe80:" (a plain prefix match would miss fe90::, fea0::, etc).
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;

  // Unwrap ::ffff:x.x.x.x so private IPv4 checks apply
  const v4mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const addr = v4mapped ? v4mapped[1] : h;

  const m = addr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    if (a === 127) return true;                         // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local / metadata
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  }
  return false;
}

export function isBlockedUrl(urlString) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return true; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return true;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (['localhost', '0.0.0.0'].includes(host)) return true;
  return isBlockedIp(host);
}

const LITERAL_IP_RE = /^(\d+\.){3}\d+$/;

// Pre-resolve the hostname and reject if any returned address is private.
// Mitigates DNS rebinding: even if DNS later resolves differently, we at least
// validate the addresses the server's resolver returns before sending the request.
export async function validateDns(hostname) {
  if (LITERAL_IP_RE.test(hostname) || hostname.startsWith('[')) return true; // already checked by isBlockedUrl
  try {
    const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
    const addrs = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];
    // Only block if we got addresses back AND one is private.
    // If resolution fails entirely, allow — fetch() will fail naturally.
    return addrs.length === 0 || addrs.every(a => !isBlockedIp(a));
  } catch {
    return false;
  }
}
