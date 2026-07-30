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
            className={`px-3 py-1 text-body font-medium transition-colors capitalize ${
              type === t
                ? 'bg-accent text-ink'
                : 'bg-surface-raised text-muted hover:text-text'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {type === 'bearer' && (
        <input
          className="bg-surface-raised border border-border px-3 py-1.5 text-body placeholder-dim focus:outline-none focus:border-[rgba(242,237,228,.3)] font-mono"
          placeholder="Token"
          value={auth.token ?? ''}
          onChange={(e) => set({ token: e.target.value })}
        />
      )}

      {type === 'basic' && (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-surface-raised border border-border px-3 py-1.5 text-body placeholder-dim focus:outline-none focus:border-[rgba(242,237,228,.3)] font-mono"
            placeholder="Username"
            value={auth.username ?? ''}
            onChange={(e) => set({ username: e.target.value })}
          />
          <input
            type="password"
            className="flex-1 bg-surface-raised border border-border px-3 py-1.5 text-body placeholder-dim focus:outline-none focus:border-[rgba(242,237,228,.3)] font-mono"
            placeholder="Password"
            value={auth.password ?? ''}
            onChange={(e) => set({ password: e.target.value })}
          />
        </div>
      )}

      {type === 'apikey' && (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-surface-raised border border-border px-3 py-1.5 text-body placeholder-dim focus:outline-none focus:border-[rgba(242,237,228,.3)] font-mono"
            placeholder="Header name (e.g. X-API-Key)"
            value={auth.key ?? ''}
            onChange={(e) => set({ key: e.target.value })}
          />
          <input
            className="flex-1 bg-surface-raised border border-border px-3 py-1.5 text-body placeholder-dim focus:outline-none focus:border-[rgba(242,237,228,.3)] font-mono"
            placeholder="Value"
            value={auth.value ?? ''}
            onChange={(e) => set({ value: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
