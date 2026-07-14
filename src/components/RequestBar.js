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
    <div className="flex gap-2 items-start">
      {/* ref wraps both the bar AND the dropdown so outside-click works correctly.
          The dropdown must be a sibling of overflow-hidden, not inside it. */}
      <div ref={methodRef} className="relative flex-1 min-w-0">
        <div className="flex h-11 w-full rounded-lg border border-gray-700 bg-gray-900 focus-within:border-gray-600 overflow-hidden transition-colors">
          <div className={`relative shrink-0 border-r border-gray-700/60 flex items-center transition-colors ${methodBgClass(method)}`}>
            <button
              type="button"
              onClick={() => setMethodOpen(v => !v)}
              className={`flex items-center w-[5.5rem] pl-3 pr-7 h-full text-sm font-bold focus:outline-none cursor-pointer select-none ${methodColor(method)}`}
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
            className="flex-1 bg-transparent px-4 text-sm placeholder-gray-700 focus:outline-none font-mono min-w-0 text-gray-100"
          />
        </div>

        {/* Dropdown rendered outside overflow:hidden so it isn't clipped */}
        {methodOpen && (
          <div className="absolute top-12 left-0 mt-0.5 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 z-50 min-w-[110px]">
            {METHODS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { onMethodChange(m); setMethodOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors hover:bg-gray-800 ${methodColor(m)} ${m === method ? 'bg-gray-800/50' : ''}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Send button */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <button
          suppressHydrationWarning
          onClick={onSend}
          disabled={!canSend}
          className="h-11 px-6 bg-indigo-600 hover:bg-indigo-800 active:bg-indigo-800 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? <span className="inline-flex gap-1"><span className="animate-bounce" style={{animationDelay:'0ms'}}>·</span><span className="animate-bounce" style={{animationDelay:'150ms'}}>·</span><span className="animate-bounce" style={{animationDelay:'300ms'}}>·</span></span> : 'Send →'}
        </button>
        <span suppressHydrationWarning className="text-xs text-gray-700 whitespace-nowrap">
          {isMac ? '⌘' : 'Ctrl'}+↵
        </span>
      </div>

      {/* Timeout */}
      <div className="flex items-center gap-1 h-11 border border-gray-700 rounded-lg px-2 shrink-0 bg-gray-900 hover:border-gray-600 transition-colors" title="Request timeout (seconds)">
        <Timer size={11} className="text-gray-600 shrink-0" aria-hidden="true" />
        <input
          type="text"
          inputMode="numeric"
          aria-label="Request timeout in seconds"
          value={timeoutInput}
          onChange={handleTimeoutChange}
          onBlur={handleTimeoutBlur}
          className="w-9 bg-transparent text-sm text-center focus:outline-none text-gray-500 focus:text-gray-300 transition-colors"
        />
        <span className="text-gray-600 text-xs">s</span>
      </div>
    </div>
  );
}
