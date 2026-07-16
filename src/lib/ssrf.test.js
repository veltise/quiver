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

  it('unwraps IPv6-mapped IPv4 addresses before checking', () => {
    expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('allows ordinary public IPs', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
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
