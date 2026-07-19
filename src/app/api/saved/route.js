import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getSessionHeader, getClientIp, rateLimit, tooManyRequests, isValidSessionId, dbErr } from '@/lib/db';
import { isEncryptedState } from '@/lib/crypto';

const MAX_SAVED_PER_SESSION = 200;

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
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();

  const { sessionId, entry } = await request.json();
  if (!isValidSessionId(sessionId) || !entry) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (typeof entry.name !== 'string' || !entry.name.trim()) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  if (entry.name.length > 200) return NextResponse.json({ error: 'Name too long' }, { status: 400 });
  if (typeof entry.url !== 'string' || entry.url.length > 4096) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  if (typeof entry.slug !== 'string' || entry.slug.length > 220 || !/^[a-z0-9][a-z0-9-]*$/.test(entry.slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  if (typeof entry.collection === 'string' && entry.collection.length > 100) return NextResponse.json({ error: 'Collection name too long' }, { status: 400 });
  if (JSON.stringify(entry.state ?? {}).length > 100 * 1024) return NextResponse.json({ error: 'State too large' }, { status: 413 });
  // saved_requests rows are reachable by slug via /p/[slug] — a private save must never
  // be storable as plaintext, or a future bug (or a crafted direct request) could make
  // it unintentionally public. See AGENTS.md.
  if (!isEncryptedState(entry.state)) return NextResponse.json({ error: 'State must be encrypted' }, { status: 400 });

  const supabase = createServerClient();

  const { count } = await supabase
    .from('saved_requests')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (count >= MAX_SAVED_PER_SESSION) {
    return NextResponse.json({ error: 'Saved request limit reached (max 200)' }, { status: 429 });
  }

  const baseSlug = entry.slug;

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from('saved_requests')
      .insert({ session_id: sessionId, name: entry.name, slug, state: entry.state, collection: entry.collection ?? '', is_public: false })
      .select()
      .single();

    if (!error) return NextResponse.json(data);
    if (error.code !== '23505') return dbErr(error);
  }

  return NextResponse.json({ error: 'Could not generate unique slug' }, { status: 500 });
}

export async function DELETE(request) {
  if (!await rateLimit(`write:${getClientIp(request)}`, { limit: 30, window: 60 })) return tooManyRequests();
  const sessionId = getSessionHeader(request);
  if (!isValidSessionId(sessionId)) return NextResponse.json({ error: 'Missing session' }, { status: 400 });
  const supabase = createServerClient();
  const { error } = await supabase.from('saved_requests').delete().eq('session_id', sessionId);
  if (error) return dbErr(error);
  return NextResponse.json({ ok: true });
}
