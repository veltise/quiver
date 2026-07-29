'use client';

import { Plus } from 'lucide-react';

export default function KeyValueEditor({ items, onChange, keyPlaceholder = 'key', valuePlaceholder = 'value', addLabel = 'Add', keyPrefix, keySuffix, mono = false, showClearAll = false }) {
  function add() {
    onChange([...items, { id: crypto.randomUUID(), key: '', value: '' }]);
  }
  function remove(id) {
    onChange(items.filter((i) => i.id !== id));
  }
  function update(id, field, val) {
    onChange(items.map((i) => i.id === id ? { ...i, [field]: val } : i));
  }

  const inputCls = `flex-1 bg-surface-raised border border-border rounded px-3 py-1.5 text-sm placeholder-dim focus:outline-none focus:border-border-strong${mono ? ' font-mono' : ''}`;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex gap-2 items-center">
          {keyPrefix ? (
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim text-xs pointer-events-none">{keyPrefix}</span>
              <input
                className={`${inputCls} w-full pl-7${keySuffix ? ' pr-7' : ''}`}
                placeholder={keyPlaceholder}
                value={item.key}
                onChange={(e) => update(item.id, 'key', e.target.value)}
              />
              {keySuffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim text-xs pointer-events-none">{keySuffix}</span>}
            </div>
          ) : (
            <input
              className={inputCls}
              placeholder={keyPlaceholder}
              value={item.key}
              onChange={(e) => update(item.id, 'key', e.target.value)}
            />
          )}
          <input
            className={inputCls}
            placeholder={valuePlaceholder}
            value={item.value}
            onChange={(e) => update(item.id, 'value', e.target.value)}
          />
          <button onClick={() => remove(item.id)} className="px-2 text-muted hover:text-error transition-colors">×</button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button onClick={add} className="flex items-center gap-1 text-sm text-muted hover:text-text transition-colors">
          <Plus size={13} />{addLabel}
        </button>
        {showClearAll && items.length > 0 && (
          <button onClick={() => onChange([])} className="text-xs text-dim hover:text-error transition-colors">Clear all</button>
        )}
      </div>
    </div>
  );
}
