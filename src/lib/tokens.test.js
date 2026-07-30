import { describe, it, expect } from 'vitest';
import { tokensMatch } from './tokens';

describe('tokensMatch', () => {
  it('matches identical tokens', () => {
    const t = '6f1c2e7a-0b3d-4f5a-9c8e-1d2b3a4c5d6e';
    expect(tokensMatch(t, t)).toBe(true);
  });

  it('rejects different tokens of the same length', () => {
    expect(tokensMatch('a'.repeat(36), 'b'.repeat(36))).toBe(false);
  });

  // timingSafeEqual throws on a length mismatch; hashing first means this returns
  // false instead of blowing up (and instead of leaking the expected length).
  it('rejects tokens of different lengths without throwing', () => {
    expect(() => tokensMatch('short', 'a'.repeat(200))).not.toThrow();
    expect(tokensMatch('short', 'a'.repeat(200))).toBe(false);
  });

  it('rejects a one-character difference', () => {
    expect(tokensMatch('token-abc', 'token-abd')).toBe(false);
  });

  it('rejects empty, null and non-string input', () => {
    expect(tokensMatch('', '')).toBe(false);
    expect(tokensMatch(null, 'x')).toBe(false);
    expect(tokensMatch('x', undefined)).toBe(false);
    expect(tokensMatch({}, 'x')).toBe(false);
  });
});
