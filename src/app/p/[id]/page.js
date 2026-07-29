import { headers } from 'next/headers';
import Playground from '@/components/Playground';
import { createServerClient } from '@/lib/supabase';
import { getClientIp, rateLimit } from '@/lib/db';

export const metadata = { robots: { index: false, follow: false } };

export default async function SharedPage({ params }) {
  const ip = getClientIp({ headers: await headers() });
  if (!await rateLimit(`read:${ip}`, { limit: 60, window: 60 })) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-error font-mono text-sm">Too many requests. Try again in a moment.</p>
      </div>
    );
  }

  const { id } = await params;
  const supabase = createServerClient();
  const { data } = await supabase
    .from('saved_requests')
    .select('state')
    .eq('slug', id)
    .eq('is_public', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .single();

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-error font-mono text-sm">Share link not found.</p>
      </div>
    );
  }

  return <Playground initialState={data.state} isShared />;
}
