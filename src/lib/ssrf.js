import dns from 'node:dns/promises';

// Routes an address through the same canonicalization new URL() applies, regardless
// of how it originally arrived (typed directly, from dns.resolve6(), fully expanded,
// compressed, whatever). Normalizing first means every check below only ever has to
// handle one canonical shape, not every possible textual variant of it.
function normalizeIp(ip) {
  try {
    const wrapped = ip.includes(':') ? `[${ip}]` : ip;
    return new URL(`http://${wrapped}/`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return ip;
  }
}

// Expands a (possibly ::-compressed) IPv6 address into its full 8 groups, each as a
// 0-65535 integer. Returns null if it isn't a recognizable IPv6 address at all.
//
// This exists because pattern-matching *compressed* IPv6 text is a losing game: the
// same embedded IPv4 address produces genuinely different compressed shapes depending
// on which of its bytes happen to be zero (::ffff:127.0.0.1 -> ::ffff:7f00:1, but
// ::ffff:0.0.1.1 -> ::ffff:101 — one hex group, not two, because the zero group gets
// elided too). Three separate regexes were written and each missed a real case before
// switching to this. Expanding first means every check after this point works with
// fixed array positions and plain numbers — no more shape-guessing.
function expandIpv6(h) {
  if (!h.includes(':')) return null;
  const parts = h.split('::');
  if (parts.length > 2) return null; // malformed — more than one '::'
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((n) => Number.isInteger(n)) ? groups : null;
}

// Checks a 4-tuple of IPv4 octets against every private/reserved range that could
// plausibly be reachable and dangerous if a server-side proxy could reach it.
function isBlockedIpv4([a, b]) {
  if (a === 0) return true;                            // 0.0.0.0/8 — "this network"
  if (a === 127) return true;                           // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;              // 169.254.0.0/16 link-local / cloud metadata
  if (a === 10) return true;                            // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;              // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 CGNAT
  if (a >= 240) return true;                             // 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  return false;
}

function ipv4FromGroups(hi, lo) {
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

// Checks a single resolved IP (IPv4 or IPv6) against private/reserved ranges,
// including every known scheme for embedding an IPv4 address inside an IPv6 one.
export function isBlockedIp(ip) {
  const h = normalizeIp(ip.toLowerCase());

  const m4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m4) return isBlockedIpv4([+m4[1], +m4[2]]);

  const g = expandIpv6(h);
  if (!g) return false; // not a recognizable IP — isBlockedUrl/validateDns handle non-IP hosts separately

  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback
  if (g.every((x) => x === 0)) return true;                            // :: unspecified
  if ((g[0] & 0xffc0) === 0xfe80) return true;                          // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true;                          // fc00::/7 unique-local (ULA)

  // ::ffff:0:0/96 (IPv4-mapped) and ::/96 (deprecated "IPv4-compatible", no ffff
  // marker) both embed a raw IPv4 address in the last 32 bits.
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && (g[5] === 0 || g[5] === 0xffff)) {
    return isBlockedIpv4(ipv4FromGroups(g[6], g[7]));
  }
  // 64:ff9b::/96 — the well-known NAT64 translation prefix (RFC 6052). Real IPv6-only
  // network deployments route this prefix's last 32 bits to the embedded IPv4 address.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isBlockedIpv4(ipv4FromGroups(g[6], g[7]));
  }
  // 2002::/16 — 6to4 (RFC 3056). Embeds the IPv4 address right after the 2002: prefix
  // (bits 16-48), not in the last 32 bits like the schemes above.
  if (g[0] === 0x2002) {
    return isBlockedIpv4(ipv4FromGroups(g[1], g[2]));
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
