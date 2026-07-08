'use client';

export default function HeadersEditor({ headers, onChange }) {
  function add() {
    onChange([...headers, { id: Math.random().toString(36).slice(2), key: '', value: '' }]);
  }

  function remove(id) {
    onChange(headers.filter((h) => h.id !== id));
  }

  function update(id, field, val) {
    onChange(headers.map((h) => (h.id === id ? { ...h, [field]: val } : h)));
  }

  return (
    <div className="space-y-2">
      {headers.map((h) => (
        <div key={h.id} className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="Key"
            value={h.key}
            onChange={(e) => update(h.id, 'key', e.target.value)}
          />
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="Value"
            value={h.value}
            onChange={(e) => update(h.id, 'value', e.target.value)}
          />
          <button
            onClick={() => remove(h.id)}
            className="px-2 text-gray-500 hover:text-red-400 transition-colors"
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        + Add header
      </button>
    </div>
  );
}
