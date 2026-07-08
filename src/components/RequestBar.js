'use client';

import { useState, useEffect } from 'react';
import { methodColor } from '@/lib/utils';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TIMEOUT_KEY = 'api-playground-timeout';

export default function RequestBar({ method, url, onMethodChange, onUrlChange, onSend, isLoading, jsonInvalid, isMac, onTimeoutChange }) {
  const [timeoutInput, setTimeoutInput] = useState('30');

  useEffect(() => {
    const stored = localStorage.getItem(TIMEOUT_KEY);
    if (stored) setTimeoutInput(stored);
  }, []);

  function handleTimeoutChange(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setTimeoutInput(raw);
    const v = parseInt(raw, 10);
    if (!isNaN(v) && v >= 1 && v <= 300) {
      localStorage.setItem(TIMEOUT_KEY, String(v));
      onTimeoutChange?.(v);
    }
  }

  function handleTimeoutBlur() {
    const v = Math.max(1, Math.min(300, parseInt(timeoutInput, 10) || 30));
    setTimeoutInput(String(v));
    localStorage.setItem(TIMEOUT_KEY, String(v));
    onTimeoutChange?.(v);
  }

  const canSend = !isLoading && (/^https?:\/\/.+/.test(url.trim()) || /^\{\{.+/.test(url.trim())) && !jsonInvalid;

  return (
    <div className="flex gap-2 items-start">
      {/* Unified method + URL input group */}
      <div className="flex h-11 flex-1 rounded-lg border border-gray-700 bg-gray-900 focus-within:border-gray-600 overflow-hidden transition-colors">
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value)}
          className={`shrink-0 bg-transparent pl-3 pr-2 text-sm font-bold border-r border-gray-700 focus:outline-none cursor-pointer ${methodColor(method)}`}
        >
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <input
          type="text"
          placeholder="https://api.example.com/endpoint"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          className="flex-1 bg-transparent px-4 text-sm placeholder-gray-600 focus:outline-none font-mono min-w-0"
        />
      </div>

      {/* Send button with shortcut hint */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <button
          suppressHydrationWarning
          onClick={onSend}
          disabled={!canSend}
          className="h-11 px-6 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 active:translate-y-px disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all duration-100"
        >
          Send
        </button>
        <span suppressHydrationWarning className="text-xs text-gray-700 whitespace-nowrap">
          {isMac ? '⌘' : 'Ctrl'}+↵
        </span>
      </div>

      {/* Timeout */}
      <div className="flex items-center gap-1 h-11 border border-gray-700 rounded-lg px-2 shrink-0 bg-gray-900" title="Request timeout (seconds)">
        <input
          type="text"
          inputMode="numeric"
          value={timeoutInput}
          onChange={handleTimeoutChange}
          onBlur={handleTimeoutBlur}
          className="w-9 bg-transparent text-sm text-center focus:outline-none text-gray-500"
        />
        <span className="text-gray-600 text-xs">s</span>
      </div>
    </div>
  );
}
