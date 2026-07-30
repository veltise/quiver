'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Ban } from 'lucide-react';

export default function HeadersEditor({ headers, onChange }) {
  const [lastAdded, setLastAdded] = useState(null);
  // Which field ('key' | 'value') to focus once the row created from the ghost placeholder renders
  const [pendingFocus, setPendingFocus] = useState(null);
  const keyRef = useRef(null);
  const valueRef = useRef(null);

  useEffect(() => {
    if (!pendingFocus) return;
    const el = (pendingFocus === 'key' ? keyRef : valueRef).current;
    if (el) {
      el.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, headers]);

  function add(focusField) {
    const id = crypto.randomUUID();
    onChange([...headers, { id, key: '', value: '' }]);
    setLastAdded(id);
    if (focusField) setPendingFocus(focusField);
  }

  // The ghost row's only job is creating the FIRST row — bail if one exists
  // (guards against duplicate mouse/focus events firing in the same click)
  function ghostAdd(field) {
    if (headers.length > 0) return;
    add(field);
  }
  function remove(id) {
    onChange(headers.filter(h => h.id !== id));
  }
  function update(id, field, val) {
    onChange(headers.map(h => h.id === id ? { ...h, [field]: val } : h));
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10.5px] uppercase tracking-[0.09em] text-dim">Request headers</span>
        <div className="flex items-center gap-3">
          {headers.length > 0 && (
            <button
              onClick={() => onChange([])}
              title="Clear all headers"
              aria-label="Clear all headers"
              className="text-dim hover:text-error transition-colors"
            >
              <Ban size={11} />
            </button>
          )}
          <button onClick={() => add('key')} className="text-xs text-accent hover:text-accent-hover transition-colors">
            + Add header
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-border">
        <span className="text-[11px] uppercase tracking-[0.08em] text-dim font-semibold px-1.5 py-1.5">Key</span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-dim font-semibold px-1.5 py-1.5">Value</span>
      </div>
      {headers.map(h => (
        <div
          key={h.id}
          className={`grid grid-cols-[1fr_1fr_1.25rem] border-b border-border-subtle last:border-0 group/row hover:bg-[rgba(242,237,228,.04)] ${h.id === lastAdded ? 'animate-row-in' : ''}`}
        >
          <input
            ref={h.id === lastAdded ? keyRef : undefined}
            className="bg-transparent px-1.5 py-2.5 text-xs font-mono text-text placeholder-dim focus:outline-none w-full"
            placeholder="key"
            value={h.key}
            onChange={e => update(h.id, 'key', e.target.value)}
          />
          <input
            ref={h.id === lastAdded ? valueRef : undefined}
            className="bg-transparent px-1.5 py-2.5 text-xs font-mono text-text placeholder-dim focus:outline-none w-full "
            placeholder="value"
            value={h.value}
            onChange={e => update(h.id, 'value', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add('key'); } }}
          />
          <button
            onClick={() => remove(h.id)}
            aria-label="Remove header"
            className="flex items-center justify-center text-transparent group-hover/row:text-text hover:!text-error transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      {headers.length === 0 && (
        /* Ghost placeholder row — becomes a real row on focus */
        <div className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-border opacity-50 hover:opacity-100 hover:bg-[rgba(242,237,228,.04)] focus-within:opacity-100 transition-all">
          <input
            className="bg-transparent px-1.5 py-2.5 text-xs font-mono placeholder-dim focus:outline-none w-full"
            placeholder="key"
            aria-label="Header name"
            value=""
            onMouseDown={(e) => { e.preventDefault(); ghostAdd('key'); }}
            onFocus={() => ghostAdd('key')}
            readOnly
          />
          <input
            className="bg-transparent px-1.5 py-2.5 text-xs font-mono placeholder-dim focus:outline-none w-full "
            placeholder="value"
            aria-label="Header value"
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
