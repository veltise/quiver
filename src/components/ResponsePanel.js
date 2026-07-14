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
  if (ms < 200) return 'bg-green-500';
  if (ms < 1000) return 'bg-yellow-500';
  return 'bg-red-500';
}

function HeaderRow({ name, value }) {
  const [expanded, setExpanded] = useState(false);
  let prettyJson = null;
  try { prettyJson = JSON.stringify(JSON.parse(value), null, 2); } catch {}

  return (
    <div className="flex gap-3 py-1.5 border-b border-gray-800/50 last:border-0 text-sm">
      <a
        href={`https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/${name}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-48 shrink-0 text-gray-500 hover:text-indigo-400 transition-colors truncate"
      >
        {name}
      </a>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-gray-200 break-all flex-1">{value}</span>
          {prettyJson && (
            <button onClick={() => setExpanded(v => !v)} className="text-xs text-gray-600 hover:text-gray-400 transition-colors shrink-0 mt-0.5">
              {expanded ? '▴' : '▾'}
            </button>
          )}
        </div>
        {prettyJson && expanded && (
          <pre className="mt-1.5 text-xs bg-gray-900 rounded p-2 overflow-auto max-h-40 text-gray-300 leading-relaxed font-mono">{prettyJson}</pre>
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
      <div className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-3 w-56 animate-fade-up" style={{ left, top }}>
        <p className="text-xs text-gray-400 mb-2">Save as environment variable</p>
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 mb-2">
          <span className="text-gray-600 text-xs select-none">{'{{'}</span>
          <input
            autoFocus
            className="flex-1 bg-transparent text-xs focus:outline-none text-gray-200 min-w-0"
            placeholder="variable_name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), value); }}
          />
          <span className="text-gray-600 text-xs select-none">{'}}'}</span>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1">Cancel</button>
          <button
            onClick={() => { if (name.trim()) onSave(name.trim(), value); }}
            disabled={!name.trim()}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded transition-colors"
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
  if (value === null) return <span className="text-gray-500 select-text">null</span>;
  if (typeof value === 'boolean')
    return <span className="text-sky-300 cursor-pointer hover:opacity-75 transition-opacity select-text" onClick={e => onExtract(String(value), nodeKey, e)}>{String(value)}</span>;
  if (typeof value === 'number')
    return <span className="text-amber-300 cursor-pointer hover:opacity-75 transition-opacity select-text" onClick={e => onExtract(String(value), nodeKey, e)}>{value}</span>;
  if (typeof value === 'string')
    return <span className="text-emerald-300 cursor-pointer hover:opacity-75 transition-opacity break-all select-text" onClick={e => onExtract(value, nodeKey, e)}>"{value}"</span>;
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
      className="text-violet-300 hover:text-violet-200 cursor-pointer transition-colors"
      onClick={e => { e.stopPropagation(); onCopyPath(path); }}
      title={`Copy path: ${path}`}
    >
      "{nodeKey}"
    </span>
  ) : null;

  if (!isObj) {
    return (
      <div className="flex items-baseline flex-wrap gap-x-1 leading-[1.75]">
        {keyLabel && <>{keyLabel}<span className="text-gray-600 mr-0.5">:</span></>}
        <JsonPrimitive value={value} onExtract={onExtract} nodeKey={nodeKey ?? ''} />
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="flex items-baseline gap-1 leading-[1.75]">
        {keyLabel && <>{keyLabel}<span className="text-gray-600">:</span></>}
        <span className="text-gray-600">{isArr ? '[ ]' : '{ }'}</span>
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
          className={`text-gray-600 shrink-0 transition-transform duration-150 group-hover:text-indigo-400 ${open ? 'rotate-90' : ''}`}
        />
        {keyLabel && (
          <div className="flex items-baseline gap-1" onClick={e => e.stopPropagation()}>
            {keyLabel}
            <span className="text-gray-600">:</span>
          </div>
        )}
        <span className="text-gray-500 ml-0.5">{isArr ? '[' : '{'}</span>
        {!open && (
          <>
            <span className="text-gray-700 text-xs mx-1.5">
              {isArr
                ? `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`
                : `${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`}
            </span>
            <span className="text-gray-500">{isArr ? ']' : '}'}</span>
          </>
        )}
      </div>
      {open && (
        <div className="relative ml-[14px] pl-3.5 border-l border-gray-800/60 hover:border-indigo-500/20 transition-colors">
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
          <div><span className="text-gray-500">{isArr ? ']' : '}'}</span></div>
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
      <div className="sticky top-0 z-10 px-4 py-2.5 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/40">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search keys and values…"
              className="w-full bg-gray-900/70 border border-gray-800 rounded-md pl-7 pr-6 py-1.5 text-xs placeholder-gray-700 focus:outline-none focus:border-indigo-500/40 focus:bg-gray-900 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors">
                <X size={10} />
              </button>
            )}
          </div>
          {!flat && (
            <div className="flex gap-1 shrink-0">
              <button onClick={expandAll} title="Expand all" className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-800">
                <ChevronsUpDown size={12} />
              </button>
              <button onClick={collapseAll} title="Collapse all" className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-800">
                <ChevronsDownUp size={12} />
              </button>
            </div>
          )}
        </div>
        {q && flat && (
          <p className="text-[11px] text-gray-700 mt-1.5">{flat.length} result{flat.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      <div className="p-4">
        {flat ? (
          flat.length === 0 ? (
            <p className="text-gray-600 text-xs py-2">No results for "{search}"</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {flat.slice(0, 200).map(({ path, value }) => (
                <div key={path} className="flex items-baseline gap-2 group hover:bg-gray-900/50 rounded px-1 -mx-1 py-0.5">
                  <span
                    className="text-violet-400/60 text-xs cursor-pointer hover:text-violet-300 transition-colors shrink-0 truncate max-w-[180px]"
                    onClick={() => onCopyPath(path)}
                    title={path}
                  >
                    {path}
                  </span>
                  <span className="text-gray-700 text-xs shrink-0">→</span>
                  <span className={
                    value === null ? 'text-gray-500' :
                    typeof value === 'string' ? 'text-emerald-300 break-all' :
                    typeof value === 'number' ? 'text-amber-300' :
                    typeof value === 'boolean' ? 'text-sky-300' : 'text-gray-400'
                  }>
                    {value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value)}
                  </span>
                </div>
              ))}
              {flat.length > 200 && (
                <p className="text-gray-700 text-xs mt-2">+{flat.length - 200} more — narrow your search</p>
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
    const preCls = 'p-4 text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed font-mono bg-gray-900/30';

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

    return <pre className={`${preCls} text-gray-200`}>{body || '(empty)'}</pre>;
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
            <div key={i} className="h-3 bg-gray-800/80 rounded" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-48 gap-3 select-none pointer-events-none">
        <div className="flex items-end gap-[3px] h-7 opacity-20">
          <div className="w-[2px] h-5 bg-gray-400 rounded-full -skew-x-6" />
          <div className="w-[2px] h-7 bg-gray-300 rounded-full" />
          <div className="w-[2px] h-5 bg-gray-400 rounded-full skew-x-6" />
        </div>
        <p className="text-[11px] text-gray-700 tracking-widest uppercase font-medium">Awaiting response</p>
      </div>
    );
  }

  if (response.error) {
    return (
      <div className="p-4 animate-fade-up">
        <div className="flex items-start gap-2.5 text-sm">
          <span className="text-red-500 shrink-0 mt-0.5">⚠</span>
          <span className="text-red-400">{response.error}</span>
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
        <div className="absolute top-14 right-4 text-xs bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-gray-300 z-20 pointer-events-none animate-fade-up shadow-xl">
          Path copied
        </div>
      )}

      <div className="flex items-center border-b border-gray-800/50 px-2">
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
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={11} />
              {label}
              {countVal != null && <span className="ml-0.5 text-gray-600">({countVal})</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-1 shrink-0">
          {!hideStatusBar && (
            <div className="flex items-center gap-3 mr-2">
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
                className={`font-bold text-xs hover:underline ${statusColor(response.status)}`}
              >
                {response.status} {response.statusText}
              </a>
              <span className={`text-xs tabular-nums ${latencyColor(response.time)}`}>{response.time}ms</span>
              <span className="text-xs text-gray-500">{formatSize(response.body)}</span>
            </div>
          )}
          <button
            onClick={() => setRawMode(v => !v)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${rawMode ? 'border-indigo-500/50 text-indigo-400 bg-indigo-500/5' : 'border-gray-700 text-gray-500 hover:text-gray-200 hover:border-gray-500'}`}
          >
            Raw
          </button>
          <button
            onClick={copyBody}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
          >
            <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={downloadBody}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
          >
            <Download size={11} />Save
          </button>
        </div>
      </div>

      {activeTab === 'body' && renderBody(response.body)}

      {activeTab === 'headers' && (
        <div className="flex flex-col px-4">
          {headerEntries.length === 0 ? (
            <p className="text-gray-600 text-sm py-4">No headers</p>
          ) : (
            headerEntries.map(([key, value]) => <HeaderRow key={key} name={key} value={value} />)
          )}
        </div>
      )}

      {activeTab === 'cookies' && (
        <div className="flex flex-col gap-2 px-4 py-2">
          {cookies.length === 0 ? (
            <p className="text-gray-600 text-sm py-4">No cookies in response</p>
          ) : cookies.map((c, i) => (
            <div key={i} className="bg-gray-800/40 rounded-lg p-3 flex flex-col gap-1.5 border border-gray-800/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-indigo-300 font-semibold">{c.name}</span>
                <span className="text-xs text-gray-400 font-mono truncate">{c.value || <span className="text-gray-600 italic">empty</span>}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {c.path && <span className="text-xs text-gray-600">Path: <span className="text-gray-400 font-mono">{c.path}</span></span>}
                {c.domain && <span className="text-xs text-gray-600">Domain: <span className="text-gray-400 font-mono">{c.domain}</span></span>}
                {c.expires && <span className="text-xs text-gray-600">Expires: <span className="text-gray-400">{c.expires}</span></span>}
                {c.maxAge && <span className="text-xs text-gray-600">Max-Age: <span className="text-gray-400">{c.maxAge}s</span></span>}
                {c.sameSite && <span className="text-xs text-gray-600">SameSite: <span className="text-gray-400">{c.sameSite}</span></span>}
                {c.httpOnly && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-400">HttpOnly</span>}
                {c.secure && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/80 text-gray-400">Secure</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'timing' && (
        <div className="flex flex-col gap-4 px-4 py-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Total (server round-trip)</span>
              <span className={`text-sm font-mono font-semibold ${latencyColor(response.time)}`}>{response.time}ms</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${timingBarColor(response.time)}`}
                style={{ width: `${Math.min(100, (response.time / 3000) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-700">
              <span>0ms</span>
              <span className="text-green-700">200ms</span>
              <span className="text-yellow-700">1s</span>
              <span className="text-red-700">3s+</span>
            </div>
          </div>
          <p className="text-xs text-gray-700">Measures proxy-side fetch time. Does not include client↔server transit.</p>
        </div>
      )}
    </div>
  );
}
