import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/db', () => ({
  getClientIp: vi.fn(() => 'hashed-ip'),
  rateLimit: vi.fn(async () => true),
  tooManyRequests: () => new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 }),
  dbErr: (error) => new Response(JSON.stringify({ error: error.message }), { status: 500 }),
}));

import { createServerClient } from '@/lib/supabase';
import { rateLimit } from '@/lib/db';
import { GET, PATCH, DELETE } from './route';

// Minimal Supabase query-builder mock covering exactly the shapes this route uses:
// .from(x).select(...).eq(...).gt(...).single()  and  .from(x).update(fields).eq(...) (awaited directly).
// sessionRow = null simulates "no matching row" — the same outcome whether the session
// never existed or the .gt('expires_at', now) filter excluded it for being expired;
// the route can't tell those apart, so there's no need for a separate expired-session case.
function makeMockClient(sessionRow) {
  const captured = {};
  function builder() {
    let mode = null;
    const b = {
      select: vi.fn(() => { mode = 'select'; return b; }),
      update: vi.fn((fields) => { mode = 'update'; captured.updateFields = fields; return b; }),
      delete: vi.fn(() => { mode = 'delete'; return b; }),
      eq: vi.fn(() => b),
      gt: vi.fn(() => b),
      single: vi.fn(async () => ({ data: sessionRow, error: null })),
      then: (resolve, reject) =>
        Promise.resolve(mode === 'select' ? { data: sessionRow, error: null } : { error: null }).then(resolve, reject),
    };
    return b;
  }
  return { client: { from: vi.fn(builder) }, captured };
}

function patchRequest(body, headers = {}) {
  return new Request('http://x/api/live/abc123', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: 'abc123' }) };

beforeEach(() => {
  vi.mocked(rateLimit).mockResolvedValue(true);
});

describe('GET /api/live/[id]', () => {
  it('returns the session state for a valid, non-expired session', async () => {
    const row = { id: 'abc123', state: { url: 'https://x' }, response: null, include_auth: false, is_collaborative: true, host_connected: true, expires_at: '2099-01-01T00:00:00Z' };
    const { client } = makeMockClient(row);
    createServerClient.mockReturnValue(client);

    const res = await GET(new Request('http://x'), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
  });

  it('returns 404 when the session does not exist or has expired', async () => {
    const { client } = makeMockClient(null);
    createServerClient.mockReturnValue(client);

    const res = await GET(new Request('http://x'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 429 when the read rate limit is exceeded', async () => {
    vi.mocked(rateLimit).mockResolvedValue(false);
    const res = await GET(new Request('http://x'), ctx);
    expect(res.status).toBe(429);
  });
});

describe('PATCH /api/live/[id] — host token enforcement', () => {
  it('rejects a state write in Demo mode with no host token', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: false, include_auth: true });
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({ state: { url: 'https://x' } }), ctx);
    expect(res.status).toBe(401);
  });

  it('rejects a state write in Demo mode with the wrong host token', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: false, include_auth: true });
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({ state: { url: 'https://x' } }, { 'x-host-token': 'WRONG' }), ctx);
    expect(res.status).toBe(403);
  });

  it('allows a state write in Demo mode with the correct host token', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: false, include_auth: true });
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({ state: { url: 'https://x' } }, { 'x-host-token': 'HOST_TOK' }), ctx);
    expect(res.status).toBe(200);
  });

  it('allows a state write in Collaborative mode with NO host token — this is the feature, not a hole', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: true, include_auth: true });
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({ state: { url: 'https://x' } }), ctx);
    expect(res.status).toBe(200);
  });

  it('requires the host token for host_connected even in Collaborative mode', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: true, include_auth: true });
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({ host_connected: false }), ctx);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/live/[id] — include_auth stripping', () => {
  const stateWithAuth = {
    url: 'https://api.example.com',
    auth: { type: 'bearer', token: 'super-secret-token' },
    headers: [{ key: 'Authorization', value: 'Bearer super-secret-token' }, { key: 'Accept', value: 'application/json' }],
  };

  it('strips auth/Authorization from every write when include_auth is false — regardless of collaborative mode', async () => {
    const { client, captured } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: true, include_auth: false });
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({ state: stateWithAuth }), ctx);
    expect(res.status).toBe(200);
    expect(captured.updateFields.state.auth).toEqual({ type: 'none' });
    expect(captured.updateFields.state.headers.some((h) => h.key.toLowerCase() === 'authorization')).toBe(false);
    expect(captured.updateFields.state.headers.some((h) => h.key === 'Accept')).toBe(true); // non-auth headers survive
  });

  it('leaves auth untouched when include_auth is true', async () => {
    const { client, captured } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: true, include_auth: true });
    createServerClient.mockReturnValue(client);

    await PATCH(patchRequest({ state: stateWithAuth }), ctx);
    expect(captured.updateFields.state.auth).toEqual(stateWithAuth.auth);
  });

  it('strips auth on a Demo-mode host write too, not just Collaborative mode', async () => {
    const { client, captured } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: false, include_auth: false });
    createServerClient.mockReturnValue(client);

    await PATCH(patchRequest({ state: stateWithAuth }, { 'x-host-token': 'HOST_TOK' }), ctx);
    expect(captured.updateFields.state.auth).toEqual({ type: 'none' });
  });
});

describe('PATCH /api/live/[id] — payload and input handling', () => {
  it('rejects malformed JSON', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: true, include_auth: true });
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{not valid json' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects payloads over 512KB', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: true, include_auth: true });
    createServerClient.mockReturnValue(client);

    const huge = { state: { url: 'https://x', body: 'a'.repeat(600 * 1024) } };
    const res = await PATCH(patchRequest(huge), ctx);
    expect(res.status).toBe(413);
  });

  it('rejects an empty update body', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK', is_collaborative: true, include_auth: true });
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({}), ctx);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a session that does not exist', async () => {
    const { client } = makeMockClient(null);
    createServerClient.mockReturnValue(client);

    const res = await PATCH(patchRequest({ state: { url: 'https://x' } }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 429 when the write rate limit is exceeded', async () => {
    vi.mocked(rateLimit).mockResolvedValue(false);
    const res = await PATCH(patchRequest({ state: { url: 'https://x' } }), ctx);
    expect(res.status).toBe(429);
  });
});

describe('DELETE /api/live/[id]', () => {
  it('rejects ending a session with no host token', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK' });
    createServerClient.mockReturnValue(client);

    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(401);
  });

  it('rejects ending a session with the wrong host token', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK' });
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'DELETE', headers: { 'x-host-token': 'WRONG' } });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
  });

  it('allows ending a session with the correct host token', async () => {
    const { client } = makeMockClient({ host_token: 'HOST_TOK' });
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'DELETE', headers: { 'x-host-token': 'HOST_TOK' } });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
  });
});
