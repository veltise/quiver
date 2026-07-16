import { describe, it, expect, beforeAll } from 'vitest';
import { encryptState, decryptState } from './crypto';

// Node's global localStorage support varies by version — provide a minimal
// deterministic in-memory shim so this test doesn't depend on that.
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  }
});

describe('encryptState / decryptState', () => {
  it('round-trips a request object exactly', async () => {
    const original = { method: 'POST', url: 'https://api.example.com', headers: [{ key: 'Authorization', value: 'Bearer secret' }] };
    const encrypted = await encryptState(original);
    expect(encrypted._enc).toBe(true);
    expect(encrypted.data).not.toContain('secret'); // ciphertext shouldn't contain the plaintext token

    const decrypted = await decryptState(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('passes through plaintext (non-encrypted) states unchanged — the share-link case', async () => {
    const plain = { method: 'GET', url: 'https://example.com' };
    expect(await decryptState(plain)).toEqual(plain);
  });

  it('returns null for corrupted ciphertext rather than throwing', async () => {
    const encrypted = await encryptState({ url: 'https://example.com' });
    const corrupted = { ...encrypted, data: 'not-valid-base64-ciphertext!!' };
    expect(await decryptState(corrupted)).toBeNull();
  });

  it('returns null when decrypting with mismatched IV/data pairing', async () => {
    const a = await encryptState({ url: 'a' });
    const b = await encryptState({ url: 'b' });
    // Swap IVs between two independently-encrypted payloads — should fail auth tag check
    const tampered = { ...a, iv: b.iv };
    expect(await decryptState(tampered)).toBeNull();
  });
});
