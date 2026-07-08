'use client';

const AUTH_TYPES = ['none', 'bearer', 'basic', 'apikey'];

export default function AuthEditor({ auth, onChange }) {
  const type = auth?.type ?? 'none';

  function set(fields) {
    onChange({ ...auth, ...fields });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {AUTH_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onChange({ ...auth, type: t })}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
              type === t
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {type === 'bearer' && (
        <input
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
          placeholder="Token"
          value={auth.token ?? ''}
          onChange={(e) => set({ token: e.target.value })}
        />
      )}

      {type === 'basic' && (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="Username"
            value={auth.username ?? ''}
            onChange={(e) => set({ username: e.target.value })}
          />
          <input
            type="password"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="Password"
            value={auth.password ?? ''}
            onChange={(e) => set({ password: e.target.value })}
          />
        </div>
      )}

      {type === 'apikey' && (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="Header name (e.g. X-API-Key)"
            value={auth.key ?? ''}
            onChange={(e) => set({ key: e.target.value })}
          />
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
            placeholder="Value"
            value={auth.value ?? ''}
            onChange={(e) => set({ value: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
