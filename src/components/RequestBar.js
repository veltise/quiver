'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Timer } from 'lucide-react';
import { methodColor, methodBgClass } from '@/lib/utils';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function RequestBar({ method, url, onMethodChange, onUrlChange, onSend, isLoading, jsonInvalid, isMac, onTimeoutChange, timeout }) {
  const [timeoutInput, setTimeoutInput] = useState(String(timeout ?? 10));
  const [methodOpen, setMethodOpen] = useState(false);
  const methodRef = useRef(null);

  useEffect(() => {
    if (!methodOpen) return;
    function handler(e) {
      if (methodRef.current && !methodRef.current.contains(e.target)) setMethodOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [methodOpen]);

  function handleTimeoutChange(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const v = parseInt(raw, 10);
    const clamped = isNaN(v) ? '' : String(Math.min(v, 10));
    setTimeoutInput(clamped);
    const final = parseInt(clamped, 10);
    if (!isNaN(final) && final >= 1) onTimeoutChange?.(final);
  }

  function handleTimeoutBlur() {
    const v = Math.max(1, Math.min(10, parseInt(timeoutInput, 10) || 10));
    setTimeoutInput(String(v));
    onTimeoutChange?.(v);
  }

  const canSend = !isLoading && (/^https?:\/\/.+/.test(url.trim()) || /^\{\{.+/.test(url.trim())) && !jsonInvalid;

  return (
    <div className="flex flex-col gap-1.5">
    <div className="flex gap-2 items-start">
      {/* ref wraps both the bar AND the dropdown so outside-click works correctly.
          The dropdown must be a sibling of overflow-hidden, not inside it. */}
      <div ref={methodRef} className="relative flex-1 min-w-0">
        {/* Focus ring goes on the wrapper, not the inner input — the input's own
            outline would be clipped by overflow-hidden. */}
        <div className="flex h-11 w-full border border-border bg-surface-raised overflow-hidden transition-colors focus-within:outline-2 focus-within:outline-accent focus-within:outline-offset-1">
          <div className="relative shrink-0 border-r border-border flex items-center transition-colors">
            <button
              type="button"
              onClick={() => setMethodOpen(v => !v)}
              className={`flex items-center w-[5.5rem] pl-3 pr-7 h-full text-body font-bold focus:outline-none cursor-pointer select-none ${methodColor(method)}`}
            >
              {method}
            </button>
            <ChevronDown
              size={11}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform ${methodColor(method)} opacity-50 ${methodOpen ? 'rotate-180' : ''}`}
            />
          </div>
          <input
            type="text"
            placeholder="https://api.example.com/endpoint"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            className="flex-1 bg-transparent  px-4 text-body placeholder-dim focus:outline-none font-mono min-w-0 text-text"
          />
        </div>

        {/* Dropdown rendered outside overflow:hidden so it isn't clipped */}
        {methodOpen && (
          <div className="absolute top-12 left-0 mt-0.5 bg-surface-raised border border-border shadow-2xl py-1 z-50 min-w-[110px]">
            {METHODS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { onMethodChange(m); setMethodOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-body font-bold transition-colors hover:bg-[rgba(242,237,228,.06)] ${methodColor(m)} ${m === method ? 'bg-[rgba(242,237,228,.04)]' : ''}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Send button */}
      <button
        suppressHydrationWarning
        onClick={onSend}
        disabled={!canSend}
        className="chamfer-send shrink-0 h-11 px-6 bg-accent hover:bg-accent-hover active:bg-accent-hover text-ink disabled:bg-surface-raised disabled:text-dim disabled:opacity-60 disabled:cursor-not-allowed text-body font-semibold transition-colors"
      >
        {isLoading ? <span className="inline-flex gap-1"><span className="animate-bounce" style={{animationDelay:'0ms'}}>·</span><span className="animate-bounce" style={{animationDelay:'150ms'}}>·</span><span className="animate-bounce" style={{animationDelay:'300ms'}}>·</span></span> : 'Send'}
      </button>

      {/* Timeout */}
      <div className="flex items-center gap-1.5 h-11 px-2 shrink-0" title="Request timeout (seconds)">
        <Timer size={11} className="text-dim shrink-0" aria-hidden="true" />
        <div className="flex items-baseline">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Request timeout in seconds"
            value={timeoutInput}
            onChange={handleTimeoutChange}
            onBlur={handleTimeoutBlur}
            className="w-5 bg-transparent text-body text-right focus:outline-none text-muted focus:text-text transition-colors"
          />
          <span className="text-dim text-body">s</span>
        </div>
      </div>
    </div>
    <span suppressHydrationWarning className="font-mono text-micro text-dim">
      {isMac ? '⌘' : 'Ctrl'}+↵ to send
    </span>
    </div>
  );
}
