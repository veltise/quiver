import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, getClientIp, rateLimit, tooManyRequests, isValidSessionId, dbErr } from '@/lib/db';

export async function PATCH(request) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  const sessionId = getSessionHeader(request);
  if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'Missing session' }, { status: 400 });

  const { ids, to } = await request.json();
  if (!Array.isArray(ids) || !ids.length || typeof to !== 'string' || !to.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (ids.length > 500) return NextResponse.json({ error: 'Too many ids' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase
    .from('saved_requests')
    .update({ collection: to.trim() })
    .in('id', ids)
    .eq('session_id', sessionId);

  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
