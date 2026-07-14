'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { applyEnv } from '@/lib/env';
import { buildEffectiveHeaders, buildBody, readStreamBody } from '@/lib/request';
import { encryptState } from '@/lib/crypto';
import { nameToSlug, suggestName } from '@/lib/saved';
import { extractGroup, isJsonInvalid } from '@/lib/utils';
import { ENV_SETS_KEY } from '@/lib/constants';
import { getSessionId } from '@/lib/session';
import { DEFAULT_STATE } from './Playground';
import ParamsEditor from './ParamsEditor';
import PulsingDot from './PulsingDot';
import HeadersEditor from './HeadersEditor';
import ResponsePanel from './ResponsePanel';
import BodyEditor from './BodyEditor';
import AuthEditor from './AuthEditor';
import RequestBar from './RequestBar';

const PRESENCE_COLORS = ['#a78bfa', '#34d399', '#f472b6', '#fb923c', '#60a5fa', '#fbbf24', '#f87171'];

function LiveTabButton({ id, activeTab, onClick, viewers, myId, children }) {
  const others = viewers.filter((v) => v.id !== myId && v.activeTab === id);
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm transition-colors flex items-center gap-1.5 ${activeTab === id ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}
    >
      {children}
      {others.slice(0, 3).map((v) => (
        <span
          key={v.id}
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.isTyping ? 'animate-pulse scale-125' : ''}`}
          style={{ backgroundColor: v.color }}
          title={v.isTyping ? 'Typing…' : v.isHost ? 'Host' : 'Viewer'}
        />
      ))}
    </button>
  );
}

function useExpiry(expiresAt) {
  const [label, setLabel] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const exp = new Date(expiresAt).getTime();
    function tick() {
      const ms = exp - Date.now();
      if (ms <= 0) { setLabel('Expired'); setUrgent(true); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setUrgent(ms < 5 * 60 * 1000);
      if (h >= 1) setLabel(`${h}h ${m}m left`);
      else setLabel(`${m}m left`);
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { label, urgent };
}

export default function LiveSession({
  sessionId, initialState, initialResponse, includeAuth,
  isCollaborative, initialHostConnected, expiresAt,
}) {
  const [req, setReq] = useState(initialState ?? DEFAULT_STATE);
  const [response, setResponse] = useState(initialResponse ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('headers');
  const [viewers, setViewers] = useState([]);
  const [hostConnected, setHostConnected] = useState(initialHostConnected);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [envSets, setEnvSets] = useState([]);
  const [activeEnvId, setActiveEnvId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [channelStatus, setChannelStatus] = useState('connecting');
  const [reconnectKey, setReconnectKey] = useState(0);
  const [forking, setForking] = useState(false);

  const lastLocalRef = useRef(0);
  const syncTimerRef = useRef(null);
  const hostTokenRef = useRef(null);
  const myPresenceRef = useRef(null);
  const sendRequestRef = useRef(null);
  const channelRef = useRef(null);
  const typingTimersRef = useRef({});
  const typingDebounceRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const subscribedRef = useRef(false);

  const envVars = envSets.find((s) => s.id === activeEnvId)?.vars ?? [];
  const showBody = !['GET', 'HEAD'].includes(req.method);
  const jsonInvalid = isJsonInvalid(req.bodyType, req.body);
  const canEdit = isHost || isCollaborative;
  const myId = myPresenceRef.current?.id;
  const otherCount = viewers.filter((v) => v.id !== myId).length;

  const { label: expiryLabel, urgent: expiryUrgent } = useExpiry(expiresAt);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
    const hostTok = localStorage.getItem(`live-host-${sessionId}`);
    hostTokenRef.current = hostTok;
    setIsHost(!!hostTok);

    let presenceId = sessionStorage.getItem(`live-presence-${sessionId}`);
    if (!presenceId) {
      presenceId = crypto.randomUUID().slice(0, 8);
      sessionStorage.setItem(`live-presence-${sessionId}`, presenceId);
    }
    myPresenceRef.current = {
      id: presenceId,
      color: PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)],
      isHost: !!hostTok,
      activeTab: 'headers',
    };

    try {
      const stored = JSON.parse(localStorage.getItem(ENV_SETS_KEY));
      if (stored?.sets?.length) {
        setEnvSets(stored.sets);
        setActiveEnvId(stored.activeId ?? stored.sets[0].id);
      }
    } catch {}

    setInitialized(true);
  }, [sessionId]);

  // Re-fetch state when tab becomes visible (catches missed realtime events)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) return;
      fetch(`/api/live/${sessionId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.state && Date.now() - lastLocalRef.current > 1000) setReq(data.state);
          if ('response' in data) setResponse(data.response ?? null);
        })
        .catch(() => {});
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sessionId]);

  useEffect(() => {
    if (!initialized) return;
    setChannelStatus('connecting');

    const supabase = createBrowserClient();
    const channel = supabase.channel(`live:${sessionId}`);
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const all = Object.values(channel.presenceState()).flat();
        const byId = new Map();
        all.forEach((v) => { if (v.id) byId.set(v.id, v); });
        // preserve live isTyping so a presence sync doesn't kill the indicator mid-type
        setViewers((prev) => {
          const typingById = new Map(prev.map((v) => [v.id, v.isTyping]));
          return [...byId.values()].map((v) => ({ ...v, isTyping: typingById.get(v.id) ?? false }));
        });
      })
      .on('broadcast', { event: 'tab_change' }, ({ payload }) => {
        if (!payload?.id || !payload?.tab) return;
        setViewers((prev) =>
          prev.map((v) => (v.id === payload.id ? { ...v, activeTab: payload.tab } : v))
        );
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.id) return;
        setViewers((prev) =>
          prev.map((v) => (v.id === payload.id ? { ...v, isTyping: payload.active } : v))
        );
        if (payload.active) {
          clearTimeout(typingTimersRef.current[payload.id]);
          typingTimersRef.current[payload.id] = setTimeout(() => {
            setViewers((prev) =>
              prev.map((v) => (v.id === payload.id ? { ...v, isTyping: false } : v))
            );
          }, 2000);
        } else {
          clearTimeout(typingTimersRef.current[payload.id]);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        if (payload.new.host_connected === false) setHostConnected(false);
        if (Date.now() - lastLocalRef.current > 600) {
          if (payload.new.state) setReq(payload.new.state);
          if ('response' in payload.new) setResponse(payload.new.response ?? null);
        }
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'live_sessions',
        filter: `id=eq.${sessionId}`,
      }, () => {
        setSessionEnded(true);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          reconnectAttemptsRef.current = 0;
          subscribedRef.current = true;
          setChannelStatus('connected');
          await channel.track(myPresenceRef.current);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setChannelStatus('error');
          // Auto-retry up to 3 times, then require manual reconnect
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current++;
            setTimeout(() => setReconnectKey((k) => k + 1), 2500);
          }
        } else if (status === 'CLOSED') {
          setChannelStatus('disconnected');
        }
      });

    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId, initialized, reconnectKey]);

  useEffect(() => { sendRequestRef.current = sendRequest; });
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendRequestRef.current?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function sendTyping() {
    if (!subscribedRef.current || !channelRef.current || !canEdit) return;
    const id = myPresenceRef.current?.id;
    if (!id) return;
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { id, active: true } });
    clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id, active: false } });
    }, 1500);
  }

  function changeTab(tab) {
    setActiveTab(tab);
    if (!myPresenceRef.current) return;
    myPresenceRef.current = { ...myPresenceRef.current, activeTab: tab };
    if (!subscribedRef.current) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'tab_change',
      payload: { id: myPresenceRef.current.id, tab },
    });
  }

  function syncState(newReq) {
    lastLocalRef.current = Date.now();
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/live/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: newReq }),
        });
      } catch {}
    }, 400);
  }

  function updateReq(updater) {
    if (!canEdit) return;
    setReq((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      syncState(next);
      return next;
    });
  }

  async function sendRequest() {
    if (!canEdit || !req.url?.trim() || jsonInvalid) return;
    setIsLoading(true);
    setResponse(null);
    try {
      const effectiveHeaders = buildEffectiveHeaders(req)
        .filter((h) => h.key?.trim())
        .map((h) => ({
          ...h,
          key: applyEnv(h.key, envVars),
          value: applyEnv(h.value, envVars),
        }));
      const envReq = {
        ...req,
        body: applyEnv(req.body ?? '', envVars),
        graphqlQuery: applyEnv(req.graphqlQuery ?? '', envVars),
        formFields: (req.formFields ?? []).map((f) => ({
          ...f,
          key: applyEnv(f.key, envVars),
          value: applyEnv(f.value ?? '', envVars),
        })),
      };
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: applyEnv(req.url, envVars),
          method: req.method,
          headers: effectiveHeaders,
          body: buildBody(envReq) ?? undefined,
        }),
      });

      let data;
      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        const status = parseInt(res.headers.get('x-proxy-status') ?? '200');
        const statusText = res.headers.get('x-proxy-status-text') ?? '';
        const time = parseInt(res.headers.get('x-proxy-time') ?? '0');
        let resHeaders = {};
        try { resHeaders = JSON.parse(atob(res.headers.get('x-proxy-headers') ?? 'e30=')); } catch {}
        setIsLoading(false);
        setResponse({ status, statusText, time, headers: resHeaders, body: '', streaming: true });
        let body = '';
        try {
          body = await readStreamBody(res.body, (accumulated) => {
            setResponse((prev) => ({ ...prev, body: accumulated, streaming: true }));
          });
        } catch {}
        data = { status, statusText, time, headers: resHeaders, body };
        setResponse({ ...data, streaming: false });
      } else {
        data = await res.json();
        setResponse(data);
      }

      lastLocalRef.current = Date.now();
      await fetch(`/api/live/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: data }),
      });
    } catch {
      setResponse({ error: 'Failed to reach proxy' });
    } finally {
      setIsLoading(false);
    }
  }

  async function forkToWorkspace() {
    if (!req.url?.trim()) return;
    setForking(true);
    try {
      const sessionId_ = getSessionId();
      const name = suggestName(req.method, req.url ?? '') || `${req.method} request`;
      const slug = nameToSlug(name) + '-' + Math.random().toString(36).slice(2, 7);
      const encState = await encryptState(req);
      await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId_,
          entry: { name, slug, method: req.method, url: req.url ?? '', state: encState, collection: extractGroup(req.url ?? '') },
        }),
      });
      window.location.href = '/';
    } catch {
      setForking(false);
    }
  }

  async function endSession() {
    try {
      await fetch(`/api/live/${sessionId}`, {
        method: 'DELETE',
        headers: { 'x-host-token': hostTokenRef.current },
      });
      localStorage.removeItem(`live-host-${sessionId}`);
    } catch {}
    window.location.href = '/';
  }

  function copySessionUrl() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }

  if (sessionEnded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-gray-400 font-mono text-sm mb-2">Session ended</p>
          <p className="text-gray-600 text-xs mb-4">The host ended this live session.</p>
          <a href="/" className="text-indigo-400 hover:text-indigo-300 text-sm font-mono transition-colors">← Go to Quiver</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Reconnect banner — shown after 3 auto-retries fail */}
      {channelStatus === 'error' && reconnectAttemptsRef.current >= 3 && (
        <div className="bg-yellow-950/60 border-b border-yellow-500/30 px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-yellow-400">Connection lost — changes may not sync</span>
          <button
            onClick={() => { reconnectAttemptsRef.current = 0; setReconnectKey((k) => k + 1); }}
            className="text-xs text-yellow-300 hover:text-yellow-100 transition-colors px-2 py-0.5 rounded border border-yellow-500/40 hover:border-yellow-400"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Live banner */}
      <div className={`border-b px-6 py-2.5 flex items-center justify-between ${hostConnected ? 'border-red-500/20 bg-red-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {hostConnected ? <PulsingDot /> : <span className="h-2 w-2 rounded-full bg-yellow-500 inline-block" />}
            <span className={`text-xs font-semibold tracking-wide ${hostConnected ? 'text-red-400' : 'text-yellow-400'}`}>
              {hostConnected ? 'LIVE' : 'HOST DISCONNECTED'}
            </span>
          </div>
          {!isCollaborative && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">
              {isHost ? 'Demo mode' : 'View only'}
            </span>
          )}
          <button
            onClick={copySessionUrl}
            title="Click to copy session URL"
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors font-mono"
          >
            {urlCopied ? '✓ Copied!' : `…/live/${sessionId}`}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {expiryLabel && (
            <span className={`text-xs ${expiryUrgent ? 'text-orange-400' : 'text-gray-600'}`}>
              {expiryLabel}
            </span>
          )}

          {viewers.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center -space-x-1">
                {viewers.slice(0, 7).map((v) => (
                  <div
                    key={v.id}
                    className="w-5 h-5 rounded-full border-2 border-gray-900 flex items-center justify-center text-[9px] font-bold"
                    style={{ backgroundColor: v.color }}
                    title={v.isHost ? 'Host' : 'Viewer'}
                  >
                    {v.isHost ? '★' : ''}
                  </div>
                ))}
                {viewers.length > 7 && (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-900 bg-gray-700 flex items-center justify-center text-[9px] text-gray-400">
                    +{viewers.length - 7}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-600">
                {otherCount === 0 ? 'Just you' : `${otherCount} other${otherCount !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}

          {!includeAuth && (
            <span className="text-xs text-gray-700" title="Auth tokens are not shared in this session">auth hidden</span>
          )}

          {!isHost && (
            <button
              onClick={forkToWorkspace}
              disabled={forking}
              className="text-xs px-3 py-1 rounded border border-indigo-500/40 text-indigo-400 hover:text-indigo-300 hover:border-indigo-400 disabled:opacity-40 transition-colors"
            >
              {forking ? 'Saving…' : 'Fork to workspace'}
            </button>
          )}

          <button
            onClick={isHost ? endSession : () => { window.location.href = '/'; }}
            className="text-xs px-3 py-1 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            {isHost ? 'End session' : 'Leave'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-6 gap-5">
        <div className={!canEdit ? 'pointer-events-none select-none' : ''} onInput={canEdit ? sendTyping : undefined}>
          {!canEdit && (
            <div className="mb-2 text-center">
              <span className="text-xs text-gray-600">View only — only the host can edit in demo mode</span>
            </div>
          )}
          <RequestBar
            method={req.method}
            url={req.url}
            onMethodChange={(method) => {
              updateReq((r) => ({ ...r, method }));
              if (['GET', 'HEAD'].includes(method) && activeTab === 'body') changeTab('headers');
            }}
            onUrlChange={(url) => updateReq((r) => ({ ...r, url }))}
            onSend={sendRequest}
            isLoading={isLoading}
            jsonInvalid={jsonInvalid}
            isMac={isMac}
          />

          <div className="border border-gray-800 rounded-lg overflow-hidden mt-5">
            {viewers.some((v) => v.id !== myId && v.isTyping) && (
              <div className="flex items-center gap-1.5 px-3 py-1 border-b border-indigo-500/20 bg-indigo-500/5">
                {viewers.filter((v) => v.id !== myId && v.isTyping).map((v) => (
                  <span key={v.id} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: v.color }} />
                ))}
                <span className="text-xs text-indigo-400/70">typing…</span>
              </div>
            )}
            <div className="flex border-b border-gray-800 bg-gray-900/50">
              <TabButton id="params" activeTab={activeTab} onClick={() => changeTab('params')} viewers={viewers} myId={myId}>
                Params
                {req.url?.includes('?') && (
                  <span className="ml-1.5 text-xs text-gray-500">({req.url.split('?')[1].split('&').filter(Boolean).length})</span>
                )}
              </TabButton>
              <TabButton id="headers" activeTab={activeTab} onClick={() => changeTab('headers')} viewers={viewers} myId={myId}>
                Headers
                {(req.headers?.length ?? 0) > 0 && <span className="ml-1.5 text-xs text-gray-500">({req.headers.length})</span>}
              </TabButton>
              <TabButton id="auth" activeTab={activeTab} onClick={() => changeTab('auth')} viewers={viewers} myId={myId}>
                Auth
                {req.auth?.type !== 'none' && <span className="ml-1.5 text-xs text-indigo-400">●</span>}
              </TabButton>
              {showBody && (
                <TabButton id="body" activeTab={activeTab} onClick={() => changeTab('body')} viewers={viewers} myId={myId}>
                  Body
                  {req.bodyType !== 'none' && (
                    <span className={`ml-1.5 text-xs ${jsonInvalid ? 'text-red-400' : 'text-gray-500'}`}>
                      {jsonInvalid ? '!' : `(${req.bodyType})`}
                    </span>
                  )}
                </TabButton>
              )}
            </div>
            <div className="p-4">
              {activeTab === 'params' && <ParamsEditor url={req.url} onChange={(url) => updateReq((r) => ({ ...r, url }))} />}
              {activeTab === 'headers' && <HeadersEditor headers={req.headers ?? []} onChange={(headers) => updateReq((r) => ({ ...r, headers }))} />}
              {activeTab === 'auth' && <AuthEditor auth={req.auth} onChange={(auth) => updateReq((r) => ({ ...r, auth }))} />}
              {activeTab === 'body' && showBody && (
                <BodyEditor
                  bodyType={req.bodyType}
                  body={req.body}
                  formFields={req.formFields ?? []}
                  graphqlQuery={req.graphqlQuery ?? ''}
                  graphqlVariables={req.graphqlVariables ?? '{}'}
                  onChange={({ bodyType, body, formFields, graphqlQuery, graphqlVariables }) => {
                    const updates = { bodyType, body, formFields, graphqlQuery, graphqlVariables };
                    if (bodyType === 'graphql' && ['GET', 'HEAD'].includes(req.method)) updates.method = 'POST';
                    updateReq((r) => ({ ...r, ...updates }));
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Response panel — overlay blocks interaction in demo mode while keeping content visible/scrollable */}
        <div className="border border-gray-800 rounded-lg overflow-hidden relative">
          {!canEdit && (
            <div className="absolute inset-0 z-10 cursor-default" title="View only in demo mode" />
          )}
          <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-2.5">
            <span className="text-sm text-gray-500">Response</span>
          </div>
          <div className="p-4">
            <ResponsePanel response={response} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
