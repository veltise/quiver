'use client';

import { useState, useEffect, useRef } from 'react';
import { Copy, Download, FileText, List, Cookie, Clock, Search, X, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { formatSize, statusColor, latencyColor } from '@/lib/utils';

function parseCookies(headers) {
  const raw = headers?.['set-cookie'];
  if (!raw) return [];
  const parts = raw.split(';').map(s => s.trim());
  const [nameVal, ...attrs] = parts;
  const eqIdx = nameVal.indexOf('=');
  const cookie = {
    name: eqIdx === -1 ? nameVal : nameVal.slice(0, eqIdx),
    value: eqIdx === -1 ? '' : nameVal.slice(eqIdx + 1),
  };
  for (const attr of attrs) {
    const [k, ...rest] = attr.split('=');
    const key = k.trim().toLowerCase();
    const val = rest.join('=').trim();
    if (key === 'path') cookie.path = val;
    else if (key === 'domain') cookie.domain = val;
    else if (key === 'expires') cookie.expires = val;
    else if (key === 'max-age') cookie.maxAge = val;
    else if (key === 'samesite') cookie.sameSite = val;
    else if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'secure') cookie.secure = true;
  }
  return [cookie];
}

function timingBarColor(ms) {
  if (ms < 200) return 'bg-success';
  if (ms < 1000) return 'bg-warning';
  return 'bg-error';
}

