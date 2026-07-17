const KEY_STORAGE = 'api-playground-enc-key';
let _cachedKey = null;

async function getCryptoKey() {
  if (_cachedKey) return _cachedKey;

  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored) {
    try {
      const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      _cachedKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      return _cachedKey;
    } catch {}
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(exported))));
  _cachedKey = key;
  return key;
}

export async function encryptState(state) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    _enc: true,
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

// Shape-checks a state value without decrypting it — safe to call server-side (no
// localStorage/crypto.subtle involved). Used to reject non-encrypted state on writes
// that must never store plaintext, so a future bug can't silently save it unencrypted.
export function isEncryptedState(state) {
  return !!state && state._enc === true && typeof state.iv === 'string' && typeof state.data === 'string';
}

// Returns the original object for plaintext states (pre-encryption data, share-link states).
export async function decryptState(state) {
  if (!state?._enc) return state;
  try {
    const key = await getCryptoKey();
    const iv = Uint8Array.from(atob(state.iv), (c) => c.charCodeAt(0));
    const data = Uint8Array.from(atob(state.data), (c) => c.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}
