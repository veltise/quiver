'use client';
import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

function parseParams(url) {
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return [];
  return url.slice(qIdx + 1).split('&').filter(Boolean).map(pair => {
    const eqIdx = pair.indexOf('=');
    return {
      id: crypto.randomUUID(),
      key: decodeURIComponent(eqIdx === -1 ? pair : pair.slice(0, eqIdx)),
      value: decodeURIComponent(eqIdx === -1 ? '' : pair.slice(eqIdx + 1)),
    };
  });
}

function serializeUrl(url, params) {
  const base = url.split('?')[0];
  const query = params
    .filter(p => p.key)
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
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
    const next = params.map(p => p.id === id ? { ...p, [field]: val } : p);
    setParams(next);
    const newUrl = serializeUrl(url, next);
    lastSerialized.current = newUrl;
    onChange(newUrl);
  }

  function remove(id) {
    const next = params.filter(p => p.id !== id);
    setParams(next);
    const newUrl = serializeUrl(url, next);
    lastSerialized.current = newUrl;
    onChange(newUrl);
  }

  function add() {
    setParams(prev => [...prev, { id: crypto.randomUUID(), key: '', value: '' }]);
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-gray-800 bg-gray-800/40 rounded-t">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium px-1.5 py-1">Key</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium px-1.5 py-1 border-l border-gray-800">Value</span>
      </div>
      {params.map(p => (
        <div key={p.id} className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-gray-800/40 last:border-0 group/row hover:bg-gray-800/30">
          <input
            className="bg-transparent px-1.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none w-full"
            placeholder="key"
            value={p.key}
            onChange={e => update(p.id, 'key', e.target.value)}
          />
          <input
            className="bg-transparent px-1.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none w-full border-l border-gray-800/60"
            placeholder="value"
            value={p.value}
            onChange={e => update(p.id, 'value', e.target.value)}
          />
          <button
            onClick={() => remove(p.id)}
            aria-label="Remove"
            className="flex items-center justify-center text-transparent group-hover/row:text-gray-600 hover:!text-red-400 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-xs text-gray-700 hover:text-gray-400 transition-colors px-1.5 py-1.5 text-left"
      >
        + Add param
      </button>
    </div>
  );
}
