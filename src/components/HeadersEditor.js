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
      <div className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-gray-800 bg-gray-800/40 rounded-t">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium px-1.5 py-1">Key</span>
        <div className="flex items-center justify-between px-1.5 border-l border-gray-800">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium py-1">Value</span>
          {headers.length > 0 && (
            <button
              onClick={() => onChange([])}
              title="Clear all headers"
              aria-label="Clear all headers"
              className="text-gray-700 hover:text-red-400 transition-colors"
            >
              <Ban size={10} />
            </button>
          )}
        </div>
      </div>
      {headers.map(h => (
        <div
          key={h.id}
          className={`grid grid-cols-[1fr_1fr_1.25rem] border-b border-gray-800/40 last:border-0 group/row hover:bg-gray-800/30 ${h.id === lastAdded ? 'animate-row-in' : ''}`}
        >
          <input
            ref={h.id === lastAdded ? keyRef : undefined}
            className="bg-transparent px-1.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none w-full"
            placeholder="key"
            value={h.key}
            onChange={e => update(h.id, 'key', e.target.value)}
          />
          <input
            ref={h.id === lastAdded ? valueRef : undefined}
            className="bg-transparent px-1.5 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none w-full border-l border-gray-800/60"
            placeholder="value"
            value={h.value}
            onChange={e => update(h.id, 'value', e.target.value)}
          />
          <button
            onClick={() => remove(h.id)}
            aria-label="Remove header"
            className="flex items-center justify-center text-transparent group-hover/row:text-gray-600 hover:!text-red-400 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      {headers.length === 0 && (
        /* Ghost placeholder row — becomes a real row on focus */
        <div className="grid grid-cols-[1fr_1fr_1.25rem] border-b border-gray-800/40 opacity-50 focus-within:opacity-100">
          <input
            className="bg-transparent px-1.5 py-1.5 text-xs font-mono placeholder-gray-600 focus:outline-none w-full"
            placeholder="key"
            aria-label="Header name"
            value=""
            onMouseDown={(e) => { e.preventDefault(); ghostAdd('key'); }}
            onFocus={() => ghostAdd('key')}
            readOnly
          />
          <input
            className="bg-transparent px-1.5 py-1.5 text-xs font-mono placeholder-gray-600 focus:outline-none w-full border-l border-gray-800/60"
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
      <button
        onClick={() => add('key')}
        className="text-xs text-gray-600 hover:text-gray-300 active:text-white transition-colors px-1.5 py-1.5 text-left"
      >
        + Add header
      </button>
    </div>
  );
}
