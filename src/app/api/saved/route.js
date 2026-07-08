import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, dbErr } from '@/lib/db';

export async function GET(request) {
  const sessionId = getSessionHeader(request);
  if (!sessionId) return NextResponse.json([], { status: 200 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('saved_requests')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) return dbErr(error);
  return NextResponse.json(data);
}

export async function POST(request) {
  const { sessionId, entry } = await request.json();
  if (!sessionId || !entry) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const supabase = createServerClient();
  const baseSlug = entry.slug;

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from('saved_requests')
      .insert({ session_id: sessionId, name: entry.name, slug, method: entry.method, url: entry.url, state: entry.state, collection: entry.collection ?? '' })
      .select()
      .single();

    if (!error) return NextResponse.json(data);
    if (error.code !== '23505') return dbErr(error);
  }

  return NextResponse.json({ error: 'Could not generate unique slug' }, { status: 500 });
}

export async function DELETE(request) {
  const sessionId = getSessionHeader(request);
  if (!sessionId) return NextResponse.json({ error: 'Missing session' }, { status: 400 });
  const supabase = createServerClient();
  const { error } = await supabase.from('saved_requests').delete().eq('session_id', sessionId);
  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
