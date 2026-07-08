'use client';

import { useState, useEffect, useRef } from 'react';
import { Copy, Download } from 'lucide-react';
import { formatSize } from '@/lib/utils';

function statusColor(status) {
  if (status >= 200 && status < 300) return 'text-green-400';
  if (status >= 300 && status < 400) return 'text-yellow-400';
  if (status >= 400 && status < 500) return 'text-orange-400';
  return 'text-red-400';
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
        title={name}
        className="w-48 shrink-0 text-gray-500 hover:text-indigo-400 transition-colors truncate"
      >
        {name}
      </a>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-gray-200 break-all flex-1">{value}</span>
          {prettyJson && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors shrink-0 mt-0.5"
            >
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

function highlightJson(json) {
  const safe = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return safe.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\],])/g,
    (match) => {
      if (/^[{}\[\],]$/.test(match)) return `<span class="text-gray-500">${match}</span>`;
      if (/^"/.test(match))
        return /:$/.test(match)
          ? `<span class="text-indigo-300">${match}</span>`
          : `<span class="text-green-300" data-v>${match}</span>`;
      if (/true|false/.test(match)) return `<span class="text-yellow-300" data-v>${match}</span>`;
      if (/null/.test(match)) return `<span class="text-gray-400">${match}</span>`;
      return `<span class="text-orange-300" data-v>${match}</span>`;
    }
  );
}

function guessVarName(valueSpan) {
  let node = valueSpan.previousSibling;
  while (node) {
    if (node.nodeType === 3) {
      if (!node.textContent.trim()) { node = node.previousSibling; continue; }
      break;
    }
    if (node.nodeType === 1 && node.classList.contains('text-indigo-300')) {
      return node.textContent.replace(/["':]/g, '').trim();
    }
    break;
  }
  return '';
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
      <div
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 w-56"
        style={{ left, top }}
      >
        <p className="text-xs text-gray-400 mb-2">Save as environment variable</p>
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 mb-2">
          <span className="text-gray-600 text-xs select-none">{'{{'}</span>
          <input
            autoFocus
            className="flex-1 bg-transparent text-xs focus:outline-none text-gray-200 min-w-0"
            placeholder="variable_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onSave(name.trim(), value); } }}
          />
          <span className="text-gray-600 text-xs select-none">{'}}'}</span>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1">
            Cancel
          </button>
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

export default function ResponsePanel({ response, isLoading, onExtract, hideStatusBar }) {
  const [activeTab, setActiveTab] = useState('body');
  const [copied, setCopied] = useState(false);
  const [extracting, setExtracting] = useState(null);
  const [rawMode, setRawMode] = useState(false);
  const streamPreRef = useRef(null);

  // Auto-scroll SSE pre block as chunks arrive
  useEffect(() => {
    if (response?.streaming && streamPreRef.current) {
      streamPreRef.current.scrollTop = streamPreRef.current.scrollHeight;
    }
  }, [response?.body, response?.streaming]);

  function handleBodyClick(e) {
    const span = e.target.closest('[data-v]');
    if (!span) return;
    let value = span.textContent;
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    setExtracting({ value, suggestedName: guessVarName(span), position: { x: e.clientX, y: e.clientY } });
  }

  function handleExtractSave(name, value) {
    onExtract?.(name, value);
    setExtracting(null);
  }

  function renderBody(body) {
    if (rawMode || response?.streaming) {
      return (
        <pre
          ref={response?.streaming ? streamPreRef : null}
          className="bg-gray-800 rounded p-4 text-sm overflow-x-auto text-gray-300 whitespace-pre-wrap break-words leading-relaxed font-mono"
        >
          {body || '(empty response)'}
        </pre>
      );
    }
    try {
      const pretty = JSON.stringify(JSON.parse(body), null, 2);
      return (
        <pre
          className="bg-gray-800 rounded p-4 text-sm overflow-x-auto whitespace-pre-wrap break-words leading-relaxed font-mono"
          dangerouslySetInnerHTML={{ __html: highlightJson(pretty) }}
          onClick={handleBodyClick}
        />
      );
    } catch {
      return (
        <pre className="bg-gray-800 rounded p-4 text-sm overflow-x-auto text-gray-200 whitespace-pre-wrap break-words leading-relaxed font-mono">
          {body || '(empty response)'}
        </pre>
      );
    }
  }

  function copyBody() {
    navigator.clipboard.writeText(response.body).then(() => {
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
    return <div className="flex items-center justify-center py-6 text-gray-500 text-sm">Sending request…</div>;
  }

  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-40 gap-1.5 select-none pointer-events-none">
        <p className="font-mono text-gray-800 tracking-widest text-sm">· · ·</p>
        <p className="text-xs text-gray-700">awaiting response</p>
      </div>
    );
  }

  if (response.error) {
    return <p className="text-red-400 text-sm p-1">{response.error}</p>;
  }

  const headerEntries = Object.entries(response.headers ?? {});

  return (
    <div className="flex flex-col gap-3">
      {extracting && (
        <ExtractPopup
          value={extracting.value}
          suggestedName={extracting.suggestedName}
          position={extracting.position}
          onSave={handleExtractSave}
          onClose={() => setExtracting(null)}
        />
      )}
      <div className="flex items-center justify-between text-sm">
        {!hideStatusBar && (
          <div className="flex items-center gap-4">
            {response.streaming && (
              <div className="flex items-center gap-1.5 text-xs text-indigo-400">
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
              className={`font-bold hover:underline ${statusColor(response.status)}`}
            >
              {response.status} {response.statusText}
            </a>
            <span className="text-gray-500">{response.time}ms</span>
            <span className="text-gray-500">{formatSize(response.body)}</span>
          </div>
        )}
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={() => setRawMode((v) => !v)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${rawMode ? 'border-indigo-500/50 text-indigo-400' : 'border-gray-700 text-gray-500 hover:text-gray-200 hover:border-gray-500'}`}
          >
            Raw
          </button>
          <button
            onClick={copyBody}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
          >
            <Copy size={11} />{copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={downloadBody}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
          >
            <Download size={11} />Download
          </button>
        </div>
      </div>
      <div className="flex items-center gap-0.5 border-b border-gray-800/50">
        <button
          onClick={() => setActiveTab('body')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${activeTab === 'body' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-400'}`}
        >
          Body
        </button>
        <button
          onClick={() => setActiveTab('headers')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${activeTab === 'headers' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-400'}`}
        >
          Headers
          {headerEntries.length > 0 && <span className="ml-1 text-gray-500">({headerEntries.length})</span>}
        </button>
      </div>
      {activeTab === 'body' ? renderBody(response.body) : (
        <div className="flex flex-col">
          {headerEntries.length === 0 ? (
            <p className="text-gray-600 text-sm">No headers</p>
          ) : (
            headerEntries.map(([key, value]) => (
              <HeaderRow key={key} name={key} value={value} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
