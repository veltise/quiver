import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { nameToSlug, suggestName } from '@/lib/saved';
import { dbErr, getClientIp, rateLimit, tooManyRequests, isValidSessionId } from '@/lib/db';

const MAX_SHARES_PER_SESSION = 200;

export async function POST(request) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();

  const { sessionId, method, url, state } = await request.json();
  if (!isValidSessionId(sessionId) || !state) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  if (url.length > 4096) return NextResponse.json({ error: 'URL too long' }, { status: 400 });
  if (JSON.stringify(state).length > 100 * 1024) return NextResponse.json({ error: 'State too large' }, { status: 413 });

  const supabase = createServerClient();
  const { count } = await supabase
    .from('saved_requests')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (count >= MAX_SHARES_PER_SESSION) {
    return NextResponse.json({ error: 'Share limit reached' }, { status: 429 });
  }

  const safeState = {
    ...state,
    auth: { type: 'none' },
    headers: (state.headers ?? []).filter((h) => h.key?.trim().toLowerCase() !== 'authorization'),
  };

  const name = suggestName(method, url) || method;
  const baseSlug = nameToSlug(name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await supabase
      .from('saved_requests')
      .insert({ session_id: sessionId, name, slug, state: safeState })
      .select('slug')
      .single();

    if (!error) return NextResponse.json({ slug: data.slug });
    if (error.code !== '23505') return dbErr(error);
  }

  return NextResponse.json({ error: 'Could not generate unique slug' }, { status: 500 });
}
