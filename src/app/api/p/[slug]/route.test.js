import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createServerClient: vi.fn() }));

import { createServerClient } from '@/lib/supabase';
import { GET } from './route';

const ctx = { params: Promise.resolve({ slug: 'my-slug' }) };

// Captures every .eq()/.or() call so tests can prove both the is_public
// and expiry filters are actually applied, not just the slug lookup.
function makeMockClient({ data = null, error = null } = {}) {
  const captured = { eqCalls: [], orCalls: [] };
  function builder() {
    const b = {
      select: vi.fn(() => b),
      eq: vi.fn((col, val) => { captured.eqCalls.push([col, val]); return b; }),
      or: vi.fn((expr) => { captured.orCalls.push(expr); return b; }),
      single: vi.fn(async () => ({ data, error })),
    };
    return b;
  }
  return { client: { from: vi.fn(builder) }, captured };
}

describe('GET /api/p/[slug]', () => {
  it('filters on is_public = true and treats null expires_at as non-expiring', async () => {
    const { client, captured } = makeMockClient({ data: { state: { url: 'https://x' } } });
    createServerClient.mockReturnValue(client);

    const res = await GET(new Request('http://x'), ctx);

    expect(res.status).toBe(200);
    expect(captured.eqCalls).toContainEqual(['slug', 'my-slug']);
    expect(captured.eqCalls).toContainEqual(['is_public', true]);
    expect(captured.orCalls[0]).toMatch(/expires_at\.is\.null/);
    expect(captured.orCalls[0]).toMatch(/expires_at\.gt\./);
  });

  it('returns 404 when the row is missing or expired', async () => {
    const { client } = makeMockClient({ data: null, error: { message: 'not found' } });
    createServerClient.mockReturnValue(client);

    const res = await GET(new Request('http://x'), ctx);
    expect(res.status).toBe(404);
  });
});
