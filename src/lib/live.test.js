import { describe, it, expect } from 'vitest';
import { stripAuth, isValidLiveState } from './live';

describe('stripAuth', () => {
  it('clears the auth block', () => {
    const out = stripAuth({ auth: { type: 'bearer', token: 'secret' }, url: 'https://x.dev' });
    expect(out.auth).toEqual({ type: 'none' });
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('drops the Authorization header regardless of casing or padding', () => {
    const out = stripAuth({
      headers: [
        { key: 'Authorization', value: 'Bearer secret' },
        { key: 'authorization', value: 'Bearer secret' },
        { key: '  AUTHORIZATION  ', value: 'Bearer secret' },
        { key: 'Content-Type', value: 'application/json' },
      ],
    });
    expect(out.headers).toEqual([{ key: 'Content-Type', value: 'application/json' }]);
  });

  it('keeps every other field intact', () => {
    const out = stripAuth({ url: 'https://x.dev', method: 'POST', body: '{"a":1}' });
    expect(out).toMatchObject({ url: 'https://x.dev', method: 'POST', body: '{"a":1}' });
  });

  // Only Authorization is removed; malformed entries carry no token, so they're
  // left alone rather than silently reshaping the user's header list.
  it('tolerates a missing or malformed headers array without throwing', () => {
    expect(stripAuth({}).headers).toEqual([]);
    expect(() => stripAuth({ headers: [null, undefined, { value: 'no key' }] })).not.toThrow();
    expect(stripAuth({ headers: [null, { value: 'no key' }] }).headers).toHaveLength(2);
  });

  it('still catches Authorization keys with stray whitespace or newlines', () => {
    const out = stripAuth({
      headers: [{ key: ' Authorization\n', value: 'Bearer secret' }, { key: 'Accept', value: '*/*' }],
    });
    expect(out.headers).toEqual([{ key: 'Accept', value: '*/*' }]);
  });
});

describe('isValidLiveState', () => {
  it('accepts a plain object', () => {
    expect(isValidLiveState({ url: 'https://x.dev' })).toBe(true);
  });

  // A JSON *string* would survive stripAuth's object spread with its auth intact,
  // which is the whole reason this guard exists.
  it('rejects a JSON string', () => {
    expect(isValidLiveState('{"auth":{"type":"bearer","token":"secret"}}')).toBe(false);
  });

  it('rejects arrays, null and primitives', () => {
    expect(isValidLiveState([])).toBe(false);
    expect(isValidLiveState(null)).toBe(false);
    expect(isValidLiveState(undefined)).toBe(false);
    expect(isValidLiveState(42)).toBe(false);
  });
});
