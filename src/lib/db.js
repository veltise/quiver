import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getSessionHeader(request) {
  return request.headers.get('x-session-id');
}

export function isValidSessionId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

// Hash IP so plaintext addresses are never stored in the DB.
// Uses a server-side salt to prevent rainbow-table reversal.
function hashIp(raw) {
  const salt = process.env.IP_HASH_SALT ?? '';
  return createHash('sha256').update(salt + raw).digest('hex').slice(0, 32);
}

export function getClientIp(request) {
  // x-forwarded-for: first entry is the original client; last is the nearest proxy
  const raw = request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? '127.0.0.1';
  return hashIp(raw);
}

export function dbErr(error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

// Returns true if the request is allowed, false if the rate limit is exceeded.
// key should be namespaced per route type (e.g. "proxy:1.2.3.4", "write:1.2.3.4")
// so proxy and write limits don't share the same bucket.
export async function rateLimit(key, { limit = 30, window = 60 } = {}) {
  const sb = createServerClient();
  const { data: count, error } = await sb.rpc('rate_limit_increment', {
    p_ip: key,
    p_window_seconds: window,
  });
  if (error) { console.error('rate_limit_increment:', error.message); return false; }
  return count <= limit;
}

export function tooManyRequests(window = 60) {
  return NextResponse.json(
    { error: 'Rate limit exceeded' },
    { status: 429, headers: { 'Retry-After': String(window) } },
  );
}
