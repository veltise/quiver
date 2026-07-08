'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function ShortcutsModal({ onClose, isMac }) {
  const mod = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sections = [
    {
      title: 'Request',
      items: [
        { keys: [mod, 'Enter'], label: 'Send request' },
        { keys: [mod, 'S'], label: 'Save request' },
      ],
    },
    {
      title: 'Tabs',
      items: [
        { keys: [mod, 'T'], label: 'New tab' },
      ],
    },
    {
      title: 'Navigation',
      items: [
        { keys: [mod, 'K'], label: 'Command palette' },
        { keys: ['?'], label: 'Keyboard shortcuts' },
        { keys: ['Esc'], label: 'Close modal' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-0.5 rounded">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">{section.title}</p>
              <div className="flex flex-col gap-2.5">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="text-xs px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded font-sans text-gray-300">{k}</kbd>
                          {i < item.keys.length - 1 && <span className="text-gray-700 text-xs">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
