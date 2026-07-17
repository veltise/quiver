import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(_req, { params }) {
  const { slug } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('saved_requests')
    .select('state')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data.state);
}
