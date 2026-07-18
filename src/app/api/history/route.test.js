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
const validEntry = { method: 'GET', url: 'https://x', status: 200, timestamp: Date.now(), state: { _enc: true, iv: 'test-iv', data: 'test-data' } };

function makeMockClient({ existingCount = 0 } = {}) {
  const captured = {};
  function builder() {
    const b = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      insert: vi.fn((row) => { captured.insertedRow = row; return Promise.resolve({ error: null }); }),
      then: (resolve, reject) => Promise.resolve({ count: existingCount }).then(resolve, reject),
    };
    return b;
  }
  return { client: { from: vi.fn(builder) }, captured };
}

function historyRequest(body) {
  return new Request('http://x/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.mocked(rateLimit).mockResolvedValue(true);
});

describe('POST /api/history — validation', () => {
  it('rejects an invalid session id', async () => {
    const res = await POST(historyRequest({ sessionId: 'not-a-uuid', entry: validEntry }));
    expect(res.status).toBe(400);
  });

  it('rejects a method outside the known allowlist', async () => {
    const res = await POST(historyRequest({ sessionId: SESSION_ID, entry: { ...validEntry, method: 'TRACE' } }));
    expect(res.status).toBe(400);
  });

  it('rejects a url over 4096 characters', async () => {
    const res = await POST(historyRequest({ sessionId: SESSION_ID, entry: { ...validEntry, url: 'https://x/' + 'a'.repeat(4096) } }));
    expect(res.status).toBe(400);
  });

  it('rejects an oversized state payload', async () => {
    const res = await POST(historyRequest({ sessionId: SESSION_ID, entry: { ...validEntry, state: { body: 'a'.repeat(200 * 1024) } } }));
    expect(res.status).toBe(413);
  });

  it('rejects a state that is not encrypted — the client always encrypts before this route is called', async () => {
    const res = await POST(historyRequest({ sessionId: SESSION_ID, entry: { ...validEntry, state: { url: 'https://x' } } }));
    expect(res.status).toBe(400);
  });

  it('accepts a properly-encrypted state', async () => {
    const { client } = makeMockClient({ existingCount: 0 });
    createServerClient.mockReturnValue(client);

    const res = await POST(historyRequest({ sessionId: SESSION_ID, entry: validEntry }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/history — limit enforcement', () => {
  it('returns 429 (not a silent 200) once the per-session history limit (50) is reached', async () => {
    const { client } = makeMockClient({ existingCount: 50 });
    createServerClient.mockReturnValue(client);

    const res = await POST(historyRequest({ sessionId: SESSION_ID, entry: validEntry }));
    expect(res.status).toBe(429); // regression test — this used to silently return 200 with no insert
  });

  it('inserts successfully when under the limit', async () => {
    const { client, captured } = makeMockClient({ existingCount: 10 });
    createServerClient.mockReturnValue(client);

    const res = await POST(historyRequest({ sessionId: SESSION_ID, entry: validEntry }));
    expect(res.status).toBe(200);
    expect(captured.insertedRow.session_id).toBe(SESSION_ID);
    expect(captured.insertedRow).not.toHaveProperty('url'); // url/method live only inside encrypted state
  });
});
