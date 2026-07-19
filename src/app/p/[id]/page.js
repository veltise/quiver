import Playground from '@/components/Playground';
import { createServerClient } from '@/lib/supabase';

export const metadata = { robots: { index: false, follow: false } };

export default async function SharedPage({ params }) {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-red-400 font-mono text-sm">Share link not found.</p>
      </div>
    );
  }

  return <Playground initialState={data.state} isShared />;
}
