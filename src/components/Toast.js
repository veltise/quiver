'use client';

export default function Toast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-lg text-sm shadow-lg ${
            t.type === 'error'
              ? 'bg-red-950 text-red-300 border border-red-800'
              : 'bg-gray-800 text-gray-100 border border-gray-700'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
