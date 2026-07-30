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
  const [lastAdded, setLastAdded] = useState(null);
  const [pendingFocus, setPendingFocus] = useState(null);
  const lastSerialized = useRef(url);
  const keyRef = useRef(null);
  const valueRef = useRef(null);

  useEffect(() => {
    if (url !== lastSerialized.current) {
      setParams(parseParams(url));
      lastSerialized.current = url;
    }
  }, [url]);

  useEffect(() => {
    if (!pendingFocus) return;
    const el = (pendingFocus === 'key' ? keyRef : valueRef).current;
    if (el) {
      el.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, params]);

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

  function add(focusField) {
    const id = crypto.randomUUID();
    setParams(prev => [...prev, { id, key: '', value: '' }]);
    setLastAdded(id);
    if (focusField) setPendingFocus(focusField);
  }

  // The ghost row's only job is creating the FIRST row — bail if one exists
  function ghostAdd(field) {
    if (params.length > 0) return;
    add(field);
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-micro uppercase tracking-[0.09em] text-dim">Query parameters</span>
        <button onClick={() => add('key')} className="text-body text-accent hover:text-accent-hover transition-colors">
          + Add param
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-border">
        <span className="text-micro uppercase tracking-[0.08em] text-dim font-semibold px-1.5 py-1.5">Key</span>
        <span className="text-micro uppercase tracking-[0.08em] text-dim font-semibold px-1.5 py-1.5">Value</span>
      </div>
      {params.map(p => (
        <div key={p.id} className={`grid grid-cols-[1fr_1fr_1.25rem] border-b border-border-subtle last:border-0 group/row hover:bg-[rgba(242,237,228,.04)] ${p.id === lastAdded ? 'animate-row-in' : ''}`}>
          <input
            ref={p.id === lastAdded ? keyRef : undefined}
            className="bg-transparent px-1.5 py-2.5 text-body font-mono text-text placeholder-dim focus:outline-none w-full"
            placeholder="key"
            value={p.key}
            onChange={e => update(p.id, 'key', e.target.value)}
          />
          <input
            ref={p.id === lastAdded ? valueRef : undefined}
            className="bg-transparent px-1.5 py-2.5 text-body font-mono text-text placeholder-dim focus:outline-none w-full"
            placeholder="value"
            value={p.value}
            onChange={e => update(p.id, 'value', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add('key'); } }}
          />
          <button
            onClick={() => remove(p.id)}
            aria-label="Remove"
            className="flex items-center justify-center text-transparent group-hover/row:text-dim hover:!text-error transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      {params.length === 0 && (
        <div className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-border-subtle opacity-50 hover:opacity-100 hover:bg-[rgba(242,237,228,.04)] focus-within:opacity-100 transition-all">
          <input
            className="bg-transparent px-1.5 py-2.5 text-body font-mono placeholder-dim focus:outline-none w-full"
            placeholder="key"
            aria-label="Param key"
            value=""
            onMouseDown={(e) => { e.preventDefault(); ghostAdd('key'); }}
            onFocus={() => ghostAdd('key')}
            readOnly
          />
          <input
            className="bg-transparent px-1.5 py-2.5 text-body font-mono placeholder-dim focus:outline-none w-full"
            placeholder="value"
            aria-label="Param value"
            value=""
            onMouseDown={(e) => { e.preventDefault(); ghostAdd('value'); }}
            onFocus={() => ghostAdd('value')}
            readOnly
          />
          <span />
        </div>
      )}
    </div>
  );
}
