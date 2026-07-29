import { createServerClient } from '@/lib/supabase';
import LiveSession from '@/components/LiveSession';

// Live session links can carry shared auth tokens — never let them get crawled/indexed
export const metadata = { robots: { index: false, follow: false } };

export default async function LivePage({ params }) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data } = await supabase
    .from('live_sessions')
    .select('id, state, response, include_auth, is_collaborative, host_connected, expires_at')
    .eq('id', id)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-muted font-mono text-sm mb-2">Session not found</p>
          <p className="text-dim text-xs mb-4">This live session may have ended or expired.</p>
          <a href="/" className="text-accent hover:text-accent text-sm font-mono transition-colors">
            ← Go to Quiver
          </a>
        </div>
      </div>
    );
  }

  return (
    <LiveSession
      sessionId={data.id}
      initialState={data.state}
      initialResponse={data.response}
      includeAuth={data.include_auth}
      isCollaborative={data.is_collaborative !== false}
      initialHostConnected={data.host_connected}
      expiresAt={data.expires_at}
    />
  );
}
