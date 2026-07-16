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
import { DELETE } from './route';

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
const ctx = { params: Promise.resolve({ id: 'entry-1' }) };

function makeMockClient() {
  const captured = { eqCalls: [] };
  const client = {
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn((col, val) => {
          captured.eqCalls.push([col, val]);
          return {
            eq: vi.fn((col2, val2) => {
              captured.eqCalls.push([col2, val2]);
              return Promise.resolve({ error: null });
            }),
          };
        }),
      })),
    })),
  };
  return { client, captured };
}

beforeEach(() => {
  vi.mocked(rateLimit).mockResolvedValue(true);
});

describe('DELETE /api/history/[id] — ownership scoping', () => {
  it('scopes the delete to both the entry id AND the caller session_id', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'DELETE', headers: { 'x-session-id': SESSION_ID } });
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(200);
    expect(captured.eqCalls).toContainEqual(['id', 'entry-1']);
    expect(captured.eqCalls).toContainEqual(['session_id', SESSION_ID]);
  });

  it('rejects a delete with an invalid session id', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'DELETE', headers: { 'x-session-id': 'not-a-uuid' } });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 429 when the write rate limit is exceeded — this route used to have no rate limiting at all', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);
    vi.mocked(rateLimit).mockResolvedValue(false);

    const req = new Request('http://x', { method: 'DELETE', headers: { 'x-session-id': SESSION_ID } });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(429);
  });
});
