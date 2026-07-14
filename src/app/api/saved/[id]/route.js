import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, getClientIp, rateLimit, tooManyRequests, isValidSessionId, dbErr } from '@/lib/db';

export async function PATCH(request, { params }) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  const { id } = await params;
  const sessionId = getSessionHeader(request);
  const { name, slug, method, url, state, collection } = await request.json();
  if (!isValidSessionId(sessionId) || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const fields = { name, slug };
  if (method !== undefined) fields.method = method;
  if (url !== undefined) fields.url = url;
  if (state !== undefined) fields.state = state;
  if (collection !== undefined) fields.collection = collection;

  const supabase = createServerClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const slugToUse = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from('saved_requests')
      .update({ ...fields, slug: slugToUse })
      .eq('id', id)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (!error) return NextResponse.json(data);
    if (error.code !== '23505') return dbErr(error);
  }
  return NextResponse.json({ error: 'Could not generate unique slug' }, { status: 500 });
}

export async function DELETE(request, { params }) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  const { id } = await params;
  const sessionId = getSessionHeader(request);
  if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'Missing session' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase
    .from('saved_requests')
    .delete()
    .eq('id', id)
    .eq('session_id', sessionId);

  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