function HeaderRow({ name, value }) {
  const [expanded, setExpanded] = useState(false);
  let prettyJson = null;
  try { prettyJson = JSON.stringify(JSON.parse(value), null, 2); } catch {}

  return (
    <div className="flex gap-3 py-1.5 border-b border-border-subtle last:border-0 text-sm">
      <a
        href={`https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/${name}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-48 shrink-0 text-info hover:text-accent transition-colors truncate whitespace-nowrap"
      >
        {name}
      </a>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-text break-all flex-1">{value}</span>
          {prettyJson && (
            <button onClick={() => setExpanded(v => !v)} className="text-xs text-dim hover:text-text transition-colors shrink-0 mt-0.5">
              {expanded ? '▴' : '▾'}
            </button>
          )}
        </div>
        {prettyJson && expanded && (
          <pre className="mt-1.5 text-xs bg-surface-raised p-2 overflow-auto max-h-40 text-text leading-relaxed font-mono">{prettyJson}</pre>
        )}
      </div>
    </div>
  );
}

function ExtractPopup({ value, suggestedName, position, onSave, onClose }) {
  const [name, setName] = useState(suggestedName);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const left = Math.min(position.x, window.innerWidth - 240);
  const top = position.y + 12;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 bg-surface-raised border border-border shadow-2xl p-3 w-56 animate-fade-up" style={{ left, top }}>
        <p className="text-xs text-muted mb-2">Save as environment variable</p>
        <div className="flex items-center gap-1 bg-surface border border-border px-2 py-1.5 mb-2">
          <span className="text-dim text-xs select-none">{'{{'}</span>
          <input
            autoFocus
            className="flex-1 bg-transparent text-xs focus:outline-none text-text min-w-0"
            placeholder="variable_name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), value); }}
          />
          <span className="text-dim text-xs select-none">{'}}'}</span>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs text-muted hover:text-text transition-colors px-2 py-1">Cancel</button>
          <button
            onClick={() => { if (name.trim()) onSave(name.trim(), value); }}
            disabled={!name.trim()}
            className="text-xs bg-accent hover:bg-accent-hover text-ink disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

// ─── JSON Tree ────────────────────────────────────────────────────────────────

function JsonPrimitive({ value, onExtract, nodeKey }) {
  if (value === null) return <span className="text-muted select-text">null</span>;
  if (typeof value === 'boolean')
    return <span className="text-info cursor-pointer hover:opacity-75 transition-opacity select-text" onClick={e => onExtract(String(value), nodeKey, e)}>{String(value)}</span>;
  if (typeof value === 'number')
    return <span className="text-text cursor-pointer hover:opacity-75 transition-opacity select-text" onClick={e => onExtract(String(value), nodeKey, e)}>{value}</span>;
  if (typeof value === 'string')
    return <span className="text-info cursor-pointer hover:opacity-75 transition-opacity break-all select-text" onClick={e => onExtract(value, nodeKey, e)}>"{value}"</span>;
  return null;
}

// JsonNode is stateless — open/closed lives in JsonTree's stateMap
function JsonNode({ nodeKey, value, depth, path, onExtract, onCopyPath, getIsOpen, onToggle }) {
  const isObj = value !== null && typeof value === 'object';
  const isArr = Array.isArray(value);

  const entries = isObj
    ? (isArr ? value.map((v, i) => [String(i), v]) : Object.entries(value))
    : null;

  const keyLabel = nodeKey !== undefined ? (
    <span
      className="text-accent hover:text-accent-hover cursor-pointer transition-colors"
      onClick={e => { e.stopPropagation(); onCopyPath(path); }}
      title={`Copy path: ${path}`}
    >
      "{nodeKey}"
    </span>
  ) : null;

  if (!isObj) {
    return (
      <div className="flex items-baseline flex-wrap gap-x-1 leading-[1.75]">
        {keyLabel && <>{keyLabel}<span className="text-dim mr-0.5">:</span></>}
        <JsonPrimitive value={value} onExtract={onExtract} nodeKey={nodeKey ?? ''} />
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="flex items-baseline gap-1 leading-[1.75]">
        {keyLabel && <>{keyLabel}<span className="text-dim">:</span></>}
        <span className="text-dim">{isArr ? '[ ]' : '{ }'}</span>
      </div>
    );
  }

  const open = getIsOpen(path, depth);

  return (
    <div className="leading-[1.75]">
      <div
        className="flex items-center gap-0.5 cursor-pointer select-none group"
        onClick={() => onToggle(path, depth)}
      >
        <ChevronRight
          size={11}
          className={`text-dim shrink-0 transition-transform duration-150 group-hover:text-accent ${open ? 'rotate-90' : ''}`}
        />
        {keyLabel && (
          <div className="flex items-baseline gap-1" onClick={e => e.stopPropagation()}>
            {keyLabel}
            <span className="text-dim">:</span>
          </div>
        )}
        <span className="text-muted ml-0.5">{isArr ? '[' : '{'}</span>
        {!open && (
          <>
            <span className="text-dim text-xs mx-1.5">
              {isArr
                ? `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`
                : `${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`}
            </span>
            <span className="text-muted">{isArr ? ']' : '}'}</span>
          </>
        )}
      </div>
      {open && (
        <div className="relative ml-[14px] pl-3.5 border-l border-border-subtle hover:border-accent/20 transition-colors">
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              nodeKey={isArr ? undefined : k}
              value={v}
              depth={depth + 1}
              path={isArr ? `${path}[${k}]` : `${path}.${k}`}
              onExtract={onExtract}
              onCopyPath={onCopyPath}
              getIsOpen={getIsOpen}
              onToggle={onToggle}
            />
          ))}
          <div><span className="text-muted">{isArr ? ']' : '}'}</span></div>
        </div>
      )}
    </div>
  );
}

function flattenJson(data, path = '$', out = []) {
  if (data === null || typeof data !== 'object') {
    out.push({ path, value: data });
    return out;
  }
  const entries = Array.isArray(data)
    ? data.map((v, i) => [`[${i}]`, v])
    : Object.entries(data).map(([k, v]) => [`.${k}`, v]);
  entries.forEach(([seg, v]) => flattenJson(v, `${path}${seg}`, out));
  return out;
}

function JsonTree({ body, onExtract, onCopyPath }) {
  const [search, setSearch] = useState('');
  // stateMap: explicit path→boolean overrides; allExpanded: true when "expand all" is active
  // snapshot: the stateMap captured right before expand-all, so collapse-all can restore it exactly
  const [stateMap, setStateMap] = useState(() => new Map());
  const [allExpanded, setAllExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState(null);

  function getIsOpen(path, depth) {
    if (stateMap.has(path)) return stateMap.get(path);
    return allExpanded ? true : depth < 2;
  }

  function handleToggle(path, depth) {
    const current = getIsOpen(path, depth);
    setStateMap(prev => { const n = new Map(prev); n.set(path, !current); return n; });
  }

  function expandAll() {
    setSnapshot(stateMap);           // save current explicit overrides
    setStateMap(new Map());          // clear overrides so allExpanded applies everywhere
    setAllExpanded(true);
  }

  function collapseAll() {
    setStateMap(snapshot ?? new Map()); // restore pre-expand explicit overrides
    setSnapshot(null);
    setAllExpanded(false);
  }

  let parsed;
  try { parsed = JSON.parse(body); } catch { return null; }

  const q = search.trim().toLowerCase();
  const flat = q
    ? flattenJson(parsed).filter(({ path, value }) =>
        path.toLowerCase().includes(q) || String(value).toLowerCase().includes(q)
      )
    : null;

  return (
    <div className="font-mono text-[13px]">
      <div className="sticky top-0 z-10 px-4 py-2.5 bg-surface-raised border-b border-border-subtle">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search keys and values…"
              className="w-full bg-surface-raised border border-border pl-7 pr-6 py-1.5 text-xs placeholder-dim focus:outline-none focus:border-accent/40 focus:bg-surface-raised transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-text transition-colors">
                <X size={10} />
              </button>
            )}
          </div>
          {!flat && (
            <div className="flex gap-1 shrink-0">
              <button onClick={expandAll} title="Expand all" className="text-dim hover:text-text transition-colors p-1 rounded hover:bg-[rgba(242,237,228,.06)]">
                <ChevronsUpDown size={12} />
              </button>
              <button onClick={collapseAll} title="Collapse all" className="text-dim hover:text-text transition-colors p-1 rounded hover:bg-[rgba(242,237,228,.06)]">
                <ChevronsDownUp size={12} />
              </button>
            </div>
          )}
        </div>
        {q && flat && (
          <p className="text-[11px] text-dim mt-1.5">{flat.length} result{flat.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      <div className="p-4">
        {flat ? (
          flat.length === 0 ? (
            <p className="text-dim text-xs py-2">No results for "{search}"</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {flat.slice(0, 200).map(({ path, value }) => (
                <div key={path} className="flex items-baseline gap-2 group hover:bg-[rgba(242,237,228,.04)] px-1 -mx-1 py-0.5">
                  <span
                    className="text-accent/60 text-xs cursor-pointer hover:text-accent transition-colors shrink-0 truncate max-w-[180px]"
                    onClick={() => onCopyPath(path)}
                    title={path}
                  >
                    {path}
                  </span>
                  <span className="text-dim text-xs shrink-0">→</span>
                  <span className={
                    value === null ? 'text-muted' :
                    typeof value === 'string' ? 'text-info break-all' :
                    typeof value === 'number' ? 'text-text' :
                    typeof value === 'boolean' ? 'text-info' : 'text-muted'
                  }>
                    {value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value)}
                  </span>
                </div>
              ))}
              {flat.length > 200 && (
                <p className="text-dim text-xs mt-2">+{flat.length - 200} more — narrow your search</p>
              )}
            </div>
          )
        ) : (
          <JsonNode
            value={parsed}
            depth={0}
            path="$"
            onExtract={onExtract}
            onCopyPath={onCopyPath}
            getIsOpen={getIsOpen}
            onToggle={handleToggle}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResponsePanel({ response, isLoading, onExtract, hideStatusBar }) {
  const [activeTab, setActiveTab] = useState('body');
  const [copied, setCopied] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const [extracting, setExtracting] = useState(null);
  const [rawMode, setRawMode] = useState(false);
  const streamPreRef = useRef(null);

  useEffect(() => {
    if (response?.streaming && streamPreRef.current) {
      streamPreRef.current.scrollTop = streamPreRef.current.scrollHeight;
    }
  }, [response?.body, response?.streaming]);

  function handleTreeExtract(value, suggestedName, e) {
    setExtracting({ value, suggestedName, position: { x: e.clientX, y: e.clientY } });
  }

  function handleCopyPath(path) {
    navigator.clipboard.writeText(path).catch(() => {});
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
  }

  function handleExtractSave(name, value) {
    onExtract?.(name, value);
    setExtracting(null);
  }

  function renderBody(body) {
    const preCls = 'p-4 text-sm text-text overflow-x-auto whitespace-pre-wrap break-words leading-relaxed font-mono bg-surface-raised';

    if (rawMode || response?.streaming) {
      return (
        <pre ref={response?.streaming ? streamPreRef : null} className={preCls}>
          {body || '(empty)'}
        </pre>
      );
    }

    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}

    if (parsed !== null) {
      return (
        <JsonTree body={body} onExtract={handleTreeExtract} onCopyPath={handleCopyPath} />
      );
    }

    return <pre className={`${preCls} text-text`}>{body || '(empty)'}</pre>;
  }

  function copyBody() {
    let text = response.body;
    try { text = JSON.stringify(JSON.parse(response.body), null, 2); } catch {}
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadBody() {
    let content = response.body;
    let filename = 'response.txt';
    let type = 'text/plain';
    try {
      content = JSON.stringify(JSON.parse(response.body), null, 2);
      filename = 'response.json';
      type = 'application/json';
    } catch {}
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading && !response?.streaming) {
    return (
      <div className="p-6 animate-fade-up">
        <div className="flex flex-col gap-2.5 animate-pulse">
          {[75, 55, 85, 65, 45].map((w, i) => (
            <div key={i} className="h-3 bg-surface-raised" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-48 gap-4 select-none pointer-events-none">
        <svg width="60" height="20" viewBox="0 0 60 20" className="text-accent opacity-70">
          <circle cx="3" cy="10" r="1.75" fill="currentColor" />
          <line x1="3" y1="10" x2="40" y2="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.55" />
          <polygon points="38,3 58,10 38,17" fill="currentColor" />
        </svg>
        <div className="text-center">
          <p className="text-[13.5px] font-medium text-text/85 whitespace-nowrap">No response yet</p>
          <p className="text-xs text-dim mt-1 max-w-[220px] leading-relaxed">Send a request and the response lands right here.</p>
        </div>
      </div>
    );
  }

  if (response.error) {
    return (
      <div className="p-4 animate-fade-up">
        <div className="flex items-start gap-2.5 text-sm">
          <span className="text-error shrink-0 mt-0.5">⚠</span>
          <span className="text-error">{response.error}</span>
        </div>
      </div>
    );
  }

  const headerEntries = Object.entries(response.headers ?? {});
  const cookies = parseCookies(response.headers);

  return (
    <div className="flex flex-col animate-fade-up">
      {extracting && (
        <ExtractPopup
          value={extracting.value}
          suggestedName={extracting.suggestedName}
          position={extracting.position}
          onSave={handleExtractSave}
          onClose={() => setExtracting(null)}
        />
      )}

      {pathCopied && (
        <div className="absolute top-14 right-4 text-xs bg-surface-raised border border-border px-2.5 py-1.5 text-text z-20 pointer-events-none animate-fade-up shadow-xl">
          Path copied
        </div>
      )}

      <div className="flex items-center border-b border-border-subtle px-2">
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {[
            { id: 'body', icon: FileText, label: 'Body' },
            { id: 'headers', icon: List, label: 'Headers', countVal: headerEntries.length },
            { id: 'cookies', icon: Cookie, label: 'Cookies', countVal: cookies.length || undefined },
            { id: 'timing', icon: Clock, label: 'Timing' },
          ].map(({ id, icon: Icon, label, countVal }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors border-b-2 -mb-px ${
                activeTab === id
                  ? 'border-accent text-text'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              <Icon size={11} />
              {label}
              {countVal != null && <span className="ml-0.5 text-dim">({countVal})</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-1 shrink-0">
          {!hideStatusBar && (
            <div className="flex items-center gap-3 mr-2">
              {response.streaming && (
                <div className="flex items-center gap-1 text-xs text-accent">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
                  </span>
                  Streaming
                </div>
              )}
              <a
                href={`https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/${response.status}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`font-bold text-xs hover:underline ${statusColor(response.status)}`}
              >
                {response.status} {response.statusText}
              </a>
              <span className={`text-xs tabular-nums ${latencyColor(response.time)}`}>{response.time}ms</span>
              <span className="text-xs text-muted">{formatSize(response.body)}</span>
            </div>
          )}
          <button
            onClick={() => setRawMode(v => !v)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${rawMode ? 'border-accent/50 text-accent bg-accent/5' : 'border-border text-muted hover:text-text hover:border-[rgba(242,237,228,.3)]'}`}
          >
            Raw
          </button>
          <button
            onClick={copyBody}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors px-2 py-1 rounded border border-border hover:border-[rgba(242,237,228,.3)]"
          >
            <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={downloadBody}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors px-2 py-1 rounded border border-border hover:border-[rgba(242,237,228,.3)]"
          >
            <Download size={11} />Save
          </button>
        </div>
      </div>

      {activeTab === 'body' && renderBody(response.body)}

      {activeTab === 'headers' && (
        <div className="flex flex-col px-4">
          {headerEntries.length === 0 ? (
            <p className="text-dim text-sm py-4">No headers</p>
          ) : (
            headerEntries.map(([key, value]) => <HeaderRow key={key} name={key} value={value} />)
          )}
        </div>
      )}

      {activeTab === 'cookies' && (
        <div className="flex flex-col gap-2 px-4 py-2">
          {cookies.length === 0 ? (
            <p className="text-dim text-sm py-4">No cookies in response</p>
          ) : cookies.map((c, i) => (
            <div key={i} className="bg-surface-raised p-3 flex flex-col gap-1.5 border border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-accent font-semibold">{c.name}</span>
                <span className="text-xs text-muted font-mono truncate">{c.value || <span className="text-dim italic">empty</span>}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {c.path && <span className="text-xs text-dim">Path: <span className="text-muted font-mono">{c.path}</span></span>}
                {c.domain && <span className="text-xs text-dim">Domain: <span className="text-muted font-mono">{c.domain}</span></span>}
                {c.expires && <span className="text-xs text-dim">Expires: <span className="text-muted">{c.expires}</span></span>}
                {c.maxAge && <span className="text-xs text-dim">Max-Age: <span className="text-muted">{c.maxAge}s</span></span>}
                {c.sameSite && <span className="text-xs text-dim">SameSite: <span className="text-muted">{c.sameSite}</span></span>}
                {c.httpOnly && <span className="text-xs px-1.5 py-0.5 rounded bg-[rgba(242,237,228,.08)] text-muted">HttpOnly</span>}
                {c.secure && <span className="text-xs px-1.5 py-0.5 rounded bg-[rgba(242,237,228,.08)] text-muted">Secure</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'timing' && (
        <div className="flex flex-col gap-4 px-4 py-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Total (server round-trip)</span>
              <span className={`text-sm font-mono font-semibold ${latencyColor(response.time)}`}>{response.time}ms</span>
            </div>
            <div className="h-1.5 bg-[rgba(242,237,228,.08)] overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${timingBarColor(response.time)}`}
                style={{ width: `${Math.min(100, (response.time / 3000) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-dim">
              <span>0ms</span>
              <span className="text-success/60">200ms</span>
              <span className="text-warning/60">1s</span>
              <span className="text-error/60">3s+</span>
            </div>
          </div>
          <p className="text-xs text-dim">Measures proxy-side fetch time. Does not include client↔server transit.</p>
        </div>
      )}
    </div>
  );
}
