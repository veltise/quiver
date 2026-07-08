'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { MoreHorizontal, ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import { methodColor, fuzzyScore, extractGroup } from '@/lib/utils';

const HDR_BTN = 'text-sm px-4 py-1.5 rounded border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition-colors';
const METHOD_ORDER = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };

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

function extractPath(url) {
  try { return new URL(url).pathname; }
  catch {
    const m = url.match(/^\{\{[^}]+\}\}(\/[^?#]*)/);
    return m?.[1] || '';
  }
}

function ContextMenu({ entry, allCollections, position, onClose, onOpen, onRename, onMove, onDuplicate, onCopyLink, onDelete }) {
  const [mode, setMode] = useState('main');
  const [moveInput, setMoveInput] = useState('');
  const moveRef = useRef(null);

  useEffect(() => {
    if (mode === 'move') moveRef.current?.focus();
  }, [mode]);

  const currentCollection = entry.collection || extractGroup(entry.url);
  const otherCollections = allCollections.filter((c) =>
    c !== currentCollection && (!moveInput || c.toLowerCase().includes(moveInput.toLowerCase()))
  );
  const inputMatchesExisting = allCollections.some(
    (c) => c.toLowerCase() === moveInput.trim().toLowerCase()
  );

  const left = Math.min(position.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 228);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-56 text-sm"
        style={{ left, top: position.y }}
      >
        {mode === 'main' ? (
          <>
            <button onClick={onOpen} className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-gray-800 transition-colors">Open</button>
            <div className="border-t border-gray-800 my-1" />
            <button onClick={onRename} className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">Rename</button>
            <button
              onClick={() => setMode('move')}
              className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors flex items-center justify-between"
            >
              Move to collection
              <ChevronRight size={12} className="text-gray-600" />
            </button>
            <button onClick={onDuplicate} className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">Duplicate</button>
            <button onClick={onCopyLink} className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">Copy share link</button>
            <div className="border-t border-gray-800 my-1" />
            <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-gray-800 transition-colors">Delete</button>
          </>
        ) : (
          <>
            <button
              onClick={() => setMode('main')}
              className="w-full text-left px-3 py-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-1.5"
            >
              <ChevronRight size={10} className="rotate-180 shrink-0" />
              Move to collection
            </button>
            <div className="border-t border-gray-800 my-1" />
            <div className="px-2 pb-1">
              <input
                ref={moveRef}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-gray-500"
                placeholder="Collection name…"
                value={moveInput}
                onChange={(e) => setMoveInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && moveInput.trim()) { onMove(moveInput.trim()); onClose(); }
                  e.stopPropagation();
                }}
              />
            </div>
            {otherCollections.length > 0 ? (
              <div className="max-h-36 overflow-y-auto border-t border-gray-800 pt-1">
                {otherCollections.map((c) => (
                  <button
                    key={c}
                    onClick={() => { onMove(c); onClose(); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors font-mono truncate"
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              !moveInput && (
                <p className="px-3 py-2 text-xs text-gray-600 italic border-t border-gray-800">
                  Type a name to create a new collection
                </p>
              )
            )}
            {moveInput.trim() && !inputMatchesExisting && (
              <button
                onClick={() => { onMove(moveInput.trim()); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-gray-800 transition-colors border-t border-gray-800"
              >
                Create &ldquo;{moveInput.trim()}&rdquo;
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

// Input is intentionally NOT nested inside a button — browsers fire button click on spacebar,
// which would toggle the group while the user is mid-rename.
function GroupHeader({ name, count, collapsed, onToggle, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef(null);

  useEffect(() => { setValue(name); }, [name]);
  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  function commit() {
    const trimmed = value.trim();
    setRenaming(false);
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setValue(name);
  }

  return (
    <div className="flex items-center px-3 py-1.5 bg-gray-900 border-b border-gray-800 sticky top-0 z-10 group/header">
      <button onClick={onToggle} className="shrink-0 mr-1.5 text-gray-600 hover:text-gray-400 transition-colors p-0.5 rounded">
        <ChevronRight size={10} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>

      {renaming ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setValue(name); setRenaming(false); }
            e.stopPropagation();
          }}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
        />
      ) : (
        <button onClick={onToggle} className="flex-1 min-w-0 text-left py-0.5">
          <span className="text-xs text-gray-500 font-mono truncate block">{name}</span>
        </button>
      )}

      <span className="text-xs text-gray-700 mx-1.5 shrink-0">{count}</span>

      {!renaming && (
        <button
          onClick={() => setRenaming(true)}
          title="Rename collection"
          className="opacity-0 group-hover/header:opacity-100 text-gray-600 hover:text-gray-300 transition-all p-0.5 shrink-0 rounded"
        >
          <Pencil size={10} />
        </button>
      )}
    </div>
  );
}

export default function SavedDropdown({ saved, onRestore, onDelete, onClearAll, onRename, onCopyLink, onDuplicate, onMoveToCollection, onRenameCollection }) {
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [focusedId, setFocusedId] = useState(null);
  const [menu, setMenu] = useState(null);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (show && !menu && ref.current && !ref.current.contains(e.target)) {
        setShow(false);
        setSearch('');
        setFocusedId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show, menu]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedId) {
      listRef.current?.querySelector(`[data-entry-id="${focusedId}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedId]);

  function openMenu(e, entry) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ entry, x: rect.left, y: rect.bottom + 4 });
  }

  function toggleGroup(name) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const allCollections = useMemo(
    () => [...new Set(saved.map((s) => s.collection || extractGroup(s.url)))].sort((a, b) => a.localeCompare(b)),
    [saved]
  );

  const filtered = useMemo(() => {
    if (!search) return [];
    return saved
      .map((s) => {
        const nameM = fuzzyScore(s.name, search);
        const urlM = fuzzyScore(s.url, search);
        const methodM = fuzzyScore(s.method, search);
        const matched = nameM.matched || urlM.matched || methodM.matched;
        const score = Math.max(nameM.score * 2, urlM.score, methodM.score * 3);
        return { ...s, matched, score, nameHl: nameM.indices, urlHl: urlM.indices };
      })
      .filter((s) => s.matched)
      .sort((a, b) => b.score - a.score);
  }, [saved, search]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const entry of saved) {
      const g = entry.collection || extractGroup(entry.url);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(entry);
    }
    // Sort entries within each group: method order then alphabetical name
    for (const [, entries] of map) {
      entries.sort((a, b) => {
        const mo = (METHOD_ORDER[a.method] ?? 5) - (METHOD_ORDER[b.method] ?? 5);
        return mo !== 0 ? mo : a.name.localeCompare(b.name);
      });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [saved]);

  // Flat ordered list of visible entries for keyboard navigation
  const visibleEntries = useMemo(() => {
    if (search) return filtered;
    const result = [];
    for (const [groupName, entries] of groups) {
      if (!collapsed.has(groupName)) result.push(...entries);
    }
    return result;
  }, [search, filtered, groups, collapsed]);

  function handleSearchKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIdx = visibleEntries.findIndex((en) => en.id === focusedId);
      const nextIdx = e.key === 'ArrowDown'
        ? (currentIdx < visibleEntries.length - 1 ? currentIdx + 1 : currentIdx)
        : (currentIdx > 0 ? currentIdx - 1 : 0);
      setFocusedId(visibleEntries[nextIdx]?.id ?? null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = visibleEntries.find((en) => en.id === focusedId) ?? visibleEntries[0];
      if (entry) { onRestore(entry); setShow(false); setSearch(''); setFocusedId(null); }
    } else if (e.key === 'Escape') {
      setShow(false);
      setSearch('');
      setFocusedId(null);
    }
  }

  function renderRow(entry, showUrl = false) {
    const focused = entry.id === focusedId;
    const path = extractPath(entry.url);
    return (
      <div
        key={entry.id}
        data-entry-id={entry.id}
        className={`flex items-center gap-1 px-3 py-2 border-b border-gray-800 last:border-0 transition-colors group/row ${focused ? 'bg-indigo-500/10' : 'hover:bg-gray-800/60'}`}
        onMouseEnter={() => setFocusedId(entry.id)}
      >
        <button
          onClick={() => { onRestore(entry); setShow(false); setSearch(''); setFocusedId(null); }}
          className="flex items-center gap-2.5 flex-1 text-left min-w-0"
        >
          <span className={`text-xs font-bold w-12 shrink-0 ${methodColor(entry.method)}`}>{entry.method}</span>
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-white truncate">
              {entry.nameHl ? <Hl text={entry.name} indices={entry.nameHl} /> : entry.name}
            </span>
            {showUrl ? (
              <span className="text-xs text-gray-500 truncate">
                {entry.urlHl ? <Hl text={entry.url} indices={entry.urlHl} /> : entry.url}
              </span>
            ) : path && path !== '/' ? (
              <span className="text-xs text-gray-600 truncate font-mono">{path}</span>
            ) : null}
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
          title="Delete"
          className="opacity-0 group-hover/row:opacity-100 text-gray-600 hover:text-red-400 transition-all p-1 shrink-0 rounded hover:bg-gray-800"
        >
          <Trash2 size={13} />
        </button>
        <button
          onClick={(e) => openMenu(e, entry)}
          title="More options"
          className="opacity-0 group-hover/row:opacity-100 text-gray-500 hover:text-gray-200 transition-all p-1 shrink-0 rounded hover:bg-gray-700"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setShow((v) => !v); setFocusedId(null); }} className={HDR_BTN}>
        Saved{saved.length > 0 && <span className="ml-1.5 text-xs text-gray-500">({saved.length})</span>}
      </button>

      {menu && (
        <ContextMenu
          entry={menu.entry}
          allCollections={allCollections}
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          onOpen={() => { onRestore(menu.entry); setMenu(null); setShow(false); setSearch(''); }}
          onRename={() => { onRename(menu.entry); setMenu(null); }}
          onMove={(col) => { onMoveToCollection(menu.entry.id, col); setMenu(null); }}
          onDuplicate={() => { onDuplicate(menu.entry); setMenu(null); }}
          onCopyLink={() => { onCopyLink(menu.entry); setMenu(null); }}
          onDelete={() => { onDelete(menu.entry.id); setMenu(null); }}
        />
      )}

      {show && (
        <div className="absolute right-0 top-full mt-1 w-96 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10">
          <div className="p-2 border-b border-gray-800 flex gap-2">
            <input
              autoFocus
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs placeholder-gray-500 focus:outline-none focus:border-gray-600"
              placeholder="Search saved…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFocusedId(null); }}
              onKeyDown={handleSearchKeyDown}
            />
            {saved.length > 0 && (
              <button
                onClick={() => { onClearAll?.(); setShow(false); }}
                title="Clear all saved"
                className="text-gray-500 hover:text-red-400 transition-colors px-2 shrink-0"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto" ref={listRef}>
            {saved.length === 0 ? (
              <p className="text-gray-500 text-sm p-4">No saved requests yet</p>
            ) : search ? (
              filtered.length === 0 ? (
                <p className="text-gray-500 text-sm p-4">No matches</p>
              ) : (
                filtered.map((entry) => renderRow(entry, true))
              )
            ) : (
              groups.map(([groupName, entries]) => (
                <div key={groupName}>
                  <GroupHeader
                    name={groupName}
                    count={entries.length}
                    collapsed={collapsed.has(groupName)}
                    onToggle={() => toggleGroup(groupName)}
                    onRename={(newName) => onRenameCollection(groupName, newName)}
                  />
                  {!collapsed.has(groupName) && entries.map((entry) => renderRow(entry, false))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
