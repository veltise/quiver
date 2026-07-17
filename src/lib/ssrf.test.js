import { describe, it, expect, vi, beforeEach } from 'vitest';

// dns.resolve4/resolve6 are mocked per-test so validateDns tests never hit the network.
vi.mock('node:dns/promises', () => ({
  default: { resolve4: vi.fn(), resolve6: vi.fn() },
}));

import dns from 'node:dns/promises';
import { isBlockedIp, isBlockedUrl, validateDns } from './ssrf';

describe('isBlockedIp', () => {
  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('10.255.255.255')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('172.31.255.255')).toBe(true);
    expect(isBlockedIp('192.168.0.1')).toBe(true);
    expect(isBlockedIp('192.168.255.255')).toBe(true);
  });

  it('does not block addresses just outside the 172.16-31 boundary', () => {
    expect(isBlockedIp('172.15.255.255')).toBe(false);
    expect(isBlockedIp('172.32.0.0')).toBe(false);
  });

  it('blocks loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('127.255.255.255')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
  });

  it('blocks the IPv6 unspecified address (::) — same risk class as 0.0.0.0', () => {
    expect(isBlockedIp('::')).toBe(true);
  });

  it('blocks link-local and the cloud metadata address', () => {
    expect(isBlockedIp('169.254.0.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
  });

  it('blocks CGNAT range', () => {
    expect(isBlockedIp('100.64.0.1')).toBe(true);
    expect(isBlockedIp('100.127.255.255')).toBe(true);
    expect(isBlockedIp('100.63.255.255')).toBe(false);
    expect(isBlockedIp('100.128.0.0')).toBe(false);
  });

  it('blocks the full fe80::/10 IPv6 link-local range, not just literal fe80::', () => {
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('fe90::1')).toBe(true);
    expect(isBlockedIp('fea0::1')).toBe(true);
    expect(isBlockedIp('febf::1')).toBe(true);
    expect(isBlockedIp('fec0::1')).toBe(false); // just outside the /10
  });

  it('unwraps IPv6-mapped IPv4 addresses before checking (dotted-decimal form)', () => {
    expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('unwraps IPv6-mapped IPv4 addresses before checking (raw hex-group form)', () => {
    // Node's URL parser can serialize an IPv4-mapped address as two raw hex groups
    // instead of dotted-decimal (e.g. new URL('http://[::ffff:127.0.0.1]/').hostname
    // comes back as '::ffff:7f00:1', not '::ffff:127.0.0.1') — both textual forms are
    // the exact same address and both must be caught, or this is a live SSRF bypass.
    expect(isBlockedIp('::ffff:7f00:1')).toBe(true);   // 127.0.0.1
    expect(isBlockedIp('::ffff:a00:1')).toBe(true);    // 10.0.0.1
    expect(isBlockedIp('::ffff:a9fe:a9fe')).toBe(true); // 169.254.169.254 (cloud metadata)
    expect(isBlockedIp('::ffff:c0a8:1')).toBe(true);   // 192.168.0.1
    expect(isBlockedIp('::ffff:ac10:1')).toBe(true);   // 172.16.0.1
    expect(isBlockedIp('::ffff:808:808')).toBe(false); // 8.8.8.8 — public, must not block
  });

  it('unwraps the deprecated "IPv4-compatible" form too (no ffff: marker)', () => {
    // ::a.b.c.d (and its hex-group form ::HHHH:HHHH) is a separate, older textual
    // encoding of "IPv4 address embedded in IPv6" from ::ffff:a.b.c.d — no ffff marker
    // group at all. Deprecated, but new URL() still parses it and it's still routable
    // as the embedded address on many stacks, so it must be caught the same way.
    expect(isBlockedIp('::10.0.0.1')).toBe(true);
    expect(isBlockedIp('::a00:1')).toBe(true);
    expect(isBlockedIp('::127.0.0.1')).toBe(true);
    expect(isBlockedIp('::a9fe:a9fe')).toBe(true); // 169.254.169.254 (cloud metadata)
    expect(isBlockedIp('::808:808')).toBe(false);  // 8.8.8.8 — public, must not block
  });

  it('blocks fc00::/7 — IPv6 Unique Local Addresses, the IPv6 equivalent of RFC1918 private space', () => {
    expect(isBlockedIp('fc00::1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
    expect(isBlockedIp('fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true); // top of range
    expect(isBlockedIp('fbff::1')).toBe(false); // just outside the /7 — must not over-block
    expect(isBlockedIp('fe00::1')).toBe(false); // gap between ULA and fe80::/10 link-local
  });

  it('normalizes any textual IPv6 shape (expanded, mixed-case) before checking, not just what new URL() would produce', () => {
    // isBlockedIp is also called from validateDns with dns.resolve6() results, which
    // may not go through the URL parser's canonicalization at all — it has to normalize
    // on its own rather than assume its input already looks like new URL() output.
    expect(isBlockedIp('0:0:0:0:0:0:0:1')).toBe(true); // fully-expanded ::1
    expect(isBlockedIp('FC00::1')).toBe(true);          // uppercase ULA
  });

  it('blocks 0.0.0.0/8 ("this network") beyond the single address 0.0.0.0', () => {
    expect(isBlockedIp('0.0.0.0')).toBe(true);
    expect(isBlockedIp('0.1.2.3')).toBe(true);
  });

  it('blocks 240.0.0.0/4 (reserved) and the broadcast address 255.255.255.255', () => {
    expect(isBlockedIp('240.0.0.1')).toBe(true);
    expect(isBlockedIp('255.255.255.255')).toBe(true);
    expect(isBlockedIp('239.255.255.255')).toBe(false); // just outside the /4 (multicast, not blocked)
  });

  it('unwraps NAT64 addresses (64:ff9b::/96, RFC 6052)', () => {
    expect(isBlockedIp('64:ff9b::7f00:1')).toBe(true);   // 127.0.0.1
    expect(isBlockedIp('64:ff9b::a9fe:a9fe')).toBe(true); // 169.254.169.254 (cloud metadata)
    expect(isBlockedIp('64:ff9b::808:808')).toBe(false);  // 8.8.8.8 — public, must not block
  });

  it('unwraps 6to4 addresses (2002::/16, RFC 3056) — IPv4 embedded right after the prefix, not in the last 32 bits', () => {
    expect(isBlockedIp('2002:7f00:1::')).toBe(true);   // 127.0.0.1
    expect(isBlockedIp('2002:a9fe:a9fe::')).toBe(true); // 169.254.169.254 (cloud metadata)
    expect(isBlockedIp('2002:808:808::')).toBe(false);  // 8.8.8.8 — public, must not block
  });

  it('catches an embedded private IPv4 regardless of how IPv6 compression elides the surrounding zero group', () => {
    // The same embedded IPv4 address can produce a different number of hex groups
    // after :: compression depending on which of its bytes are zero — e.g. 0.0.1.1
    // has a leading zero 16-bit group that gets compressed away too, leaving only
    // ONE hex group after the prefix instead of two. A regex expecting a fixed
    // group count misses this; expanding to 8 groups first does not.
    expect(isBlockedIp('::ffff:0.0.1.1')).toBe(true);     // 0.0.1.1 is in 0.0.0.0/8
    expect(isBlockedIp('64:ff9b::0.0.1.1')).toBe(true);
  });

  it('allows ordinary public IPs', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(false); // real public IPv6 (Google DNS)
  });
});

describe('isBlockedUrl', () => {
  it('rejects non-http(s) protocols', () => {
    expect(isBlockedUrl('file:///etc/passwd')).toBe(true);
    expect(isBlockedUrl('ftp://example.com')).toBe(true);
    expect(isBlockedUrl('gopher://example.com')).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(isBlockedUrl('not a url')).toBe(true);
    expect(isBlockedUrl('')).toBe(true);
  });

  it('rejects localhost and 0.0.0.0 by name', () => {
    expect(isBlockedUrl('http://localhost/')).toBe(true);
    expect(isBlockedUrl('http://localhost:8080/')).toBe(true);
    expect(isBlockedUrl('http://0.0.0.0/')).toBe(true);
  });

  it('rejects a literal private IP regardless of port', () => {
    expect(isBlockedUrl('http://10.0.0.5:5432/')).toBe(true);
    expect(isBlockedUrl('http://169.254.169.254/latest/meta-data/')).toBe(true);
  });

  it('allows ordinary public URLs', () => {
    expect(isBlockedUrl('https://api.stripe.com/v1/charges')).toBe(false);
    expect(isBlockedUrl('http://example.com')).toBe(false);
  });
});

describe('validateDns', () => {
  beforeEach(() => {
    vi.mocked(dns.resolve4).mockReset();
    vi.mocked(dns.resolve6).mockReset();
  });

  it('allows a hostname that resolves only to public IPs', async () => {
    dns.resolve4.mockResolvedValue(['93.184.216.34']);
    dns.resolve6.mockRejectedValue(new Error('no AAAA record'));
    expect(await validateDns('example.com')).toBe(true);
  });

  it('blocks a hostname that resolves to a private IP (rebinding case)', async () => {
    dns.resolve4.mockResolvedValue(['169.254.169.254']);
    dns.resolve6.mockRejectedValue(new Error('no AAAA record'));
    expect(await validateDns('evil.example.com')).toBe(false);
  });

  it('blocks if any resolved address is private, even with mixed records', async () => {
    dns.resolve4.mockResolvedValue(['8.8.8.8', '10.0.0.1']);
    dns.resolve6.mockRejectedValue(new Error('no AAAA record'));
    expect(await validateDns('mixed.example.com')).toBe(false);
  });

  it('allows when DNS resolution fails entirely (lets fetch fail naturally)', async () => {
    dns.resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    dns.resolve6.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await validateDns('this-domain-does-not-exist-12345.com')).toBe(true);
  });

  it('skips DNS resolution for literal IP addresses', async () => {
    expect(await validateDns('8.8.8.8')).toBe(true);
    expect(dns.resolve4).not.toHaveBeenCalled();
  });
});
