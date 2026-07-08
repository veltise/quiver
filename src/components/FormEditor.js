'use client';

export default function FormEditor({ fields, onChange }) {
  function add() {
    onChange([...fields, { id: Math.random().toString(36).slice(2), key: '', value: '' }]);
  }

  function remove(id) {
    onChange(fields.filter((f) => f.id !== id));
  }

  function update(id, field, val) {
    onChange(fields.map((f) => (f.id === id ? { ...f, [field]: val } : f)));
  }

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <div key={f.id} className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
            placeholder="Key"
            value={f.key}
            onChange={(e) => update(f.id, 'key', e.target.value)}
          />
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
            placeholder="Value"
            value={f.value}
            onChange={(e) => update(f.id, 'value', e.target.value)}
          />
          <button
            onClick={() => remove(f.id)}
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
        + Add field
      </button>
    </div>
  );
}
