'use client';

export default function Toast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-lg text-body shadow-lg ${
            t.type === 'error'
              ? 'bg-error/10 text-error border border-error/30'
              : 'bg-surface-raised text-text border border-border'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
