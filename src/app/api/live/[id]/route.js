import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { dbErr, getClientIp, rateLimit, tooManyRequests } from '@/lib/db';
import { stripAuth, isValidLiveState } from '@/lib/live';
import { tokensMatch } from '@/lib/tokens';

export async function GET(request, { params }) {
  if (!await rateLimit(`read:${getClientIp(request)}`, { limit: 60, window: 60 })) return tooManyRequests();
  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('live_sessions')
    .select('id, state, response, include_auth, is_collaborative, host_connected, expires_at')
    .eq('id', id)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  const { id } = await params;
  let bodyText, body;
  try { bodyText = await request.text(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  if (bodyText.length > 512 * 1024) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  try { body = JSON.parse(bodyText); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const fields = {};
  if (body.state !== undefined) {
    // Must be a plain object — a JSON string would slip past stripAuth's object
    // spread below and get stored with its auth intact.
    if (!isValidLiveState(body.state)) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    }
    fields.state = body.state;
  }
  if (body.response !== undefined) fields.response = body.response;
  if (body.host_connected !== undefined) fields.host_connected = body.host_connected;

  if (!Object.keys(fields).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: session } = await supabase
    .from('live_sessions')
    .select('host_token, is_collaborative, include_auth')
    .eq('id', id)
    .single();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // host_connected is always host-only; state/response only need the host token
  // in Demo mode (is_collaborative === false) — in Collaborative mode any participant
  // with the link is meant to be able to edit, by design.
  const needsHostAuth = 'host_connected' in fields || session.is_collaborative === false;
  if (needsHostAuth) {
    const hostToken = request.headers.get('x-host-token');
    if (!hostToken) return NextResponse.json({ error: 'Missing host token' }, { status: 401 });
    if (!tokensMatch(session.host_token, hostToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  // The session's "share auth tokens" choice is made once at creation and must hold for
  // its whole lifetime — strip auth server-side on every write so a later state sync
  // (typed, pasted, or loaded from a saved request) can't silently leak tokens to guests.
  if (fields.state && session.include_auth === false) {
    fields.state = stripAuth(fields.state);
  }

  const { error } = await supabase.from('live_sessions').update(fields).eq('id', id);
  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  const { id } = await params;
  const hostToken = request.headers.get('x-host-token');
  if (!hostToken) return NextResponse.json({ error: 'Missing host token' }, { status: 401 });

  const supabase = createServerClient();
  const { data: session } = await supabase
    .from('live_sessions')
    .select('host_token')
    .eq('id', id)
    .single();

  if (!session || !tokensMatch(session.host_token, hostToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { error } = await supabase.from('live_sessions').delete().eq('id', id);
  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
