'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Keyboard, ChevronDown, Plus, X, Bookmark, Link2, SlidersHorizontal, List, Lock, FileText, Code2, Layers, Play, Terminal, Upload, FolderOpen, Download } from 'lucide-react';
import { applyEnv } from '@/lib/env';
import { parseCurl } from '@/lib/curl';
import { nameToSlug, suggestName } from '@/lib/saved';
import { buildEffectiveHeaders, buildBody, generateCurl, readStreamBody } from '@/lib/request';
import { extractGroup, methodColor, formatSize, statusBadgeClass, statusColor, latencyColor, isJsonInvalid } from '@/lib/utils';
import { encryptState, decryptState } from '@/lib/crypto';
import { useToast } from '@/hooks/useToast';
import ParamsEditor from './ParamsEditor';
import HeadersEditor from './HeadersEditor';
import ResponsePanel from './ResponsePanel';
import BodyEditor from './BodyEditor';
import AuthEditor from './AuthEditor';
import EnvModal from './EnvModal';
import SaveModal from './SaveModal';
import Toast from './Toast';
import CurlImportModal from './CurlImportModal';
import RequestBar from './RequestBar';
import CommandPalette from './CommandPalette';
import GoLiveModal from './GoLiveModal';
import CollectionRunner from './CollectionRunner';
import CodeGenPanel from './CodeGenPanel';
import Sidebar from './Sidebar';
import ShortcutsModal from './ShortcutsModal';
import PulsingDot from './PulsingDot';
import { ENV_SETS_KEY, TIMEOUT_KEY, SIDEBAR_KEY } from '@/lib/constants';
import { getSessionId } from '@/lib/session';
const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const HDR_BTN = 'text-sm px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition-colors font-medium';
const MAX_TABS = 10;

export const DEFAULT_STATE = {
  method: 'GET',
  url: '',
  headers: [],
  bodyType: 'none',
  body: '',
  formFields: [],
  auth: { type: 'none' },
  graphqlQuery: '',
  graphqlVariables: '{}',
};

function hostPath(url) {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch { return url; }
}

// Tab text: custom name > saved name (minus a leading method dupe) > URL host+path
function tabLabel(tab) {
  if (tab.customName?.trim()) return tab.customName;
  const name = tab.activeRequest?.name;
  if (name) {
    if (name.startsWith(`${tab.req.method} `)) return name.slice(tab.req.method.length + 1) || name;
    return name;
  }
  const url = tab.req.url?.trim();
  return url ? hostPath(url) : 'New request';
}

