'use client';

import { useState, useEffect, useRef } from 'react';

function parseParams(url) {
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return [];
  return url.slice(qIdx + 1).split('&').filter(Boolean).map((pair) => {
    const eqIdx = pair.indexOf('=');
    return {
      id: Math.random().toString(36).slice(2),
      key: decodeURIComponent(eqIdx === -1 ? pair : pair.slice(0, eqIdx)),
      value: decodeURIComponent(eqIdx === -1 ? '' : pair.slice(eqIdx + 1)),
    };
  });
}

function serializeUrl(url, params) {
  const base = url.split('?')[0];
  const query = params
    .filter((p) => p.key)
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return query ? `${base}?${query}` : base;
}

export default function ParamsEditor({ url, onChange }) {
  const [params, setParams] = useState(() => parseParams(url));
  const lastSerialized = useRef(url);

  useEffect(() => {
    if (url !== lastSerialized.current) {
      setParams(parseParams(url));
      lastSerialized.current = url;
    }
  }, [url]);

  function update(id, field, val) {
    const next = params.map((p) => (p.id === id ? { ...p, [field]: val } : p));
    setParams(next);
    const newUrl = serializeUrl(url, next);
    lastSerialized.current = newUrl;
    onChange(newUrl);
  }

  function remove(id) {
    const next = params.filter((p) => p.id !== id);
    setParams(next);
    const newUrl = serializeUrl(url, next);
    lastSerialized.current = newUrl;
    onChange(newUrl);
  }

  function add() {
    setParams((prev) => [...prev, { id: Math.random().toString(36).slice(2), key: '', value: '' }]);
  }

  return (
    <div className="space-y-2">
      {params.map((p) => (
        <div key={p.id} className="flex gap-2 items-center">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="key"
            value={p.key}
            onChange={(e) => update(p.id, 'key', e.target.value)}
          />
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="value"
            value={p.value}
            onChange={(e) => update(p.id, 'value', e.target.value)}
          />
          <button
            onClick={() => remove(p.id)}
            className="px-2 text-gray-500 hover:text-red-400 transition-colors"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        + Add param
      </button>
    </div>
  );
}
