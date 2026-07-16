import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, getClientIp, rateLimit, tooManyRequests, isValidSessionId, dbErr } from '@/lib/db';

const MAX_HISTORY_PER_SESSION = 50;

export async function GET(request) {
  const sessionId = getSessionHeader(request);
  if (!isValidSessionId(sessionId)) return NextResponse.json([], { status: 200 });

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
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();

  const { sessionId, entry } = await request.json();
  if (!isValidSessionId(sessionId) || !entry) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!VALID_METHODS.includes(entry.method)) return NextResponse.json({ error: 'Invalid method' }, { status: 400 });
  if (typeof entry.url !== 'string' || entry.url.length > 4096) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  if (JSON.stringify(entry.state ?? {}).length > 100 * 1024) return NextResponse.json({ error: 'State too large' }, { status: 413 });

  const supabase = createServerClient();

  const { count } = await supabase
    .from('history')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (count >= MAX_HISTORY_PER_SESSION) return NextResponse.json({ error: 'History limit reached' }, { status: 429 });

  const { error } = await supabase.from('history').insert({
    session_id: sessionId,
    status: typeof entry.status === 'number' ? entry.status : null,
    timestamp: entry.timestamp,
    state: entry.state,
  });

  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const sessionId = getSessionHeader(request);
  if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'Missing session' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('history').delete().eq('session_id', sessionId);

  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
