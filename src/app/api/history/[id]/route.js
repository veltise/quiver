import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, isValidSessionId, dbErr } from '@/lib/db';

export async function DELETE(request, { params }) {
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
