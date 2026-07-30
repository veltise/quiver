'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  FolderOpen, Clock,
  ChevronRight, Trash2, MoreHorizontal, Pencil, Ban, Search, X, Check,
} from 'lucide-react';
import { methodColor, fuzzyScore, extractGroup, scoreAndFilterSaved } from '@/lib/utils';
import { suggestName } from '@/lib/saved';
import { SIDEBAR_TAB_KEY } from '@/lib/constants';
import Hl from '@/components/Hl';
import MiddleTruncate from '@/components/MiddleTruncate';

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
      <div className="fixed z-50 bg-surface-raised border border-border shadow-2xl py-1 w-56 text-sm" style={{ left, top: position.y }}>
        {mode === 'main' ? (
          <>
            <button onClick={onOpen} className="w-full text-left px-3 py-1.5 text-text hover:bg-[rgba(242,237,228,.06)] transition-colors">Open</button>
            <div className="border-t border-border my-1" />
            <button onClick={onRename} className="w-full text-left px-3 py-1.5 text-muted hover:text-text hover:bg-[rgba(242,237,228,.06)] transition-colors">Rename</button>
            <button onClick={() => setMode('move')} className="w-full text-left px-3 py-1.5 text-muted hover:text-text hover:bg-[rgba(242,237,228,.06)] transition-colors flex items-center justify-between">
              Move to collection <ChevronRight size={12} className="text-dim" />
            </button>
            <button onClick={onDuplicate} className="w-full text-left px-3 py-1.5 text-muted hover:text-text hover:bg-[rgba(242,237,228,.06)] transition-colors">Duplicate</button>
            <button onClick={onCopyLink} className="w-full text-left px-3 py-1.5 text-muted hover:text-text hover:bg-[rgba(242,237,228,.06)] transition-colors">Copy share link</button>
            <div className="border-t border-border my-1" />
            <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-error hover:text-error hover:bg-[rgba(242,237,228,.06)] transition-colors">Delete</button>
          </>
        ) : (
          <>
            <button onClick={() => setMode('main')} className="w-full text-left px-3 py-1.5 text-muted hover:text-text hover:bg-[rgba(242,237,228,.06)] transition-colors flex items-center gap-1.5">
              <ChevronRight size={10} className="rotate-180 shrink-0" /> Move to collection
            </button>
            <div className="border-t border-border my-1" />
            <div className="px-2 pb-1">
              <input ref={moveRef} className="w-full bg-surface-raised border border-border px-2.5 py-1.5 text-xs placeholder-dim focus:outline-none focus:border-[rgba(242,237,228,.3)]"
                placeholder="Collection name…" value={moveInput} onChange={e => setMoveInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && moveInput.trim()) { onMove(moveInput.trim()); onClose(); } e.stopPropagation(); }} />
            </div>
            {otherCollections.length > 0 && (
              <div className="max-h-36 overflow-y-auto border-t border-border pt-1">
                {otherCollections.map(c => (
                  <button key={c} onClick={() => { onMove(c); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs text-muted hover:text-text hover:bg-[rgba(242,237,228,.06)] transition-colors font-mono truncate">{c}</button>
                ))}
              </div>
            )}
            {!moveInput && !otherCollections.length && (
              <p className="px-3 py-2 text-xs text-dim italic border-t border-border">Type a name to create a new collection</p>
            )}
            {moveInput.trim() && !inputMatchesExisting && (
              <button onClick={() => { onMove(moveInput.trim()); onClose(); }} className="w-full text-left px-3 py-1.5 text-xs text-accent hover:text-accent-hover hover:bg-[rgba(242,237,228,.06)] transition-colors border-t border-border-subtle">
                Create &ldquo;{moveInput.trim()}&rdquo;
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SkeletonRow({ children }) {
  return (
    <div className="flex items-center gap-2.5 py-2 animate-pulse">
      <div className="w-8 h-2.5 bg-[rgba(242,237,228,.06)] shrink-0" />
      {children}
    </div>
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
    <div className="flex items-center pt-4 pb-2 bg-surface sticky top-0 z-10 group/header">
      <button onClick={onToggle} title={collapsed ? 'Expand collection' : 'Collapse collection'}
        className="shrink-0 -ml-1 mr-0.5 text-dim opacity-0 group-hover/header:opacity-100 hover:text-text transition-all p-0.5">
        <ChevronRight size={9} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>
      {renaming ? (
        <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setValue(name); setRenaming(false); } e.stopPropagation(); }}
          className="flex-1 min-w-0 bg-surface-raised border border-border px-1.5 py-0.5 text-xs text-text focus:outline-none focus:border-accent" />
      ) : (
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <MiddleTruncate text={name.toUpperCase()} className="text-[10.5px] uppercase tracking-[0.09em] text-dim" />
        </button>
      )}
      <span className="text-[10.5px] text-dim mx-1.5 shrink-0 tabular-nums">{count}</span>
      {!renaming && (
        <button onClick={() => setRenaming(true)} title="Rename collection"
          className="opacity-0 group-hover/header:opacity-100 text-dim hover:text-text transition-all p-0.5 shrink-0">
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
  onRestoreHistory, onDeleteHistory, onClearHistory,
  mobileOpen, loading,
}) {
  const [activeTab, setActiveTab] = useState('collections');
  useEffect(() => {
    try { const s = localStorage.getItem(SIDEBAR_TAB_KEY); if (s) setActiveTab(s); } catch {}
  }, []);
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [focusedId, setFocusedId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const confirmTimerRef = useRef(null);
  const listRef = useRef(null);

  function handleDeleteClick(id) {
    clearTimeout(confirmTimerRef.current);
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      onDeleteSaved(id);
    } else {
      setConfirmDeleteId(id);
      confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  }

  function setTab(tab) {
    setActiveTab(tab);
    try { localStorage.setItem(SIDEBAR_TAB_KEY, tab); } catch {}
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

  const filtered = useMemo(() => scoreAndFilterSaved(saved, search), [saved, search]);

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
    // An untouched auto-name just repeats the host already shown in the group
    // header, so prefer the path — but the moment someone renames a request,
    // their name wins.
    const autoNamed = entry.name === suggestName(entry.url);
    const label = autoNamed && path && path !== '/' ? path : entry.name;
    return (
      <div key={entry.id} data-entry-id={entry.id}
        className={`qv-row relative flex items-center gap-0.5 pr-2 transition-colors group/row ${
          isActive ? 'qv-row-active bg-surface-raised' :
          focused ? 'bg-surface-raised' :
          'hover:bg-surface-raised'
        }`}
        onMouseEnter={() => setFocusedId(entry.id)}
        onMouseLeave={() => setFocusedId(prev => (prev === entry.id ? null : prev))}>
        <span className="qv-nock" />
        {/* Padding lives on the button, not the row, so the whole row area is clickable */}
        <button onClick={() => { onRestoreSaved(entry); setSearch(''); setFocusedId(null); }} className="flex items-center gap-2.5 flex-1 text-left min-w-0 pl-3.5 py-2">
          <span className={`text-[11px] font-semibold font-mono shrink-0 w-[34px] ${methodColor(entry.method)}`}>{entry.method}</span>
          {showUrl ? (
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className={`text-[13px] truncate ${isActive ? 'text-text' : 'text-soft'}`}>
                {entry.nameIndices ? <Hl text={entry.name} indices={entry.nameIndices} /> : entry.name}
              </span>
              {entry.urlIndices?.length ? (
                <span className="text-xs text-muted truncate font-mono">
                  <Hl text={entry.url} indices={entry.urlIndices} />
                </span>
              ) : (
                <MiddleTruncate text={entry.url} className="text-xs text-muted font-mono" />
              )}
            </div>
          ) : (
            <MiddleTruncate text={label} className={`text-[13px] min-w-0 ${isActive ? 'text-text' : 'text-soft'}`} />
          )}
        </button>
        <button onClick={e => { e.stopPropagation(); handleDeleteClick(entry.id); }}
          title={confirmDeleteId === entry.id ? 'Click again to confirm' : 'Delete'}
          aria-label={confirmDeleteId === entry.id ? `Confirm delete ${entry.name}` : `Delete ${entry.name}`}
          className={`transition-all p-1.5 shrink-0 rounded ${confirmDeleteId === entry.id
            ? 'opacity-100 text-error bg-error/10'
            : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-dim hover:text-error'}`}>
          {confirmDeleteId === entry.id ? <Check size={11} /> : <Trash2 size={11} />}
        </button>
        <button onClick={e => openMenu(e, entry)} title="More" aria-label={`More actions for ${entry.name}`}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-muted hover:text-text transition-all p-1.5 shrink-0 rounded hover:bg-[rgba(242,237,228,.06)]">
          <MoreHorizontal size={12} />
        </button>
      </div>
    );
  }

  if (collapsed && !mobileOpen) {
    return (
      <div className="hidden md:flex flex-col w-10 border-r border-border-subtle bg-surface shrink-0 items-center pt-3 gap-1">
        <button onClick={onToggle} title="Expand sidebar" aria-label="Expand sidebar"
          className="qv-ghost-btn shrink-0 w-[22px] h-[22px] flex items-center justify-center text-[11px] leading-none text-muted">
          ⟩
        </button>
        <div className="w-4 h-px bg-border-subtle my-1" />
        <button onClick={() => { setTab('collections'); onToggle(); }} title="Collections" className="text-dim hover:text-text transition-all p-2 rounded-md hover:bg-[rgba(242,237,228,.06)] relative">
          <FolderOpen size={12} />
          {activeTab === 'collections' && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
        </button>
        <button onClick={() => { setTab('history'); onToggle(); }} title="History" className="text-dim hover:text-text transition-all p-2 rounded-md hover:bg-[rgba(242,237,228,.06)] relative">
          <Clock size={12} />
          {activeTab === 'history' && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
        </button>
      </div>
    );
  }

  return (
    <div className={`${mobileOpen ? 'flex w-full' : 'hidden md:flex md:w-72 lg:w-80'} flex-col border-r border-border-subtle bg-surface shrink-0 overflow-hidden`}>
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
      <div className="flex items-center gap-4 px-4 pt-4 pb-2.5 border-b border-border-subtle shrink-0">
        <button
          onClick={() => setTab('collections')}
          className={`flex items-center gap-1.5 whitespace-nowrap pb-2 text-[13px] transition-colors border-b-2 ${activeTab === 'collections' ? 'text-text border-accent' : 'text-muted border-transparent hover:text-text'}`}
        >
          Collections
          {saved.length > 0 && <span className="text-dim">· {saved.length}</span>}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-1.5 whitespace-nowrap pb-2 text-[13px] transition-colors border-b-2 ${activeTab === 'history' ? 'text-text border-accent' : 'text-muted border-transparent hover:text-text'}`}
        >
          History
          {history.length > 0 && <span className="text-dim">· {history.length}</span>}
        </button>
        <button onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar"
          className="qv-ghost-btn ml-auto shrink-0 w-[22px] h-[22px] flex items-center justify-center text-[11px] leading-none text-muted">
          ⟨
        </button>
      </div>

      {activeTab === 'collections' && (
        <div className="flex flex-col overflow-hidden flex-1">
          <div className="px-4 pt-3 flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0 bg-surface-raised border border-border px-2.5 py-2">
              <Search size={11} className="text-dim shrink-0" />
              <input
                className="flex-1 bg-transparent text-[13px] placeholder-dim focus:outline-none text-text min-w-0"
                placeholder="Search requests…"
                value={search}
                onChange={e => { setSearch(e.target.value); setFocusedId(null); }}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {saved.length > 0 && (
              <button onClick={onClearAllSaved} title="Clear all saved" className="text-dim hover:text-error transition-colors p-1 shrink-0">
                <Ban size={12} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4" ref={listRef}>
            {loading ? (
              [0,1,2,3].map(i => (
                <SkeletonRow key={i}>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-2.5 bg-[rgba(242,237,228,.06)] w-3/4" />
                    <div className="h-2 bg-[rgba(242,237,228,.04)] w-1/2" />
                  </div>
                </SkeletonRow>
              ))
            ) : saved.length === 0 ? (
              <p className="text-xs text-dim py-4">No saved requests yet</p>
            ) : search ? (
              filtered.length === 0
                ? <p className="text-xs text-dim py-4">No matches</p>
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
                  {!collapsedGroups.has(groupName) && (
                    <div className="flex flex-col gap-px">{entries.map(e => renderSavedRow(e, false))}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="flex flex-col overflow-hidden flex-1">
          <div className="px-4 pt-3 flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0 bg-surface-raised border border-border px-2.5 py-2">
              <Search size={11} className="text-dim shrink-0" />
              <input
                className="flex-1 bg-transparent text-[13px] placeholder-dim focus:outline-none text-text min-w-0"
                placeholder="Filter by URL or method…"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
              />
            </div>
            {history.length > 0 && (
              <button onClick={onClearHistory} title="Clear history" className="text-dim hover:text-error transition-colors p-1 shrink-0">
                <Ban size={12} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-3">
            {loading ? (
              [0,1,2,3].map(i => (
                <SkeletonRow key={i}>
                  <div className="h-2.5 bg-[rgba(242,237,228,.06)] flex-1" />
                  <div className="w-6 h-2.5 bg-[rgba(242,237,228,.06)] shrink-0" />
                </SkeletonRow>
              ))
            ) : history.length === 0 ? (
              <p className="text-xs text-dim py-4">No history yet</p>
            ) : filteredHistory.length === 0 ? (
              <p className="text-xs text-dim py-4">No matches</p>
            ) : filteredHistory.map(entry => (
              <div key={entry.id} className="flex items-center group/hrow hover:bg-surface-raised transition-colors">
                <button onClick={() => onRestoreHistory(entry)}
                  className="flex items-center gap-2.5 pl-3.5 pr-1 py-2 flex-1 min-w-0 text-left">
                  <span className={`text-[11px] font-semibold font-mono shrink-0 w-[34px] ${methodColor(entry.method)}`}>{entry.method}</span>
                  {entry.urlHl?.length ? (
                    <span className="text-xs text-soft truncate flex-1 font-mono">
                      <Hl text={entry.url} indices={entry.urlHl} />
                    </span>
                  ) : (
                    <MiddleTruncate text={entry.url} className="text-xs text-soft flex-1 font-mono" />
                  )}
                  {entry.status && (
                    <span className={`text-xs shrink-0 ${entry.status < 300 ? 'text-success' : 'text-warning'}`}>{entry.status}</span>
                  )}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteHistory?.(entry.id); }}
                  title="Remove"
                  className="opacity-0 group-hover/hrow:opacity-100 text-dim hover:text-error transition-all p-2 shrink-0"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
