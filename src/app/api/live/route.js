import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { dbErr } from '@/lib/db';

function generateSessionId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { state, includeAuth, isCollaborative } = body;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }

  const id = generateSessionId();
  const hostToken = crypto.randomUUID();

  const supabase = createServerClient();
  const { error } = await supabase.from('live_sessions').insert({
    id,
    host_token: hostToken,
    state,
    include_auth: !!includeAuth,
    is_collaborative: isCollaborative !== false,
    host_connected: true,
  });

  if (error) return dbErr(error);
  return NextResponse.json({ id, hostToken });
}
