import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, getClientIp, rateLimit, tooManyRequests, isValidSessionId, dbErr } from '@/lib/db';

export async function DELETE(request, { params }) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  const sessionId = getSessionHeader(request);
  if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'Missing session' }, { status: 400 });

  const { id } = await params;
  const supabase = createServerClient();
  const { error } = await supabase
    .from('history')
    .delete()
    .eq('id', id)
    .eq('session_id', sessionId);

  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
