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
import { PATCH, DELETE } from './route';

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
const ctx = { params: Promise.resolve({ id: 'row-1' }) };

// Captures every .eq(col, value) call so tests can prove the session_id
// ownership filter is actually applied, not just the id filter.
function makeMockClient() {
  const captured = { eqCalls: [] };
  function builder() {
    let mode = null;
    const b = {
      select: vi.fn(() => b),
      eq: vi.fn((col, val) => { captured.eqCalls.push([col, val]); return b; }),
      update: vi.fn((fields) => { mode = 'update'; captured.updateFields = fields; return b; }),
      delete: vi.fn(() => { mode = 'delete'; return b; }),
      single: vi.fn(async () => ({ data: { id: 'row-1', ...captured.updateFields }, error: null })),
      then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
    };
    return b;
  }
  return { client: { from: vi.fn(builder) }, captured };
}

beforeEach(() => {
  vi.mocked(rateLimit).mockResolvedValue(true);
});

describe('PATCH /api/saved/[id] — ownership scoping', () => {
  it('scopes the update to both the row id AND the caller session_id', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-id': SESSION_ID },
      body: JSON.stringify({ name: 'Renamed', slug: 'renamed' }),
    });
    await PATCH(req, ctx);

    expect(captured.eqCalls).toContainEqual(['id', 'row-1']);
    expect(captured.eqCalls).toContainEqual(['session_id', SESSION_ID]);
  });

  it('never includes url/method as top-level update fields', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-id': SESSION_ID },
      body: JSON.stringify({ name: 'Renamed', slug: 'renamed' }),
    });
    await PATCH(req, ctx);

    expect(captured.updateFields).not.toHaveProperty('url');
    expect(captured.updateFields).not.toHaveProperty('method');
  });

  it('rejects a request with no session id', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', slug: 'x' }) });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects a state update that is not encrypted, when state is included', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-id': SESSION_ID },
      body: JSON.stringify({ name: 'Renamed', slug: 'renamed', state: { url: 'https://x' } }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('accepts a properly-encrypted state update', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-id': SESSION_ID },
      body: JSON.stringify({ name: 'Renamed', slug: 'renamed', state: { _enc: true, iv: 'i', data: 'd' } }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/saved/[id] — ownership scoping', () => {
  it('scopes the delete to both the row id AND the caller session_id', async () => {
    const { client, captured } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'DELETE', headers: { 'x-session-id': SESSION_ID } });
    const res = await DELETE(req, ctx);

    expect(res.status).toBe(200);
    expect(captured.eqCalls).toContainEqual(['id', 'row-1']);
    expect(captured.eqCalls).toContainEqual(['session_id', SESSION_ID]);
  });

  it('rejects a delete with an invalid session id', async () => {
    const { client } = makeMockClient();
    createServerClient.mockReturnValue(client);

    const req = new Request('http://x', { method: 'DELETE', headers: { 'x-session-id': 'not-a-uuid' } });
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(400);
  });
});
