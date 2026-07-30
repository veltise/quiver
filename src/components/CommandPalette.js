'use client';

import { useState, useEffect, useRef } from 'react';
import { methodColor, fuzzyScore, scoreAndFilterSaved } from '@/lib/utils';
import Hl from '@/components/Hl';

export default function CommandPalette({ saved, envSets, activeEnvId, onClose, onRestoreRequest, onSwitchEnv, onClearHistory, onExport, onNewRequest }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItemRef = useRef(null);

  const q = query.trim();

  const savedItems = (q ? scoreAndFilterSaved(saved, q) : saved)
    .map((s) => ({ type: 'saved', key: s.id, data: s, matched: true, score: s.score ?? 0, nameIndices: s.nameIndices ?? [], urlIndices: s.urlIndices ?? [] }))
    .slice(0, q ? Infinity : 8);

  const envItems = envSets
    .map((e) => {
      const m = fuzzyScore(e.name, q);
      return { type: 'env', key: e.id, data: e, matched: m.matched, score: m.score, nameIndices: m.indices };
    })
    .filter((x) => x.matched)
    .sort((a, b) => b.score - a.score);

  const ACTIONS = [
    { id: 'new', label: 'New request', action: onNewRequest },
    { id: 'export', label: 'Export workspace', action: onExport },
    { id: 'clear-history', label: 'Clear history', action: onClearHistory },
  ];
  const actionItems = ACTIONS
    .map((a) => {
      const m = fuzzyScore(a.label, q);
      return { type: 'action', key: a.id, data: a, matched: m.matched, score: m.score, nameIndices: m.indices };
    })
    .filter((x) => x.matched)
    .sort((a, b) => b.score - a.score);

  const rawSections = [
    { label: 'Saved Requests', items: savedItems },
    { label: 'Environments', items: envItems },
    { label: 'Actions', items: actionItems },
  ].filter((s) => s.items.length > 0);

  let counter = 0;
  const sections = rawSections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item, idx: counter++ })),
  }));
  const allItems = sections.flatMap((s) => s.items);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, allItems.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') { const item = allItems[activeIndex]; if (item) execute(item); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [allItems, activeIndex]);

  function execute(item) {
    if (item.type === 'saved') { onRestoreRequest(item.data); onClose(); }
    else if (item.type === 'env') { onSwitchEnv(item.data.id); onClose(); }
    else if (item.type === 'action') { item.data.action(); onClose(); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-30 pt-24" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <input
            autoFocus
            className="w-full bg-transparent text-body placeholder-dim focus:outline-none"
            placeholder="Search requests, environments, actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="max-h-96 overflow-y-auto">
          {allItems.length === 0 ? (
            <p className="text-muted text-body p-4">No results</p>
          ) : sections.map((section) => (
            <div key={section.label}>
              <div className="px-4 py-1.5 text-body text-dim uppercase tracking-wider bg-canvas sticky top-0">
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = item.idx === activeIndex;
                return (
                  <div
                    key={item.key}
                    ref={active ? activeItemRef : null}
                    onClick={() => execute(item)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      active ? 'bg-accent/20 text-text' : 'text-text hover:bg-surface-raised'
                    }`}
                  >
                    {item.type === 'saved' && (
                      <>
                        <span className={`text-body font-bold w-14 shrink-0 ${methodColor(item.data.method)}`}>
                          {item.data.method}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-body truncate">
                            <Hl text={item.data.name} indices={item.nameIndices} />
                          </span>
                          <span className={`text-body truncate ${active ? 'text-text' : 'text-muted'}`}>
                            <Hl text={item.data.url} indices={item.urlIndices} />
                          </span>
                        </div>
                      </>
                    )}
                    {item.type === 'env' && (
                      <>
                        <span className="text-body text-muted w-14 shrink-0">ENV</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-body truncate">
                            <Hl text={item.data.name} indices={item.nameIndices} />
                          </span>
                          {item.data.id === activeEnvId && (
                            <span className="text-body text-accent shrink-0">active</span>
                          )}
                        </div>
                      </>
                    )}
                    {item.type === 'action' && (
                      <>
                        <span className="text-body text-muted w-14 shrink-0">⚡</span>
                        <span className="text-body">
                          <Hl text={item.data.label} indices={item.nameIndices} />
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t border-border px-4 py-2 flex gap-4 text-body text-dim">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
