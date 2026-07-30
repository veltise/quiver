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

// Refuse to start unsalted in production rather than degrade quietly. There are
// only ~4.3 billion IPv4 addresses, so an unsalted sha256(ip) can be reversed by
// exhaustive search in seconds — "we hash IPs" would still be technically true
// and completely worthless. Failing at boot makes a missing env var a 30-second
// fix; defaulting to '' makes it an invisible, indefinite one.
if (!process.env.IP_HASH_SALT && process.env.NODE_ENV === 'production') {
  throw new Error(
    'IP_HASH_SALT is required in production — an unsalted IP hash is trivially reversible. See .env.example.'
  );
}

// Hash IP so plaintext addresses are never stored in the DB.
// Uses a server-side salt to prevent rainbow-table reversal.
function hashIp(raw) {
  const salt = process.env.IP_HASH_SALT ?? '';
  return createHash('sha256').update(salt + raw).digest('hex').slice(0, 32);
}

export function getClientIp(request) {
  // Only trust headers the platform sets and a client cannot forge.
  //
  // x-forwarded-for is APPENDED to, not replaced — a client can send its own and
  // the edge tacks the real address on the end. So the FIRST entry is
  // attacker-controlled, and reading it lets anyone mint a fresh rate-limit
  // bucket per request just by rotating one header. The last entry (nearest
  // proxy) is the only trustworthy part, and it's a last resort behind the two
  // headers the platform owns outright.
  const raw = request.headers.get('x-vercel-forwarded-for')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
    ?? '127.0.0.1';
  return hashIp(raw);
}

export function dbErr(error) {
  // Postgres messages name columns, constraints and RLS policies — useful to us
  // in the logs, free reconnaissance in a response body.
  console.error('db error:', error?.message);
  return NextResponse.json({ error: 'Database error' }, { status: 500 });
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
