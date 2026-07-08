'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { methodColor, fuzzyScore } from '@/lib/utils';

const HDR_BTN = 'text-sm px-4 py-1.5 rounded border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition-colors';

function Hl({ text, indices }) {
  if (!indices?.length) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? <span key={i} className="text-indigo-300 font-semibold">{ch}</span> : ch
      )}
    </>
  );
}

export default function HistoryDropdown({ history, onRestore, onClear }) {
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (show && ref.current && !ref.current.contains(e.target)) {
        setShow(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show]);

  const filtered = history
    .map((h) => {
      const urlM = fuzzyScore(h.url, search);
      const methodM = fuzzyScore(h.method, search);
      const matched = !search || urlM.matched || methodM.matched;
      const score = Math.max(urlM.score, methodM.score * 2);
      return { ...h, matched, score, urlIndices: urlM.indices };
    })
    .filter((h) => h.matched)
    .sort((a, b) => search ? b.score - a.score : 0);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setShow((v) => !v)} className={HDR_BTN}>
        History{history.length > 0 && <span className="ml-1.5 text-xs text-gray-500">({history.length})</span>}
      </button>
      {show && (
        <div className="absolute right-0 top-full mt-1 w-96 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10">
          <div className="p-2 border-b border-gray-800 flex gap-2">
            <input
              autoFocus
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs placeholder-gray-500 focus:outline-none focus:border-gray-600"
              placeholder="Search history..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => { onClear(); setShow(false); }}
              title="Clear history"
              className="text-gray-500 hover:text-red-400 transition-colors px-2 shrink-0"
            >
              <X size={13} />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-gray-500 text-sm p-4">{search ? 'No matches' : 'No history yet'}</p>
            ) : (
              filtered.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => { onRestore(entry); setShow(false); setSearch(''); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-0"
                >
                  <span className={`text-xs font-bold w-14 shrink-0 ${methodColor(entry.method)}`}>{entry.method}</span>
                  <span className="text-xs text-gray-300 truncate flex-1">
                    <Hl text={entry.url} indices={entry.urlIndices} />
                  </span>
                  {entry.status && (
                    <span className={`text-xs shrink-0 ${entry.status < 300 ? 'text-green-400' : 'text-orange-400'}`}>{entry.status}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
