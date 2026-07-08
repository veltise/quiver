'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  PanelLeftClose, PanelLeftOpen, FolderOpen, Clock,
  ChevronRight, Trash2, MoreHorizontal, Pencil, Ban, Search,
} from 'lucide-react';
import { methodColor, fuzzyScore, extractGroup } from '@/lib/utils';
import Hl from '@/components/Hl';

const SIDEBAR_KEY = 'api-playground-sidebar-tab';
const METHOD_ORDER = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };

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
  useEffect(() => { if (mode === 'move') moveRef.current?.focus(); }, [mode]);

  const currentCollection = entry.collection || extractGroup(entry.url);
  const otherCollections = allCollections.filter(
    c => c !== currentCollection && (!moveInput || c.toLowerCase().includes(moveInput.toLowerCase()))
  );
  const inputMatchesExisting = allCollections.some(c => c.toLowerCase() === moveInput.trim().toLowerCase());
  const left = Math.min(position.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 232);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-56 text-sm" style={{ left, top: position.y }}>
        {mode === 'main' ? (
          <>
            <button onClick={onOpen} className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-gray-800 transition-colors">Open</button>
            <div className="border-t border-gray-800 my-1" />
            <button onClick={onRename} className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">Rename</button>
            <button onClick={() => setMode('move')} className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors flex items-center justify-between">
              Move to collection <ChevronRight size={12} className="text-gray-600" />
            </button>
            <button onClick={onDuplicate} className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">Duplicate</button>
            <button onClick={onCopyLink} className="w-full text-left px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">Copy share link</button>
            <div className="border-t border-gray-800 my-1" />
            <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-gray-800 transition-colors">Delete</button>
          </>
        ) : (
          <>
            <button onClick={() => setMode('main')} className="w-full text-left px-3 py-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-1.5">
              <ChevronRight size={10} className="rotate-180 shrink-0" /> Move to collection
            </button>
            <div className="border-t border-gray-800 my-1" />
            <div className="px-2 pb-1">
              <input ref={moveRef} className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-gray-500"
                placeholder="Collection name…" value={moveInput} onChange={e => setMoveInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && moveInput.trim()) { onMove(moveInput.trim()); onClose(); } e.stopPropagation(); }} />
            </div>
            {otherCollections.length > 0 && (
              <div className="max-h-36 overflow-y-auto border-t border-gray-800 pt-1">
                {otherCollections.map(c => (
                  <button key={c} onClick={() => { onMove(c); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors font-mono truncate">{c}</button>
                ))}
              </div>
            )}
            {!moveInput && !otherCollections.length && (
              <p className="px-3 py-2 text-xs text-gray-600 italic border-t border-gray-800">Type a name to create a new collection</p>
            )}
            {moveInput.trim() && !inputMatchesExisting && (
              <button onClick={() => { onMove(moveInput.trim()); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-gray-800 transition-colors border-t border-gray-800">
                Create &ldquo;{moveInput.trim()}&rdquo;
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function GroupHeader({ name, count, collapsed, onToggle, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef(null);
  useEffect(() => { setValue(name); }, [name]);
  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  function commit() {
    const trimmed = value.trim();
    setRenaming(false);
    if (trimmed && trimmed !== name) onRename(trimmed); else setValue(name);
  }

  return (
    <div className="flex items-center px-2 py-1 bg-gray-900 sticky top-0 z-10 group/header border-b border-gray-800/50">
      <button onClick={onToggle} className="shrink-0 mr-1 text-gray-600 hover:text-gray-400 transition-colors p-0.5 rounded">
        <ChevronRight size={9} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>
      {renaming ? (
        <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setValue(name); setRenaming(false); } e.stopPropagation(); }}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500" />
      ) : (
        <button onClick={onToggle} className="flex-1 min-w-0 text-left py-0.5" title={name}>
          <span className="text-xs text-gray-600 font-mono truncate block">{name}</span>
        </button>
      )}
      <span className="text-xs text-gray-700 mx-1 shrink-0">{count}</span>
      {!renaming && (
        <button onClick={() => setRenaming(true)} title="Rename collection"
          className="opacity-0 group-hover/header:opacity-100 text-gray-600 hover:text-gray-300 transition-all p-0.5 shrink-0 rounded">
          <Pencil size={9} />
        </button>
      )}
    </div>
  );
}

export default function Sidebar({
  collapsed, onToggle,
  saved, history,
  activeRequestId,
  onRestoreSaved, onDeleteSaved, onClearAllSaved, onRenameSaved,
  onCopyLink, onDuplicate, onMoveToCollection, onRenameCollection,
  onRestoreHistory, onClearHistory,
  mobileOpen, loading,
}) {
  const [activeTab, setActiveTab] = useState('collections');
  useEffect(() => {
    try { const s = localStorage.getItem(SIDEBAR_KEY); if (s) setActiveTab(s); } catch {}
  }, []);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [focusedId, setFocusedId] = useState(null);
  const [menu, setMenu] = useState(null);
  const listRef = useRef(null);

  function setTab(tab) {
    setActiveTab(tab);
    try { localStorage.setItem(SIDEBAR_KEY, tab); } catch {}
  }

  useEffect(() => {
    if (focusedId) listRef.current?.querySelector(`[data-entry-id="${focusedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  function toggleGroup(name) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function openMenu(e, entry) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ entry, x: rect.right + 4, y: rect.top });
  }

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim();
    if (!q) return history;
    return history.map(e => {
      const urlM = fuzzyScore(e.url, q);
      const methodM = fuzzyScore(e.method, q);
      const matched = urlM.matched || methodM.matched;
      return { ...e, matched, score: Math.max(urlM.score, methodM.score * 3), urlHl: urlM.indices };
    }).filter(e => e.matched).sort((a, b) => b.score - a.score);
  }, [history, historySearch]);

  const allCollections = useMemo(
    () => [...new Set(saved.map(s => s.collection || extractGroup(s.url)))].sort((a, b) => a.localeCompare(b)),
    [saved]
  );

  const filtered = useMemo(() => {
    if (!search) return [];
    return saved.map(s => {
      const nameM = fuzzyScore(s.name, search);
      const urlM = fuzzyScore(s.url, search);
      const methodM = fuzzyScore(s.method, search);
      const matched = nameM.matched || urlM.matched || methodM.matched;
      const score = Math.max(nameM.score * 2, urlM.score, methodM.score * 3);
      return { ...s, matched, score, nameHl: nameM.indices, urlHl: urlM.indices };
    }).filter(s => s.matched).sort((a, b) => b.score - a.score);
  }, [saved, search]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const entry of saved) {
      const g = entry.collection || extractGroup(entry.url);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(entry);
    }
    for (const [, entries] of map) {
      entries.sort((a, b) => {
        const mo = (METHOD_ORDER[a.method] ?? 5) - (METHOD_ORDER[b.method] ?? 5);
        return mo !== 0 ? mo : a.name.localeCompare(b.name);
      });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [saved]);

  const visibleEntries = useMemo(() => {
    if (search) return filtered;
    const result = [];
    for (const [groupName, entries] of groups) {
      if (!collapsedGroups.has(groupName)) result.push(...entries);
    }
    return result;
  }, [search, filtered, groups, collapsedGroups]);

  function handleSearchKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIdx = visibleEntries.findIndex(en => en.id === focusedId);
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(currentIdx + 1, visibleEntries.length - 1)
        : Math.max(currentIdx - 1, 0);
      setFocusedId(visibleEntries[nextIdx]?.id ?? null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = visibleEntries.find(en => en.id === focusedId) ?? visibleEntries[0];
      if (entry) { onRestoreSaved(entry); setSearch(''); setFocusedId(null); }
    }
  }

  function renderSavedRow(entry, showUrl = false) {
    const focused = entry.id === focusedId;
    const isActive = entry.id === activeRequestId;
    const path = extractPath(entry.url);
    return (
      <div key={entry.id} data-entry-id={entry.id}
        className={`flex items-center gap-0.5 pl-1.5 pr-2 py-1.5 border-b border-gray-800/40 last:border-0 transition-colors group/row border-l-2 ${
          isActive ? 'border-l-indigo-500 bg-indigo-500/10' :
          focused ? 'border-l-transparent bg-gray-800/50' :
          'border-l-transparent hover:bg-gray-800/40'
        }`}
        onMouseEnter={() => setFocusedId(entry.id)}>
        <button onClick={() => { onRestoreSaved(entry); setSearch(''); setFocusedId(null); }} className="flex items-center gap-1.5 flex-1 text-left min-w-0">
          <span className={`text-xs font-bold w-10 shrink-0 ${methodColor(entry.method)}`}>{entry.method}</span>
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-gray-200 truncate">
              {entry.nameHl ? <Hl text={entry.name} indices={entry.nameHl} /> : entry.name}
            </span>
            {showUrl ? (
              <span className="text-xs text-gray-500 truncate font-mono">
                {entry.urlHl ? <Hl text={entry.url} indices={entry.urlHl} /> : entry.url}
              </span>
            ) : path && path !== '/' ? (
              <span className="text-xs text-gray-600 truncate font-mono">{path}</span>
            ) : null}
          </div>
        </button>
        <button onClick={e => { e.stopPropagation(); onDeleteSaved(entry.id); }} title="Delete"
          className="opacity-0 group-hover/row:opacity-100 text-gray-600 hover:text-red-400 transition-all p-1 shrink-0 rounded">
          <Trash2 size={11} />
        </button>
        <button onClick={e => openMenu(e, entry)} title="More"
          className="opacity-0 group-hover/row:opacity-100 text-gray-500 hover:text-gray-200 transition-all p-1 shrink-0 rounded hover:bg-gray-700">
          <MoreHorizontal size={12} />
        </button>
      </div>
    );
  }

  if (collapsed && !mobileOpen) {
    return (
      <div className="hidden md:flex flex-col w-10 border-r border-gray-800/60 bg-gray-900 shrink-0 items-center pt-3 gap-1">
        <button onClick={onToggle} title="Expand sidebar" className="text-gray-700 hover:text-gray-400 transition-all p-2 rounded-md hover:bg-gray-800 hover:scale-110">
          <PanelLeftOpen size={13} />
        </button>
        <div className="w-4 h-px bg-gray-800 my-1" />
        <button onClick={() => { setTab('collections'); onToggle(); }} title="Collections" className="text-gray-700 hover:text-gray-300 transition-all p-2 rounded-md hover:bg-gray-800 relative">
          <FolderOpen size={12} />
          {activeTab === 'collections' && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />}
        </button>
        <button onClick={() => { setTab('history'); onToggle(); }} title="History" className="text-gray-700 hover:text-gray-300 transition-all p-2 rounded-md hover:bg-gray-800 relative">
          <Clock size={12} />
          {activeTab === 'history' && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500" />}
        </button>
      </div>
    );
  }

  return (
    <div className={`${mobileOpen ? 'flex w-full' : 'hidden md:flex md:w-60'} flex-col border-r border-gray-800 bg-gray-900 shrink-0 overflow-hidden`}>
      {menu && (
        <ContextMenu
          entry={menu.entry}
          allCollections={allCollections}
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          onOpen={() => { onRestoreSaved(menu.entry); setMenu(null); setSearch(''); }}
          onRename={() => { onRenameSaved(menu.entry); setMenu(null); }}
          onMove={col => { onMoveToCollection(menu.entry.id, col); setMenu(null); }}
          onDuplicate={() => { onDuplicate(menu.entry); setMenu(null); }}
          onCopyLink={() => { onCopyLink(menu.entry); setMenu(null); }}
          onDelete={() => { onDeleteSaved(menu.entry.id); setMenu(null); }}
        />
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1.5 border-b border-gray-800/50 shrink-0">
        <button
          onClick={() => setTab('collections')}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors rounded-md ${activeTab === 'collections' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-400'}`}
        >
          <FolderOpen size={11} />
          Collections
          {saved.length > 0 && <span className="text-gray-600 text-xs">{saved.length}</span>}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors rounded-md ${activeTab === 'history' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-400'}`}
        >
          <Clock size={11} />
          History
          {history.length > 0 && <span className="text-gray-600 text-xs">{history.length}</span>}
        </button>
        <div className="flex-1" />
        <button onClick={onToggle} title="Collapse sidebar" className="text-gray-700 hover:text-gray-300 transition-all p-1.5 rounded-md hover:bg-gray-800 hover:scale-110 shrink-0">
          <PanelLeftClose size={13} />
        </button>
      </div>

      {activeTab === 'collections' && (
        <div className="flex flex-col overflow-hidden flex-1">
          <div className="p-2 border-b border-gray-800 flex gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1">
              <Search size={10} className="text-gray-600 shrink-0" />
              <input
                className="flex-1 bg-transparent text-xs placeholder-gray-600 focus:outline-none text-gray-200 min-w-0"
                placeholder="Search…"
                value={search}
                onChange={e => { setSearch(e.target.value); setFocusedId(null); }}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {saved.length > 0 && (
              <button onClick={onClearAllSaved} title="Clear all saved" className="text-gray-600 hover:text-red-400 transition-colors p-1 shrink-0">
                <Ban size={12} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto" ref={listRef}>
            {loading ? (
              [0,1,2,3].map(i => (
                <div key={i} className="flex items-center gap-2 px-2 py-2.5 border-b border-gray-800/40 animate-pulse">
                  <div className="w-8 h-2.5 bg-gray-800 rounded shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-2.5 bg-gray-800 rounded w-3/4" />
                    <div className="h-2 bg-gray-800/50 rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : saved.length === 0 ? (
              <p className="text-xs text-gray-600 p-3">No saved requests yet</p>
            ) : search ? (
              filtered.length === 0
                ? <p className="text-xs text-gray-600 p-3">No matches</p>
                : filtered.map(e => renderSavedRow(e, true))
            ) : (
              groups.map(([groupName, entries]) => (
                <div key={groupName}>
                  <GroupHeader
                    name={groupName}
                    count={entries.length}
                    collapsed={collapsedGroups.has(groupName)}
                    onToggle={() => toggleGroup(groupName)}
                    onRename={newName => onRenameCollection(groupName, newName)}
                  />
                  {!collapsedGroups.has(groupName) && entries.map(e => renderSavedRow(e, false))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="flex flex-col overflow-hidden flex-1">
          <div className="p-2 border-b border-gray-800 flex gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5 flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1">
              <Search size={10} className="text-gray-600 shrink-0" />
              <input
                className="flex-1 bg-transparent text-xs placeholder-gray-600 focus:outline-none text-gray-200 min-w-0"
                placeholder="Filter by URL or method…"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
              />
            </div>
            {history.length > 0 && (
              <button onClick={onClearHistory} title="Clear history" className="text-gray-600 hover:text-red-400 transition-colors p-1 shrink-0">
                <Ban size={12} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              [0,1,2,3].map(i => (
                <div key={i} className="flex items-center gap-2 px-2 py-2.5 border-b border-gray-800/40 animate-pulse">
                  <div className="w-8 h-2.5 bg-gray-800 rounded shrink-0" />
                  <div className="h-2.5 bg-gray-800 rounded flex-1" />
                  <div className="w-6 h-2.5 bg-gray-800 rounded shrink-0" />
                </div>
              ))
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-600 p-3">No history yet</p>
            ) : filteredHistory.length === 0 ? (
              <p className="text-xs text-gray-600 p-3">No matches</p>
            ) : filteredHistory.map(entry => (
              <button key={entry.id} onClick={() => onRestoreHistory(entry)}
                className="w-full flex items-center gap-2 px-2 py-2 border-b border-gray-800/40 last:border-0 hover:bg-gray-800/60 transition-colors text-left">
                <span className={`text-xs font-bold w-10 shrink-0 ${methodColor(entry.method)}`}>{entry.method}</span>
                <span className="text-xs text-gray-400 truncate flex-1 font-mono">
                  {entry.urlHl?.length ? <Hl text={entry.url} indices={entry.urlHl} /> : entry.url}
                </span>
                {entry.status && (
                  <span className={`text-xs shrink-0 ${entry.status < 300 ? 'text-green-400' : 'text-orange-400'}`}>{entry.status}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
