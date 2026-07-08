import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { nameToSlug, suggestName } from '@/lib/saved';
import { dbErr } from '@/lib/db';

export async function POST(request) {
  const { sessionId, method, url, state } = await request.json();
  if (!sessionId || !state) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const safeState = {
    ...state,
    auth: { type: 'none' },
    headers: (state.headers ?? []).filter((h) => h.key?.trim().toLowerCase() !== 'authorization'),
  };

  const name = suggestName(method, url) || method;
  const baseSlug = nameToSlug(name);
  const supabase = createServerClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await supabase
      .from('saved_requests')
      .insert({ session_id: sessionId, name, slug, method, url, state: safeState })
      .select('slug')
      .single();

    if (!error) return NextResponse.json({ slug: data.slug });
    if (error.code !== '23505') return dbErr(error);
  }

  return NextResponse.json({ error: 'Could not generate unique slug' }, { status: 500 });
}
