import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createServerClient: vi.fn() }));

import { createServerClient } from '@/lib/supabase';
import { isValidSessionId, getClientIp, rateLimit } from './db';

function mockRequest(headers) {
  return { headers: new Headers(headers) };
}

describe('isValidSessionId', () => {
  it('accepts a valid UUID', () => {
    expect(isValidSessionId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(isValidSessionId('not-a-uuid')).toBe(false);
    expect(isValidSessionId('123e4567e89b12d3a456426614174000')).toBe(false); // missing dashes
  });

  it('rejects non-string input', () => {
    expect(isValidSessionId(null)).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
    expect(isValidSessionId(12345)).toBe(false);
  });
});

describe('getClientIp', () => {
  beforeAll(() => {
    process.env.IP_HASH_SALT = 'test-salt';
  });

  it('never returns the raw IP — always a hash', () => {
    const ip = getClientIp(mockRequest({ 'x-real-ip': '203.0.113.5' }));
    expect(ip).not.toContain('203.0.113.5');
    expect(ip).toMatch(/^[0-9a-f]+$/); // hex hash
  });

  it('is deterministic — same IP always hashes the same', () => {
    const a = getClientIp(mockRequest({ 'x-real-ip': '203.0.113.5' }));
    const b = getClientIp(mockRequest({ 'x-real-ip': '203.0.113.5' }));
    expect(a).toBe(b);
  });

  it('different IPs hash differently', () => {
    const a = getClientIp(mockRequest({ 'x-real-ip': '203.0.113.5' }));
    const b = getClientIp(mockRequest({ 'x-real-ip': '203.0.113.6' }));
    expect(a).not.toBe(b);
  });

  it('prefers x-real-ip over x-forwarded-for', () => {
    const a = getClientIp(mockRequest({ 'x-real-ip': '1.1.1.1' }));
    const b = getClientIp(mockRequest({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }));
    expect(a).toBe(b);
  });

  it('prefers x-vercel-forwarded-for over everything else', () => {
    const a = getClientIp(mockRequest({ 'x-vercel-forwarded-for': '1.1.1.1' }));
    const b = getClientIp(mockRequest({
      'x-vercel-forwarded-for': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
      'x-forwarded-for': '3.3.3.3',
    }));
    expect(a).toBe(b);
  });

  // Regression: reading xff[0] let a client pick its own rate-limit bucket, since
  // the edge appends to a client-supplied header rather than replacing it.
  it('uses the LAST entry of x-forwarded-for, so a client-prepended value is ignored', () => {
    const nearestProxy = getClientIp(mockRequest({ 'x-forwarded-for': '10.0.0.2' }));
    const spoofed = getClientIp(mockRequest({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 10.0.0.2' }));
    expect(spoofed).toBe(nearestProxy);
  });

  it('a rotating client-supplied x-forwarded-for cannot change the bucket', () => {
    const a = getClientIp(mockRequest({ 'x-forwarded-for': 'evil-1, 10.0.0.9' }));
    const b = getClientIp(mockRequest({ 'x-forwarded-for': 'evil-2, 10.0.0.9' }));
    expect(a).toBe(b);
  });

  it('falls back to 127.0.0.1 when no IP headers are present', () => {
    const noHeaders = getClientIp(mockRequest({}));
    const explicit127 = getClientIp(mockRequest({ 'x-real-ip': '127.0.0.1' }));
    expect(noHeaders).toBe(explicit127); // proves the fallback is actually 127.0.0.1, not just "doesn't crash"
  });
});

describe('rateLimit', () => {
  function mockRpc(result) {
    createServerClient.mockReturnValue({ rpc: vi.fn(async () => result) });
  }

  it('allows the request when count is within the limit', async () => {
    mockRpc({ data: 5, error: null });
    expect(await rateLimit('test-key', { limit: 10 })).toBe(true);
  });

  it('allows exactly at the limit boundary', async () => {
    mockRpc({ data: 10, error: null });
    expect(await rateLimit('test-key', { limit: 10 })).toBe(true);
  });

  it('blocks once the count exceeds the limit', async () => {
    mockRpc({ data: 11, error: null });
    expect(await rateLimit('test-key', { limit: 10 })).toBe(false);
  });

  it('fails CLOSED (denies) when the RPC errors — must never fail open', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc({ data: null, error: { message: 'connection lost' } });
    expect(await rateLimit('test-key', { limit: 10 })).toBe(false);
    spy.mockRestore();
  });
});
