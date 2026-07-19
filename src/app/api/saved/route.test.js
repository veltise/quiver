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
import { POST, DELETE } from './route';

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

function makeMockClient({ existingCount = 0, insertResult } = {}) {
  const captured = { eqCalls: [] };
  function builder() {
    let mode = null;
    const b = {
      select: vi.fn(() => { mode = 'count'; return b; }),
      eq: vi.fn((col, val) => { captured.eqCalls.push([col, val]); return b; }),
      insert: vi.fn((row) => { mode = 'insert'; captured.insertedRow = row; return b; }),
      delete: vi.fn(() => { mode = 'delete'; return b; }),
      single: vi.fn(async () => insertResult ?? { data: { id: 'new-id', ...captured.insertedRow }, error: null }),
      then: (resolve, reject) => Promise.resolve(mode === 'delete' ? { error: null } : { count: existingCount }).then(resolve, reject),
    };
    return b;
  }
  return { client: { from: vi.fn(builder) }, captured };
}

function deleteRequest(sessionId) {
  return new Request('http://x/api/saved', { method: 'DELETE', headers: sessionId ? { 'x-session-id': sessionId } : {} });
}

function saveRequest(body) {
  return new Request('http://x/api/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const validEntry = { name: 'Get users', slug: 'get-users', url: 'https://x', state: { _enc: true, iv: 'test-iv', data: 'test-data' }, collection: '' };

beforeEach(() => {
  vi.mocked(rateLimit).mockResolvedValue(true);
});

describe('POST /api/saved — validation (rejected before any DB call)', () => {
  it('rejects an invalid session id', async () => {
    const res = await POST(saveRequest({ sessionId: 'not-a-uuid', entry: validEntry }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing/blank name', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, name: '  ' } }));
    expect(res.status).toBe(400);
  });

  it('rejects a name over 200 characters', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, name: 'a'.repeat(201) } }));
    expect(res.status).toBe(400);
  });

  it('rejects a url over 4096 characters', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, url: 'https://x/' + 'a'.repeat(4096) } }));
    expect(res.status).toBe(400);
  });

  it('rejects a slug with invalid characters', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, slug: 'not a valid slug!' } }));
    expect(res.status).toBe(400);
  });

  it('rejects a collection name over 100 characters', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, collection: 'a'.repeat(101) } }));
    expect(res.status).toBe(400);
  });

  it('rejects an oversized state payload', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, state: { body: 'a'.repeat(200 * 1024) } } }));
    expect(res.status).toBe(413);
  });

  it('rejects plaintext (non-encrypted) state — a private save must never be storable as plaintext', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, state: { url: 'https://x', headers: [] } } }));
    expect(res.status).toBe(400);
  });

  it('rejects state that only partially looks encrypted', async () => {
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: { ...validEntry, state: { _enc: true } } })); // missing iv/data
    expect(res.status).toBe(400);
  });

  it('rejects when the write rate limit is exceeded', async () => {
    vi.mocked(rateLimit).mockResolvedValue(false);
    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: validEntry }));
    expect(res.status).toBe(429);
  });
});

describe('POST /api/saved — limits and success path', () => {
  it('rejects once the per-session saved-request limit (200) is reached', async () => {
    const { client } = makeMockClient({ existingCount: 200 });
    createServerClient.mockReturnValue(client);

    const res = await POST(saveRequest({ sessionId: SESSION_ID, entry: validEntry }));
    expect(res.status).toBe(429);
  });

  it('does not persist url/method as separate columns — only inside encrypted state', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    await POST(saveRequest({ sessionId: SESSION_ID, entry: validEntry }));
    expect(captured.insertedRow).not.toHaveProperty('url');
    expect(captured.insertedRow).not.toHaveProperty('method');
    expect(captured.insertedRow.session_id).toBe(SESSION_ID);
  });

  it('always inserts is_public: false — a private save is never reachable via /p/[slug]', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    await POST(saveRequest({ sessionId: SESSION_ID, entry: validEntry }));
    expect(captured.insertedRow.is_public).toBe(false);
  });
});

describe('DELETE /api/saved — wipes the whole workspace for a session', () => {
  it('rejects when the write rate limit is exceeded', async () => {
    vi.mocked(rateLimit).mockResolvedValue(false);
    const res = await DELETE(deleteRequest(SESSION_ID));
    expect(res.status).toBe(429);
  });

  it('rejects an invalid session id', async () => {
    const res = await DELETE(deleteRequest('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing session id', async () => {
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(400);
  });

  it('scopes the delete to session_id', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const res = await DELETE(deleteRequest(SESSION_ID));
    expect(res.status).toBe(200);
    expect(captured.eqCalls).toContainEqual(['session_id', SESSION_ID]);
  });
});
