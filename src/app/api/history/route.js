import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, dbErr } from '@/lib/db';

export async function GET(request) {
  const sessionId = getSessionHeader(request);
  if (!sessionId) return NextResponse.json([], { status: 200 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('history')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error) return dbErr(error);
  return NextResponse.json(data);
}

export async function POST(request) {
  const { sessionId, entry } = await request.json();
  if (!sessionId || !entry) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('history').insert({
    session_id: sessionId,
    method: entry.method,
    url: entry.url,
    status: entry.status ?? null,
    timestamp: entry.timestamp,
    state: entry.state,
  });

  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const sessionId = getSessionHeader(request);
  if (!sessionId) return NextResponse.json({ error: 'Missing session' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('history').delete().eq('session_id', sessionId);

  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