function TabButton({ id, activeTab, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${activeTab === id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-400'}`}
    >
      {Icon && <Icon size={11} />}
      {children}
    </button>
  );
}

export default function Playground({ initialState, isShared }) {
  const [{ tabs, activeTabId }, setTabState] = useState(() => {
    const id = crypto.randomUUID();
    return {
      tabs: [{ id, req: initialState ?? DEFAULT_STATE, response: null, isLoading: false, panelTab: 'headers', activeRequest: null }],
      activeTabId: id,
    };
  });
  const activeTabData = useMemo(() => tabs.find(t => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);
  const req = activeTabData.req;
  const response = activeTabData.response;
  const isLoading = activeTabData.isLoading;
  const activeTab = activeTabData.panelTab;
  const activeRequest = activeTabData.activeRequest;
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [history, setHistory] = useState([]);
  const [saved, setSaved] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [envSets, setEnvSets] = useState([]);
  const [activeEnvId, setActiveEnvId] = useState(null);
  const [renamingEntry, setRenamingEntry] = useState(null);
  const [requestTimeout, setRequestTimeout] = useState(10);
  const [isMac, setIsMac] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [showBanner, setShowBanner] = useState(!!isShared);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [splitPct, setSplitPct] = useState(54);
  const [showTools, setShowTools] = useState(false);
  const [mobileView, setMobileView] = useState('request');
  const [tabMenu, setTabMenu] = useState(null);
  const [editingTab, setEditingTab] = useState(null); // { id, value }
  const splitRef = useRef(null);
  const toolsRef = useRef(null);
  const { toasts, addToast } = useToast();

  function updateTab(tabId, updates) {
    setTabState(prev => ({ ...prev, tabs: prev.tabs.map(t => t.id === tabId ? { ...t, ...updates } : t) }));
  }
  function setReq(updater) {
    setTabState(prev => ({ ...prev, tabs: prev.tabs.map(t => t.id !== prev.activeTabId ? t : { ...t, req: typeof updater === 'function' ? updater(t.req) : updater }) }));
  }
  function setActiveTab(val) { updateTab(activeTabId, { panelTab: val }); }
  function setActiveRequest(val) { updateTab(activeTabId, { activeRequest: val }); }

  const envVars = useMemo(() => envSets.find((s) => s.id === activeEnvId)?.vars ?? [], [envSets, activeEnvId]);
  const showBody = !['GET', 'HEAD'].includes(req.method);
  const jsonInvalid = isJsonInvalid(req.bodyType, req.body);

  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === 'true'); } catch {}
  }, []);

  useEffect(() => {
    if (!showTools) return;
    function onDown(e) {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setShowTools(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showTools]);

  function toggleSidebar() {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch {}
      return next;
    });
  }

  function newTab() {
    if (tabs.length >= MAX_TABS) { addToast(`Max ${MAX_TABS} tabs open`); return; }
    const id = crypto.randomUUID();
    setTabState(prev => {
      if (prev.tabs.length >= MAX_TABS) return prev;
      return {
        tabs: [...prev.tabs, { id, req: DEFAULT_STATE, response: null, isLoading: false, panelTab: 'headers', activeRequest: null }],
        activeTabId: id,
      };
    });
  }

  function closeTab(tabId) {
    setTabState(prev => {
      if (prev.tabs.length === 1) {
        const id = crypto.randomUUID();
        return { tabs: [{ id, req: DEFAULT_STATE, response: null, isLoading: false, panelTab: 'headers', activeRequest: null }], activeTabId: id };
      }
      const idx = prev.tabs.findIndex(t => t.id === tabId);
      const next = prev.tabs.filter(t => t.id !== tabId);
      return { tabs: next, activeTabId: tabId === prev.activeTabId ? next[Math.min(idx, next.length - 1)].id : prev.activeTabId };
    });
  }

  function openInTab(reqState, activeRequestState, customName = null) {
    setTabState(prev => {
      const current = prev.tabs.find(t => t.id === prev.activeTabId);
      if (!current?.req.url?.trim() && !current?.activeRequest) {
        return { ...prev, tabs: prev.tabs.map(t => t.id === prev.activeTabId ? { ...t, req: reqState, activeRequest: activeRequestState, customName, response: null, panelTab: 'headers' } : t) };
      }
      if (prev.tabs.length >= MAX_TABS) return prev;
      const id = crypto.randomUUID();
      return { tabs: [...prev.tabs, { id, req: reqState, activeRequest: activeRequestState, customName, response: null, isLoading: false, panelTab: 'headers' }], activeTabId: id };
    });
  }

  function closeOtherTabs(keepTabId) {
    setTabState(prev => {
      const kept = prev.tabs.filter(t => t.id === keepTabId);
      return { tabs: kept, activeTabId: keepTabId };
    });
  }

  function closeTabsToRight(tabId) {
    setTabState(prev => {
      const idx = prev.tabs.findIndex(t => t.id === tabId);
      if (idx === -1 || idx === prev.tabs.length - 1) return prev;
      const next = prev.tabs.slice(0, idx + 1);
      const newActiveId = next.some(t => t.id === prev.activeTabId) ? prev.activeTabId : next[next.length - 1].id;
      return { tabs: next, activeTabId: newActiveId };
    });
  }

  function duplicateTab(tabId) {
    setTabState(prev => {
      if (prev.tabs.length >= MAX_TABS) return prev;
      const source = prev.tabs.find(t => t.id === tabId);
      if (!source) return prev;
      const id = crypto.randomUUID();
      const idx = prev.tabs.findIndex(t => t.id === tabId);
      const duped = { ...source, id, isLoading: false };
      const next = [...prev.tabs.slice(0, idx + 1), duped, ...prev.tabs.slice(idx + 1)];
      return { tabs: next, activeTabId: id };
    });
  }

  function handleDragStart(e) {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    function onMove(ev) {
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const pct = Math.max(25, Math.min(75, (x / rect.width) * 100));
      setSplitPct(pct);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);

  useEffect(() => {
    try { localStorage.setItem(TIMEOUT_KEY, String(requestTimeout)); } catch {}
  }, [requestTimeout]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(ENV_SETS_KEY));
      if (stored?.sets?.length) {
        const migrated = stored.sets.map((s) => ({
          ...s,
          vars: (s.vars ?? []).map((v) => v.id ? v : { ...v, id: crypto.randomUUID() }),
        }));
        setEnvSets(migrated);
        setActiveEnvId(stored.activeId ?? migrated[0].id);
      } else {
        const oldVars = JSON.parse(localStorage.getItem('api-playground-env') ?? '[]');
        const defaultId = crypto.randomUUID();
        const defaultSet = { id: defaultId, name: 'Default', vars: oldVars.map((v) => v.id ? v : { ...v, id: crypto.randomUUID() }) };
        setEnvSets([defaultSet]);
        setActiveEnvId(defaultId);
        localStorage.setItem(ENV_SETS_KEY, JSON.stringify({ sets: [defaultSet], activeId: defaultId }));
      }
    } catch {
      const defaultId = crypto.randomUUID();
      const defaultSet = { id: defaultId, name: 'Default', vars: [] };
      setEnvSets([defaultSet]);
      setActiveEnvId(defaultId);
    }

    const t = parseInt(localStorage.getItem(TIMEOUT_KEY) ?? '10', 10);
    if (!isNaN(t)) setRequestTimeout(Math.min(t, 10));

    const headers = { 'x-session-id': getSessionId() };
    Promise.all([
      fetch('/api/history', { headers }).then((r) => r.json()).then(async (data) => {
        if (!Array.isArray(data)) return;
        const rows = await Promise.all(data.map(async (row) => ({
          id: row.id, method: row.method, url: row.url,
          status: row.status, timestamp: row.timestamp,
          state: await decryptState(row.state),
        })));
        setHistory(rows.filter((r) => r.state !== null));
      }).catch(() => {}),
      fetch('/api/saved', { headers }).then((r) => r.json()).then(async (data) => {
        if (!Array.isArray(data)) return;
        const rows = await Promise.all(data.map(async (row) => ({
          id: row.id, name: row.name, slug: row.slug,
          method: row.method, url: row.url,
          state: await decryptState(row.state),
          collection: row.collection ?? '', createdAt: row.created_at,
        })));
        setSaved(rows.filter((r) => r.state !== null));
      }).catch(() => {}),
    ]).finally(() => setSidebarLoading(false));
  }, []);

  const sendRequestRef = useRef(null);
  const newTabRef = useRef(null);
  const importFileRef = useRef(null);
  useEffect(() => {
    sendRequestRef.current = sendRequest;
    newTabRef.current = newTab;
  });
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendRequestRef.current?.();
      if ((e.metaKey || e.ctrlKey) && e.key === 't') { e.preventDefault(); newTabRef.current?.(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setActiveModal((m) => m === 'cmd' ? null : 'cmd');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!activeModal) setActiveModal('save');
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.isContentEditable) {
        e.preventDefault();
        setActiveModal((m) => m === 'shortcuts' ? null : 'shortcuts');
      }
      if (e.key === 'Escape') {
        setActiveModal(null);
        setRenamingEntry(null);
        setShowTools(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    document.title = activeRequest ? `${activeRequest.name} — Quiver` : 'Quiver';
  }, [activeRequest]);

  // --- Env ---
  function persistEnvSets(sets, activeId) {
    try { localStorage.setItem(ENV_SETS_KEY, JSON.stringify({ sets, activeId })); } catch {}
  }
  function updateEnvSetVars(id, vars) {
    const next = envSets.map((s) => s.id === id ? { ...s, vars } : s);
    setEnvSets(next); persistEnvSets(next, activeEnvId);
  }
  function addEnvSet() {
    const id = crypto.randomUUID();
    const newSet = { id, name: `Env ${envSets.length + 1}`, vars: [] };
    const next = [...envSets, newSet];
    setEnvSets(next); setActiveEnvId(id); persistEnvSets(next, id);
  }
  function deleteEnvSet(id) {
    const next = envSets.filter((s) => s.id !== id);
    const newActiveId = id === activeEnvId ? (next[0]?.id ?? null) : activeEnvId;
    setEnvSets(next); setActiveEnvId(newActiveId); persistEnvSets(next, newActiveId);
  }
  function switchEnvSet(id) { setActiveEnvId(id); persistEnvSets(envSets, id); }
  function renameEnvSet(id, name) {
    const next = envSets.map((s) => s.id === id ? { ...s, name } : s);
    setEnvSets(next); persistEnvSets(next, activeEnvId);
  }

  // --- History ---
  async function saveToHistory(entry) {
    if (history.length > 0 && history[0].method === entry.method && history[0].url === entry.url) return;
    setHistory((prev) => [entry, ...prev].slice(0, 20));
    try {
      const encState = await encryptState(entry.state);
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), entry: { ...entry, state: encState } }),
      });
    } catch {}
  }

  async function clearAllSaved() {
    setSaved([]);
    try {
      await fetch('/api/saved', { method: 'DELETE', headers: { 'x-session-id': getSessionId() } });
    } catch { addToast('Failed to clear saved', 'error'); }
  }

  async function clearHistory() {
    setHistory([]);
    try {
      await fetch('/api/history', { method: 'DELETE', headers: { 'x-session-id': getSessionId() } });
      addToast('History cleared');
    } catch { addToast('Failed to clear history', 'error'); }
  }

  async function deleteFromHistory(id) {
    setHistory(prev => prev.filter(e => e.id !== id));
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE', headers: { 'x-session-id': getSessionId() } });
    } catch {}
  }

  // --- Request ---
  async function sendRequest() {
    if (!req.url?.trim() || jsonInvalid) return;
    const tabId = activeTabId;
    const capturedReq = req;
    updateTab(tabId, { isLoading: true, response: null });
    try {
      const effectiveHeaders = buildEffectiveHeaders(capturedReq).map((h) => ({
        ...h,
        key: applyEnv(h.key, envVars),
        value: applyEnv(h.value, envVars),
      })).filter(h => h.key?.trim());
      const envReq = {
        ...capturedReq,
        body: applyEnv(capturedReq.body ?? '', envVars),
        graphqlQuery: applyEnv(capturedReq.graphqlQuery ?? '', envVars),
        formFields: (capturedReq.formFields ?? []).map((f) => ({
          ...f,
          key: applyEnv(f.key, envVars),
          value: applyEnv(f.value ?? '', envVars),
        })),
      };
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: applyEnv(capturedReq.url, envVars),
          method: capturedReq.method,
          headers: effectiveHeaders,
          timeout: requestTimeout,
          body: buildBody(envReq) ?? undefined,
        }),
      });

      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        const status = parseInt(res.headers.get('x-proxy-status') ?? '200');
        const statusText = res.headers.get('x-proxy-status-text') ?? '';
        const time = parseInt(res.headers.get('x-proxy-time') ?? '0');
        let resHeaders = {};
        try { resHeaders = JSON.parse(atob(res.headers.get('x-proxy-headers') ?? 'e30=')); } catch {}
        updateTab(tabId, { isLoading: false, response: { status, statusText, time, headers: resHeaders, body: '', streaming: true }, respondedAt: Date.now() });
        let body = '';
        try {
          body = await readStreamBody(res.body, (accumulated) => {
            setTabState(prev => ({ ...prev, tabs: prev.tabs.map(t => t.id === tabId ? { ...t, response: { ...t.response, body: accumulated, streaming: true } } : t) }));
          });
        } catch {}
        setTabState(prev => ({ ...prev, tabs: prev.tabs.map(t => t.id === tabId ? { ...t, response: { ...t.response, body, streaming: false } } : t) }));
        saveToHistory({ id: crypto.randomUUID(), method: capturedReq.method, url: capturedReq.url, status, timestamp: Date.now(), state: capturedReq });
        return;
      }

      const data = await res.json();
      updateTab(tabId, { isLoading: false, response: data, respondedAt: Date.now() });
      if (window.innerWidth < 768) setMobileView('response');
      saveToHistory({ id: crypto.randomUUID(), method: capturedReq.method, url: capturedReq.url, status: data.status, timestamp: Date.now(), state: capturedReq });
    } catch {
      updateTab(tabId, { isLoading: false, response: { error: 'Failed to reach proxy' } });
    }
  }

  // --- Share ---
  async function copyShareLink() {
    if (isSharing || !req.url?.trim()) return;
    setIsSharing(true);
    try {
      const shareState = {
        ...req,
        auth: { type: 'none' },
        headers: req.headers.filter((h) => h.key.trim().toLowerCase() !== 'authorization'),
      };
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), method: req.method, url: req.url, state: shareState }),
      });
      const { slug } = await res.json();
      if (slug) {
        await navigator.clipboard.writeText(`${window.location.origin}/p/${slug}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {} finally { setIsSharing(false); }
  }

  // --- Saved ---
  async function handleSave(name) {
    setActiveModal(null);
    const existing = saved.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      try {
        const encState = await encryptState(req);
        const res = await fetch(`/api/saved/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
          body: JSON.stringify({ name, slug: existing.slug, method: req.method, url: req.url, state: encState }),
        });
        const row = await res.json();
        if (row.id) {
          setSaved((prev) => prev.map((s) => s.id === row.id ? { ...s, name: row.name, slug: row.slug, method: row.method, url: row.url, state: row.state } : s));
          setActiveRequest({ id: row.id, name: row.name });
          addToast(`Updated "${row.name}"`);
          setShowBanner(false);
          if (isShared) window.history.replaceState(null, '', '/');
        } else {
          addToast(row.error ?? 'Failed to update', 'error');
        }
      } catch { addToast('Failed to update', 'error'); }
      return;
    }
    try {
      const encState = await encryptState(req);
      const slug = nameToSlug(name) + '-' + Math.random().toString(36).slice(2, 7);
      const res = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), entry: { name, slug, method: req.method, url: req.url, state: encState, collection: extractGroup(req.url) } }),
      });
      const row = await res.json();
      if (row.id) {
        setSaved((prev) => [{ id: row.id, name: row.name, slug: row.slug, method: row.method, url: row.url, state: row.state, collection: row.collection ?? '', createdAt: row.created_at }, ...prev]);
        setActiveRequest({ id: row.id, name: row.name });
        addToast(`Saved "${row.name}"`);
        setShowBanner(false);
        if (isShared) window.history.replaceState(null, '', '/');
      } else {
        addToast(row.error ?? 'Failed to save', 'error');
      }
    } catch { addToast('Failed to save', 'error'); }
  }

  async function handleRename(name) {
    const entry = renamingEntry;
    setRenamingEntry(null);
    const slug = nameToSlug(name);
    try {
      const res = await fetch(`/api/saved/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({ name, slug }),
      });
      const row = await res.json();
      if (row.id) {
        setSaved((prev) => prev.map((s) => s.id === row.id ? { ...s, name: row.name, slug: row.slug } : s));
        addToast(`Renamed to "${row.name}"`);
      }
    } catch { addToast('Failed to rename', 'error'); }
  }

  async function deleteFromSaved(id) {
    const idx = saved.findIndex((s) => s.id === id);
    const entry = saved[idx];
    if (!entry) return;
    setSaved((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/saved/${id}`, { method: 'DELETE', headers: { 'x-session-id': getSessionId() } });
      if (!res.ok) throw new Error();
      addToast('Deleted');
    } catch {
      // Rollback: reinsert at its old position
      setSaved((prev) => {
        const next = [...prev];
        next.splice(Math.min(idx, next.length), 0, entry);
        return next;
      });
      addToast('Failed to delete', 'error');
    }
  }

  async function commitTabRename() {
    const editing = editingTab;
    setEditingTab(null);
    if (!editing) return;
    const value = editing.value.trim();
    if (!value) return;
    const tab = tabs.find(t => t.id === editing.id);
    if (!tab || value === tabLabel(tab)) return;

    const entry = tab.activeRequest ? saved.find(s => s.id === tab.activeRequest.id) : null;
    if (!entry) {
      // Unsaved tab: the label only exists locally
      updateTab(editing.id, { customName: value });
      return;
    }

    // Saved request: renaming the tab renames the request everywhere (sidebar included)
    const prevName = entry.name;
    const prevSlug = entry.slug;
    setSaved(prev => prev.map(s => s.id === entry.id ? { ...s, name: value } : s));
    setTabState(prev => ({ ...prev, tabs: prev.tabs.map(t => t.activeRequest?.id === entry.id
      ? { ...t, activeRequest: { ...t.activeRequest, name: value }, customName: null } : t) }));
    try {
      const res = await fetch(`/api/saved/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({ name: value, slug: nameToSlug(value) }),
      });
      const row = await res.json();
      if (!row.id) throw new Error();
      setSaved(prev => prev.map(s => s.id === row.id ? { ...s, name: row.name, slug: row.slug } : s));
    } catch {
      setSaved(prev => prev.map(s => s.id === entry.id ? { ...s, name: prevName, slug: prevSlug } : s));
      setTabState(prev => ({ ...prev, tabs: prev.tabs.map(t => t.activeRequest?.id === entry.id
        ? { ...t, activeRequest: { ...t.activeRequest, name: prevName } } : t) }));
      addToast('Failed to rename', 'error');
    }
  }

  function handleMethodChange(method) {
    setReq((r) => ({ ...r, method }));
    if (['GET', 'HEAD'].includes(method) && activeTab === 'body') setActiveTab('headers');
  }

  function handleCurlImport(parsed) {
    if (!parsed.url || !/^https?:\/\//i.test(parsed.url)) {
      addToast('cURL must include an http:// or https:// URL', 'error');
      return;
    }
    setReq({ ...DEFAULT_STATE, ...parsed });
    setActiveRequest(null);
    setActiveModal(null);
    addToast('cURL imported');
    setActiveTab(parsed.body ? 'body' : 'headers');
  }

  function handleExtract(key, value) {
    const next = envSets.map((s) => {
      if (s.id !== activeEnvId) return s;
      const exists = s.vars.some((v) => v.key === key);
      const vars = exists
        ? s.vars.map((v) => v.key === key ? { ...v, value } : v)
        : [...s.vars, { id: crypto.randomUUID(), key, value }];
      return { ...s, vars };
    });
    setEnvSets(next);
    persistEnvSets(next, activeEnvId);
    addToast(`Saved {{${key}}}`);
  }

  async function copyAsCurl() {
    const curl = generateCurl(req);
    await navigator.clipboard.writeText(curl);
    addToast('cURL copied');
  }

  async function duplicateSaved(entry) {
    const name = `Copy of ${entry.name}`;
    const slug = nameToSlug(name);
    // Optimistic: show the copy immediately, swap in the server row on success
    const tempId = `temp-${crypto.randomUUID()}`;
    setSaved((prev) => [{ ...entry, id: tempId, name, slug, createdAt: new Date().toISOString() }, ...prev]);
    try {
      const encState = await encryptState(entry.state);
      const res = await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), entry: { name, slug, method: entry.method, url: entry.url, state: encState, collection: entry.collection ?? '' } }),
      });
      const row = await res.json();
      if (!row.id) throw new Error();
      setSaved((prev) => prev.map((s) => s.id === tempId
        ? { id: row.id, name: row.name, slug: row.slug, method: row.method, url: row.url, state: entry.state, collection: row.collection ?? '', createdAt: row.created_at }
        : s));
      addToast(`Duplicated "${entry.name}"`);
    } catch {
      setSaved((prev) => prev.filter((s) => s.id !== tempId));
      addToast('Failed to duplicate', 'error');
    }
  }

  async function handleMoveToCollection(id, collection) {
    const entry = saved.find((s) => s.id === id);
    if (!entry) return;
    try {
      const res = await fetch(`/api/saved/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({ name: entry.name, slug: entry.slug, collection }),
      });
      const row = await res.json();
      if (row.id) {
        setSaved((prev) => prev.map((s) => s.id === id ? { ...s, collection } : s));
        addToast(`Moved to "${collection}"`);
      } else {
        addToast(row.error ?? 'Failed to move', 'error');
      }
    } catch { addToast('Failed to move', 'error'); }
  }

  async function handleRenameCollection(oldName, newName) {
    const ids = saved
      .filter((s) => (s.collection || extractGroup(s.url)) === oldName)
      .map((s) => s.id);
    if (!ids.length) return;
    try {
      const res = await fetch('/api/saved/group', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({ ids, to: newName }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, collection: newName } : s));
        addToast(`Renamed to "${newName}"`);
      } else {
        addToast(data.error ?? 'Failed to rename', 'error');
      }
    } catch { addToast('Failed to rename', 'error'); }
  }

  function exportWorkspace() {
    const data = {
      version: 1,
      exported: new Date().toISOString(),
      saved: saved.map(({ name, method, url, state, collection }) => ({ name, method, url, state, collection })),
      environments: envSets,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'api-playground-workspace.json';
    a.click();
    URL.revokeObjectURL(a.href);
    addToast('Workspace exported');
  }

  async function importWorkspace(file) {
    if (file.size > 1_000_000) { addToast('File too large (max 1 MB)', 'error'); return; }
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { addToast('Invalid JSON file', 'error'); return; }
    if (data?.version !== 1 || !Array.isArray(data.saved) || !Array.isArray(data.environments)) {
      addToast('Invalid workspace file', 'error'); return;
    }
    if (data.saved.length > 500 || data.environments.length > 50) {
      addToast('Workspace too large to import', 'error'); return;
    }
    if (data.environments.length) {
      const safeEnvs = data.environments
        .filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && Array.isArray(e.vars))
        .map((e) => ({
          id: e.id.slice(0, 64),
          name: String(e.name).slice(0, 100),
          vars: e.vars
            .filter((v) => v && typeof v.key === 'string')
            .map((v) => ({ id: typeof v.id === 'string' ? v.id : crypto.randomUUID(), key: String(v.key).slice(0, 200), value: String(v.value ?? '').slice(0, 10_000) }))
            .slice(0, 100),
        }))
        .slice(0, 50);
      if (safeEnvs.length) {
        setEnvSets(safeEnvs);
        setActiveEnvId(safeEnvs[0].id);
        persistEnvSets(safeEnvs, safeEnvs[0].id);
      }
    }
    let count = 0;
    for (const entry of data.saved.slice(0, 500)) {
      const name = typeof entry.name === 'string' && entry.name.trim() ? String(entry.name).slice(0, 200) : null;
      const url = typeof entry.url === 'string' && /^https?:\/\//i.test(entry.url) ? String(entry.url).slice(0, 2000) : null;
      const method = VALID_METHODS.has(entry.method) ? entry.method : 'GET';
      const collection = typeof entry.collection === 'string' ? entry.collection.slice(0, 100) : '';
      if (!name || !url) continue;
      try {
        const slug = nameToSlug(name);
        const encState = await encryptState(entry.state ?? {});
        const res = await fetch('/api/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: getSessionId(), entry: { name, slug, method, url, state: encState, collection } }),
        });
        const row = await res.json();
        if (row.id) {
          setSaved((prev) => [...prev, { id: row.id, name: row.name, slug: row.slug, method: row.method, url: row.url, state: row.state, collection: row.collection ?? '', createdAt: row.created_at }]);
          count++;
        }
      } catch {}
    }
    addToast(`Imported ${count} request${count !== 1 ? 's' : ''}`);
  }

  return (
    <div className="flex flex-col bg-gray-950 text-gray-100 h-screen overflow-hidden">
      <Toast toasts={toasts} />

      {activeModal === 'save' && (
        <SaveModal initialName={suggestName(req.method, req.url)} onSave={handleSave} onCancel={() => setActiveModal(null)} />
      )}
      {renamingEntry && (
        <SaveModal title="Rename request" initialName={renamingEntry.name} onSave={handleRename} onCancel={() => setRenamingEntry(null)} />
      )}
      {activeModal === 'curl' && (
        <CurlImportModal onImport={handleCurlImport} onCancel={() => setActiveModal(null)} />
      )}
      {activeModal === 'cmd' && (
        <CommandPalette
          saved={saved}
          envSets={envSets}
          activeEnvId={activeEnvId}
          onClose={() => setActiveModal(null)}
          onRestoreRequest={(entry) => { openInTab({ ...DEFAULT_STATE, ...entry.state }, { id: entry.id, name: entry.name }); }}
          onSwitchEnv={switchEnvSet}
          onClearHistory={clearHistory}
          onExport={exportWorkspace}
          onNewRequest={() => { newTab(); setActiveModal(null); }}
        />
      )}
      {activeModal === 'live' && (
        <GoLiveModal req={req} onCancel={() => setActiveModal(null)} />
      )}
      {activeModal === 'shortcuts' && (
        <ShortcutsModal isMac={isMac} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'runner' && (
        <CollectionRunner saved={saved} envVars={envVars} requestTimeout={requestTimeout} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'env' && (
        <EnvModal
          envSets={envSets}
          activeEnvId={activeEnvId}
          onClose={() => setActiveModal(null)}
          onSwitchEnv={switchEnvSet}
          onAddEnv={addEnvSet}
          onDeleteEnv={deleteEnvSet}
          onChangeVars={updateEnvSetVars}
          onRenameEnv={renameEnvSet}
        />
      )}

      {tabMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTabMenu(null)} onContextMenu={(e) => { e.preventDefault(); setTabMenu(null); }} />
          <div
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-52 text-xs"
            style={{ left: tabMenu.x, top: tabMenu.y }}
          >
            <button onClick={() => { duplicateTab(tabMenu.tabId); setTabMenu(null); }}
              className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-800 transition-colors">
              Duplicate tab
            </button>
            <div className="border-t border-gray-800 my-1" />
            <button onClick={() => { closeTab(tabMenu.tabId); setTabMenu(null); }}
              className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-800 transition-colors">
              Close tab
            </button>
            {tabs.length > 1 && (
              <button onClick={() => { closeOtherTabs(tabMenu.tabId); setTabMenu(null); }}
                className="w-full text-left px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
                Close other tabs
              </button>
            )}
            {tabs.findIndex(t => t.id === tabMenu.tabId) < tabs.length - 1 && (
              <button onClick={() => { closeTabsToRight(tabMenu.tabId); setTabMenu(null); }}
                className="w-full text-left px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
                Close tabs to the right
              </button>
            )}
            <div className="border-t border-gray-800 my-1" />
            <button onClick={() => { newTab(); setTabMenu(null); }}
              className="w-full text-left px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
              New tab
            </button>
          </div>
        </>
      )}

      {showBanner && (
        <div className="border-b border-indigo-500/20 bg-indigo-500/5 px-6 py-2.5 flex items-center justify-between shrink-0">
          <span className="text-xs text-indigo-300">You're viewing a shared request</span>
          <div className="flex items-center gap-3">
            <button suppressHydrationWarning onClick={() => setActiveModal('save')} disabled={!req.url?.trim()}
              className="text-xs px-3 py-1 rounded border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 hover:border-indigo-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Save to my workspace
            </button>
            <button onClick={() => setShowBanner(false)} className="text-indigo-400/50 hover:text-indigo-300 transition-colors">×</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="noise border-b border-gray-800 px-4 py-3 flex items-center shrink-0 bg-gray-950">
        {/* Brand */}
        <div className="flex items-center shrink-0 mr-4">
          <h1 className="text-xl font-semibold tracking-wider whitespace-nowrap"><span className="text-indigo-400 [text-shadow:0_0_8px_theme(colors.indigo.400/60%),0_0_20px_theme(colors.indigo.500/30%)]">Q</span><span className="text-white">uiver</span></h1>
        </div>

        {/* Center: active request name (mobile only — desktop uses tab bar) */}
        <div className="flex-1 flex md:hidden items-center justify-center min-w-0 px-2">
          {activeRequest && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-gray-400 truncate max-w-xs">{activeRequest.name}</span>
            </div>
          )}
        </div>
        <div className="flex-1 hidden md:block" />

        {/* Right: actions */}
        <div className="flex items-center gap-1 md:gap-1.5 shrink-0 ml-4">
          <button suppressHydrationWarning onClick={() => setActiveModal('save')} disabled={!req.url?.trim()}
            className="flex items-center gap-1.5 text-sm px-2 md:px-4 py-2 rounded-lg border border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/15 hover:border-indigo-400 text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 font-medium">
            <Bookmark size={13} /><span className="hidden md:inline">Save</span>
          </button>
          <button suppressHydrationWarning onClick={copyShareLink} disabled={isSharing || !req.url?.trim()}
            className="flex items-center gap-1.5 text-sm px-2 md:px-4 py-2 rounded-lg border border-share/40 bg-share/10 hover:bg-share/20 hover:border-share text-share disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 font-medium">
            <Link2 size={13} /><span className="hidden md:inline">{isSharing ? 'Saving…' : copied ? '✓ Copied' : 'Share'}</span>
          </button>
          <button onClick={() => setActiveModal('live')}
            className="flex items-center gap-1.5 text-sm px-2 md:px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50 text-red-400 hover:text-red-300 transition-all active:scale-95 font-medium">
            <PulsingDot className="h-1.5 w-1.5 shrink-0" />
            <span className="hidden md:inline">Live</span>
          </button>
          <div className="relative" ref={toolsRef}>
            <button className={`${HDR_BTN} flex items-center gap-1.5 px-2 md:px-4`} onClick={() => setShowTools(v => !v)}>
              <span className="hidden md:inline">Tools</span><ChevronDown size={10} className="text-gray-600" />
            </button>
            {showTools && (
              <div className="absolute right-0 top-full mt-1.5 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-20 w-52">
                <button onClick={() => { setActiveModal('env'); setShowTools(false); }} className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2.5">
                  <Layers size={12} className={`shrink-0 ${envVars.some(v => v.key) ? 'text-indigo-400' : 'text-gray-600'}`} />
                  Environments
                </button>
                <button onClick={() => { setActiveModal('runner'); setShowTools(false); }} className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2.5">
                  <Play size={12} className="shrink-0 text-gray-600" />
                  Collection Runner
                </button>
                <div className="hidden md:block mx-3 my-1.5 border-t border-gray-800" />
                <button suppressHydrationWarning onClick={() => { copyAsCurl(); setShowTools(false); }} disabled={!req.url?.trim()} className="hidden md:flex w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed items-center gap-2.5">
                  <Terminal size={12} className="shrink-0 text-gray-600" />
                  Copy as cURL
                </button>
                <button onClick={() => { setActiveModal('curl'); setShowTools(false); }} className="hidden md:flex w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors items-center gap-2.5">
                  <Download size={12} className="shrink-0 text-gray-600" />
                  Import cURL
                </button>
                <button onClick={() => { exportWorkspace(); setShowTools(false); }} className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2.5">
                  <Upload size={12} className="shrink-0 text-gray-600" />
                  Export workspace
                </button>
                <button onClick={() => { importFileRef.current?.click(); setShowTools(false); }} className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-2.5">
                  <FolderOpen size={12} className="shrink-0 text-gray-600" />
                  Import workspace
                </button>
              </div>
            )}
          </div>
          <input ref={importFileRef} type="file" accept=".json" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) { importWorkspace(e.target.files[0]); e.target.value = ''; } }} />
          <button onClick={() => setActiveModal('shortcuts')} title="Keyboard shortcuts (?)" className="hidden md:block text-gray-600 hover:text-gray-300 transition-colors p-1">
            <Keyboard size={18} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          saved={saved}
          history={history}
          activeRequestId={activeRequest?.id}
          onRestoreSaved={(entry) => { openInTab({ ...DEFAULT_STATE, ...entry.state }, { id: entry.id, name: entry.name }); setMobileView('request'); }}
          onDeleteSaved={deleteFromSaved}
          onClearAllSaved={clearAllSaved}
          onRenameSaved={setRenamingEntry}
          onCopyLink={(entry) => { navigator.clipboard.writeText(`${window.location.origin}/p/${entry.slug}`); addToast('Link copied'); }}
          onDuplicate={duplicateSaved}
          onMoveToCollection={handleMoveToCollection}
          onRenameCollection={handleRenameCollection}
          onRestoreHistory={(entry) => { openInTab({ ...DEFAULT_STATE, ...entry.state }, null); setMobileView('request'); }}
          onDeleteHistory={deleteFromHistory}
          onClearHistory={clearHistory}
          mobileOpen={mobileView === 'library'}
          loading={sidebarLoading}
        />

        {/* Split view wrapper */}
        <div className={`flex-1 flex-col overflow-hidden ${mobileView === 'library' ? 'hidden md:flex' : 'flex'}`}>

          {/* Tab bar (desktop only) */}
          <div className="hidden md:flex items-center border-b border-gray-800 bg-gray-950 overflow-x-auto shrink-0 min-h-0">
            {tabs.map(tab => {
              const isActive = tab.id === activeTabId;
              const tabClasses = `flex items-center gap-1.5 px-3 py-2.5 text-xs border-r border-gray-800 shrink-0 min-w-[160px] max-w-[240px] group transition-colors border-t-2 ${isActive ? 'bg-gray-900 text-white border-t-indigo-500' : 'text-gray-500 hover:text-gray-400 hover:bg-gray-900/30 border-t-transparent'}`;
              if (editingTab?.id === tab.id) {
                return (
                  <div key={tab.id} className={tabClasses}>
                    <span className={`text-[9px] font-semibold shrink-0 ${methodColor(tab.req.method)}`}>{tab.req.method}</span>
                    <input
                      autoFocus
                      aria-label="Tab name"
                      value={editingTab.value}
                      onChange={(e) => setEditingTab(prev => ({ ...prev, value: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      onBlur={commitTabRename}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') { e.preventDefault(); commitTabRename(); }
                        if (e.key === 'Escape') setEditingTab(null);
                      }}
                      className="min-w-0 flex-1 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                );
              }
              return (
                <button
                  key={tab.id}
                  onClick={() => setTabState(prev => ({ ...prev, activeTabId: tab.id }))}
                  onDoubleClick={() => setEditingTab({ id: tab.id, value: tabLabel(tab) })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabMenu({ tabId: tab.id, x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 180) });
                  }}
                  title="Double-click to rename"
                  className={tabClasses}
                >
                  <span className={`text-[9px] font-semibold shrink-0 ${methodColor(tab.req.method)}`}>{tab.req.method}</span>
                  <span className="truncate min-w-0 flex-1 text-left">{tabLabel(tab)}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label="Close tab"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-300 transition-all leading-none"
                  >
                    <X size={10} />
                  </span>
                </button>
              );
            })}
            <button
              onClick={newTab}
              title={`New tab (${isMac ? '⌘' : 'Ctrl'}+T)`}
              className="px-3 py-2 text-gray-600 hover:text-gray-400 transition-colors shrink-0"
            >
              <Plus size={12} />
            </button>
          </div>

        {/* Split view */}
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden" ref={splitRef}>

          {/* Request panel */}
          <div
            className={`flex flex-col p-4 gap-4 overflow-y-auto pb-16 md:pb-4 bg-surface ${mobileView === 'request' ? 'flex' : 'hidden md:flex'}`}
            style={{ flex: splitPct, minWidth: 0 }}
          >
            <RequestBar
              method={req.method}
              url={req.url}
              onMethodChange={handleMethodChange}
              onUrlChange={(url) => { setReq((r) => ({ ...r, url })); if (!url.trim() && activeTab === 'code') setActiveTab('headers'); }}
              onSend={sendRequest}
              isLoading={isLoading}
              jsonInvalid={jsonInvalid}
              isMac={isMac}
              timeout={requestTimeout}
              onTimeoutChange={setRequestTimeout}
            />

            <div className="flex-1 min-h-0 flex flex-col rounded-lg overflow-hidden bg-gray-900">
              <div className="flex items-center gap-0.5 px-1.5 py-1.5 border-b border-gray-800/50 shrink-0">
                <TabButton id="params" activeTab={activeTab} onClick={() => setActiveTab('params')} icon={SlidersHorizontal}>
                  Params
                  {req.url?.includes('?') && <span className="ml-0.5 text-gray-600">({req.url.split('?')[1].split('&').filter((p) => p).length})</span>}
                </TabButton>
                <TabButton id="headers" activeTab={activeTab} onClick={() => setActiveTab('headers')} icon={List}>
                  Headers
                  {req.headers.length > 0 && <span className="ml-0.5 text-gray-600">({req.headers.length})</span>}
                </TabButton>
                <TabButton id="auth" activeTab={activeTab} onClick={() => setActiveTab('auth')} icon={Lock}>
                  Auth
                  {req.auth?.type !== 'none' && <span className="ml-0.5 text-indigo-400">●</span>}
                </TabButton>
                {showBody && (
                  <TabButton id="body" activeTab={activeTab} onClick={() => setActiveTab('body')} icon={FileText}>
                    Body
                    {req.bodyType !== 'none' && <span className={`ml-0.5 ${jsonInvalid ? 'text-red-400' : 'text-gray-600'}`}>{jsonInvalid ? '!' : `(${req.bodyType})`}</span>}
                  </TabButton>
                )}
                {req.url?.trim() && (
                  <TabButton id="code" activeTab={activeTab} onClick={() => setActiveTab('code')} icon={Code2}>Code</TabButton>
                )}
              </div>
              <div className="p-3 flex-1 overflow-y-auto">
                {activeTab === 'params' && <ParamsEditor url={req.url} onChange={(url) => setReq((r) => ({ ...r, url }))} />}
                {activeTab === 'headers' && <HeadersEditor headers={req.headers} onChange={(headers) => setReq((r) => ({ ...r, headers }))} />}
                {activeTab === 'auth' && <AuthEditor auth={req.auth} onChange={(auth) => setReq((r) => ({ ...r, auth }))} />}
                {activeTab === 'code' && <CodeGenPanel req={req} />}
                {activeTab === 'body' && showBody && (
                  <BodyEditor
                    bodyType={req.bodyType}
                    body={req.body}
                    formFields={req.formFields ?? []}
                    graphqlQuery={req.graphqlQuery ?? ''}
                    graphqlVariables={req.graphqlVariables ?? '{}'}
                    onChange={({ bodyType, body, formFields, graphqlQuery, graphqlVariables }) => {
                      const updates = { bodyType, body, formFields, graphqlQuery, graphqlVariables };
                      if (bodyType === 'graphql' && ['GET', 'HEAD'].includes(req.method)) updates.method = 'POST';
                      setReq((r) => ({ ...r, ...updates }));
                    }}
                  />
                )}
              </div>
            </div>

            {/* Last response summary — mobile only; on desktop the response panel is already visible */}
            {response && !response.error && !isLoading && (
              <div className="shrink-0 px-1 text-xs text-gray-600 flex md:hidden items-center gap-1.5">
                <span>Last response:</span>
                <span className={statusColor(response.status)}>{response.status}</span>
                <span className="text-gray-700 select-none">·</span>
                <span className={latencyColor(response.time)}>{response.time}ms</span>
                {activeTabData.respondedAt && (
                  <>
                    <span className="text-gray-700 select-none">·</span>
                    <span>{new Date(activeTabData.respondedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Drag handle */}
          <div
            className="hidden md:block w-1 bg-gray-800 hover:bg-indigo-500/40 cursor-col-resize shrink-0 transition-colors select-none"
            onMouseDown={handleDragStart}
          />

          {/* Response panel */}
          <div
            className={`flex-col overflow-hidden bg-gray-950 border-l border-gray-800/60 ${mobileView === 'response' ? 'flex' : 'hidden md:flex'}`}
            style={{ flex: 100 - splitPct, minWidth: 0 }}
          >
            <div className="border-b border-gray-800 px-4 py-2.5 shrink-0 flex items-center gap-2 bg-gray-900/60 min-h-[41px]">
              {response && !response.error && (
                <>
                  {response.streaming && (
                    <div className="flex items-center gap-1 text-xs text-indigo-400">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-400" />
                      </span>
                      Streaming
                    </div>
                  )}
                  <a
                    href={`https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/${response.status}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity ${statusBadgeClass(response.status)}`}
                  >
                    {response.status} {response.statusText}
                  </a>
                  <span className="text-gray-700 text-xs select-none">·</span>
                  <span className={`text-xs tabular-nums ${latencyColor(response.time)}`}>{response.time}ms</span>
                  <span className="text-gray-700 text-xs select-none">·</span>
                  <span className="text-xs text-gray-400 tabular-nums">{formatSize(response.body)}</span>
                </>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <ResponsePanel
                response={response}
                isLoading={isLoading}
                onExtract={handleExtract}
                hideStatusBar
              />
            </div>
          </div>

        </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-gray-800 bg-gray-950/95 backdrop-blur-sm">
        <button
          onClick={() => setMobileView('request')}
          className={`flex-1 py-3 text-xs font-medium transition-colors ${mobileView === 'request' ? 'text-white' : 'text-gray-500'}`}
        >
          Request
        </button>
        <button
          onClick={() => setMobileView('response')}
          className={`flex-1 py-3 text-xs font-medium transition-colors flex items-center justify-center gap-2 ${mobileView === 'response' ? 'text-white' : 'text-gray-500'}`}
        >
          Response
          {response && !response.error && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${statusBadgeClass(response.status)}`}>
              {response.status}
            </span>
          )}
        </button>
        <button
          onClick={() => setMobileView('library')}
          className={`flex-1 py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${mobileView === 'library' ? 'text-white' : 'text-gray-500'}`}
        >
          Library
          {saved.length > 0 && <span className="text-gray-700 text-xs">{saved.length}</span>}
        </button>
      </div>
    </div>
  );
}
