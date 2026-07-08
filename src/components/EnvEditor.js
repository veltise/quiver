'use client';

import { Plus } from 'lucide-react';

export default function EnvEditor({ vars, onChange }) {
  function add() {
    onChange([...vars, { id: Math.random().toString(36).slice(2), key: '', value: '' }]);
  }

  function remove(id) {
    onChange(vars.filter((v) => v.id !== id));
  }

  function update(id, field, val) {
    onChange(vars.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  }

  return (
    <div className="space-y-2">
      {vars.map((v) => (
        <div key={v.id} className="flex gap-2 items-center">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs pointer-events-none">{'{{'}</span>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded pl-7 pr-7 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
              placeholder="variable"
              value={v.key}
              onChange={(e) => update(v.id, 'key', e.target.value)}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs pointer-events-none">{'}}'}</span>
          </div>
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="value"
            value={v.value}
            onChange={(e) => update(v.id, 'value', e.target.value)}
          />
          <button
            onClick={() => remove(v.id)}
            className="px-2 text-gray-500 hover:text-red-400 transition-colors"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button onClick={add} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          <Plus size={13} />Add variable
        </button>
        {vars.length > 0 && (
          <button onClick={() => onChange([])} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
