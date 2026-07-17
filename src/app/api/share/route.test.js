import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rateLimit: vi.fn(async () => true),
    tooManyRequests: () => new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 }),
  };
});

import { createServerClient } from '@/lib/supabase';
import { rateLimit } from '@/lib/db';
import { POST } from './route';

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

// count-query chain: .from(x).select(...).eq(...) awaited directly (resolves { count })
// insert chain: .from(x).insert(row).select('slug').single()
function makeMockClient({ existingCount = 0, insertError = null } = {}) {
  const captured = {};
  function builder() {
    let mode = null;
    const b = {
      select: vi.fn(() => { if (mode !== 'insert') mode = 'count'; return b; }),
      eq: vi.fn(() => b),
      insert: vi.fn((row) => { mode = 'insert'; captured.insertedRow = row; return b; }),
      single: vi.fn(async () =>
        insertError ? { data: null, error: insertError } : { data: { slug: captured.insertedRow.slug }, error: null }
      ),
      then: (resolve, reject) => Promise.resolve({ count: existingCount }).then(resolve, reject),
    };
    return b;
  }
  return { client: { from: vi.fn(builder) }, captured };
}

function shareRequest(body) {
  return new Request('http://x/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(rateLimit).mockResolvedValue(true);
});

describe('POST /api/share — auth stripping', () => {
  it('strips auth and the Authorization header before storing a public share', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const res = await POST(shareRequest({
      sessionId: SESSION_ID,
      method: 'GET',
      url: 'https://api.example.com/users',
      state: {
        auth: { type: 'bearer', token: 'super-secret' },
        headers: [{ key: 'Authorization', value: 'Bearer super-secret' }, { key: 'Accept', value: 'application/json' }],
      },
    }));

    expect(res.status).toBe(200);
    expect(captured.insertedRow.state.auth).toEqual({ type: 'none' });
    expect(captured.insertedRow.state.headers.some((h) => h.key.toLowerCase() === 'authorization')).toBe(false);
    expect(captured.insertedRow.state.headers.some((h) => h.key === 'Accept')).toBe(true); // non-auth headers survive
    expect(captured.insertedRow.is_public).toBe(true); // only /api/share writes should ever set this
  });

  it('strips the Authorization header case-insensitively', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    await POST(shareRequest({
      sessionId: SESSION_ID,
      method: 'GET',
      url: 'https://api.example.com',
      state: { headers: [{ key: 'AUTHORIZATION', value: 'Bearer x' }] },
    }));

    expect(captured.insertedRow.state.headers).toHaveLength(0);
  });

  it('strips auth even if the caller never set one — auth is always forced to none, not just filtered', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    await POST(shareRequest({
      sessionId: SESSION_ID,
      method: 'GET',
      url: 'https://api.example.com',
      state: { headers: [] },
    }));

    expect(captured.insertedRow.state.auth).toEqual({ type: 'none' });
  });
});

describe('POST /api/share — validation', () => {
  it('rejects a non-http(s) URL', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const res = await POST(shareRequest({ sessionId: SESSION_ID, method: 'GET', url: 'javascript:alert(1)', state: {} }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid session id', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const res = await POST(shareRequest({ sessionId: 'not-a-uuid', method: 'GET', url: 'https://example.com', state: {} }));
    expect(res.status).toBe(400);
  });

  it('rejects an oversized state payload', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const res = await POST(shareRequest({
      sessionId: SESSION_ID, method: 'GET', url: 'https://example.com',
      state: { body: 'a'.repeat(200 * 1024) },
    }));
    expect(res.status).toBe(413);
  });

  it('rejects once the per-session share limit is reached', async () => {
    const { client } = makeMockClient({ existingCount: 200 });
    createServerClient.mockReturnValue(client);

    const res = await POST(shareRequest({ sessionId: SESSION_ID, method: 'GET', url: 'https://example.com', state: {} }));
    expect(res.status).toBe(429);
  });
});
