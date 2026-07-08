import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { dbErr } from '@/lib/db';

export async function GET(request, { params }) {
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
  const { id } = await params;
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const fields = {};
  if (body.state !== undefined) fields.state = body.state;
  if (body.response !== undefined) fields.response = body.response;
  if (body.host_connected !== undefined) fields.host_connected = body.host_connected;

  if (!Object.keys(fields).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Marking host as disconnected requires host token
  if ('host_connected' in fields) {
    const hostToken = request.headers.get('x-host-token');
    if (!hostToken) return NextResponse.json({ error: 'Missing host token' }, { status: 401 });
    const supabase = createServerClient();
    const { data: session } = await supabase
      .from('live_sessions')
      .select('host_token')
      .eq('id', id)
      .single();
    if (!session || session.host_token !== hostToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('live_sessions').update(fields).eq('id', id);
  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const hostToken = request.headers.get('x-host-token');
  if (!hostToken) return NextResponse.json({ error: 'Missing host token' }, { status: 401 });

  const supabase = createServerClient();
  const { data: session } = await supabase
    .from('live_sessions')
    .select('host_token')
    .eq('id', id)
    .single();

  if (!session || session.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { error } = await supabase.from('live_sessions').delete().eq('id', id);
  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
