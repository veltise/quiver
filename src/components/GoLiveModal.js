'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import PulsingDot from './PulsingDot';
// Same helper the API routes use — the server strips again on write regardless,
// but sending a stripped state means the token never leaves the browser at all.
import { stripAuth } from '@/lib/live';

export default function GoLiveModal({ req, onCancel }) {
  const [includeAuth, setIncludeAuth] = useState(false);
  const [collaborative, setCollaborative] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const state = includeAuth ? req : stripAuth(req);
      const res = await fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, includeAuth, isCollaborative: collaborative }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create session');
      }
      const { id, hostToken } = await res.json();
      localStorage.setItem(`live-host-${id}`, hostToken);
      window.location.href = `/live/${id}`;
    } catch (e) {
      setError(e.message);
      setStarting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onCancel} />
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-xl shadow-2xl p-6 w-96">
        <div className="flex items-center gap-2 mb-1">
          <PulsingDot />
          <h2 className="text-sm font-semibold text-text">Start a live session</h2>
        </div>
        <p className="text-xs text-muted mb-4">
          Share the session URL with teammates. Sessions expire after 24 hours.
        </p>

        {/* Mode picker */}
        <div className="flex gap-2 mb-4">
          {[
            { value: true, label: 'Collaborative', desc: 'Everyone can edit' },
            { value: false, label: 'Demo', desc: 'Viewers watch only' },
          ].map(({ value, label, desc }) => (
            <button
              key={label}
              type="button"
              onClick={() => setCollaborative(value)}
              className={`flex-1 rounded-lg border p-3 text-left transition-colors ${collaborative === value ? 'border-accent/60 bg-accent/8' : 'border-border hover:border-border-strong'}`}
            >
              <div className={`text-xs font-medium mb-0.5 ${collaborative === value ? 'text-accent' : 'text-text'}`}>{label}</div>
              <div className="text-xs text-dim">{desc}</div>
            </button>
          ))}
        </div>

        {/* Auth toggle */}
        <button
          type="button"
          onClick={() => setIncludeAuth((v) => !v)}
          className="w-full flex items-start gap-3 text-left mb-4 group"
        >
          <div className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${includeAuth ? 'bg-accent border-accent' : 'border-border-strong bg-surface-raised group-hover:border-border-strong'}`}>
            {includeAuth && (
              <svg viewBox="0 0 12 12" className="w-3 h-3 text-text" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2 6l3 3 5-5" />
              </svg>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-text">
              <ShieldAlert size={12} className={includeAuth ? 'text-warning' : 'text-dim'} />
              Share auth tokens
            </div>
            <div className="text-xs text-dim mt-0.5 leading-relaxed">
              Bearer tokens and Authorization headers will be visible to all participants
            </div>
          </div>
        </button>

        {includeAuth && (
          <div className="mb-4 bg-warning/10 border border-warning/25 rounded-lg px-3 py-2">
            <p className="text-xs text-warning leading-relaxed">
              Anyone with the session link will be able to see your auth tokens. Only share with people you trust.
            </p>
          </div>
        )}

        {error && <p className="text-xs text-error mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-sm px-4 py-2 text-muted hover:text-text transition-colors">
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={starting}
            className="text-sm px-4 py-2 bg-error hover:bg-error disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-text"
          >
            {starting ? 'Starting…' : 'Go Live'}
          </button>
        </div>
      </div>
    </>
  );
}
