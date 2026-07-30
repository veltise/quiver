import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { dbErr, getClientIp, rateLimit, tooManyRequests } from '@/lib/db';
import { stripAuth, isValidLiveState } from '@/lib/live';

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
// The session id IS the capability — anyone holding the link can read the session,
// and in Collaborative mode write to it. 22 chars of base36 is ~113 bits; the
// previous 8 was ~41, which only stayed safe because of the read rate limit.
const ID_LENGTH = 22;
// Largest multiple of 36 that fits in a byte (252). Bytes at or above it are
// discarded rather than folded with `% 36`, which would otherwise make the first
// four letters of the alphabet measurably likelier than the rest.
const ID_BYTE_CEILING = 256 - (256 % ID_CHARS.length);

function generateSessionId() {
  let id = '';
  while (id.length < ID_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
      if (b >= ID_BYTE_CEILING) continue; // rejection sampling — keeps it uniform
      id += ID_CHARS[b % ID_CHARS.length];
      if (id.length === ID_LENGTH) break;
    }
  }
  return id;
}

export async function POST(request) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { state, includeAuth, isCollaborative } = body;
  if (!isValidLiveState(state)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  const id = generateSessionId();
  const hostToken = crypto.randomUUID();
  const shareAuth = !!includeAuth;

  const supabase = createServerClient();
  const { error } = await supabase.from('live_sessions').insert({
    id,
    host_token: hostToken,
    // Enforce include_auth here too, not just in PATCH. The client strips before
    // sending, but that's convention — a UI bug or a hand-rolled request would
    // otherwise persist a real token and serve it to every guest for the life of
    // the session.
    state: shareAuth ? state : stripAuth(state),
    include_auth: shareAuth,
    // Default closed: an absent field must not silently opt the session into the
    // mode where any participant with the link can write.
    is_collaborative: isCollaborative === true,
    host_connected: true,
  });

  if (error) return dbErr(error);
  return NextResponse.json({ id, hostToken });
}
