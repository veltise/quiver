import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createServerClient: vi.fn() }));
// Override only rate limiting — the real stripAuth/isValidLiveState must run, since
// they're the thing under test here.
vi.mock('@/lib/db', async (importOriginal) => ({
  ...await importOriginal(),
  getClientIp: vi.fn(() => 'hashed-ip'),
  rateLimit: vi.fn(async () => true),
}));

import { createServerClient } from '@/lib/supabase';
import { rateLimit } from '@/lib/db';
import { POST } from './route';

// .from(x).insert(fields) is awaited directly, so the builder is its own thenable.
function makeMockClient() {
  const captured = {};
  const builder = {
    insert: vi.fn((fields) => { captured.insert = fields; return builder; }),
    then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
  };
  return { client: { from: vi.fn(() => builder) }, captured };
}

function postRequest(body) {
  return new Request('http://x/api/live', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STATE_WITH_AUTH = {
  url: 'https://api.example.com/v1',
  method: 'GET',
  auth: { type: 'bearer', token: 'super-secret-token' },
  headers: [
    { key: 'Authorization', value: 'Bearer super-secret-token' },
    { key: 'Accept', value: 'application/json' },
  ],
};

describe('POST /api/live', () => {
  let mock;
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.mockResolvedValue(true);
    mock = makeMockClient();
    createServerClient.mockReturnValue(mock.client);
  });

  // Regression: include_auth was enforced on PATCH but not on the create path, so
  // the guarantee rested entirely on GoLiveModal stripping client-side first.
  it('strips auth at creation when includeAuth is false', async () => {
    const res = await POST(postRequest({ state: STATE_WITH_AUTH, includeAuth: false, isCollaborative: true }));
    expect(res.status).toBe(200);

    const stored = mock.captured.insert;
    expect(stored.include_auth).toBe(false);
    expect(stored.state.auth).toEqual({ type: 'none' });
    expect(stored.state.headers).toEqual([{ key: 'Accept', value: 'application/json' }]);
    expect(JSON.stringify(stored)).not.toContain('super-secret-token');
  });

  it('strips auth when includeAuth is omitted entirely', async () => {
    await POST(postRequest({ state: STATE_WITH_AUTH }));
    expect(JSON.stringify(mock.captured.insert)).not.toContain('super-secret-token');
  });

  // The other half of the contract: ticking the box must still share the token.
  it('preserves auth when includeAuth is true', async () => {
    await POST(postRequest({ state: STATE_WITH_AUTH, includeAuth: true, isCollaborative: true }));

    const stored = mock.captured.insert;
    expect(stored.include_auth).toBe(true);
    expect(stored.state.auth).toEqual({ type: 'bearer', token: 'super-secret-token' });
    expect(stored.state.headers).toHaveLength(2);
  });

  it('defaults is_collaborative closed when the field is absent', async () => {
    await POST(postRequest({ state: { url: 'https://x.dev' } }));
    expect(mock.captured.insert.is_collaborative).toBe(false);
  });

  it('honours an explicit is_collaborative', async () => {
    await POST(postRequest({ state: { url: 'https://x.dev' }, isCollaborative: true }));
    expect(mock.captured.insert.is_collaborative).toBe(true);
  });

  it('rejects a non-object state', async () => {
    for (const state of ['{"auth":{"token":"x"}}', [], 42, null]) {
      const res = await POST(postRequest({ state }));
      expect(res.status).toBe(400);
    }
  });

  it('rejects malformed JSON', async () => {
    const res = await POST(new Request('http://x/api/live', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });

  it('rate limits before touching the database', async () => {
    rateLimit.mockResolvedValue(false);
    const res = await POST(postRequest({ state: { url: 'https://x.dev' } }));
    expect(res.status).toBe(429);
    expect(createServerClient).not.toHaveBeenCalled();
  });

  describe('session id', () => {
    async function idFrom() {
      const m = makeMockClient();
      createServerClient.mockReturnValue(m.client);
      const res = await POST(postRequest({ state: { url: 'https://x.dev' } }));
      return (await res.json()).id;
    }

    it('is long enough to be unguessable (~113 bits, not the old ~41)', async () => {
      const id = await idFrom();
      expect(id).toHaveLength(22);
      expect(id).toMatch(/^[a-z0-9]{22}$/);
    });

    it('does not repeat across many draws', async () => {
      const ids = new Set();
      for (let i = 0; i < 200; i++) ids.add(await idFrom());
      expect(ids.size).toBe(200);
    });

    // Guards the rejection sampling: `byte % 36` would over-represent a-d by ~14%.
    it('draws from the alphabet close to uniformly', async () => {
      const counts = new Map();
      for (let i = 0; i < 400; i++) {
        for (const ch of await idFrom()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      }
      const expected = (400 * 22) / 36;
      for (const ch of 'abcd') {
        // A modulo-biased generator lands ~8/7 of expected here; allow generous
        // sampling noise but still fail on a systematic skew.
        expect(counts.get(ch)).toBeLessThan(expected * 1.25);
      }
    });
  });
});
