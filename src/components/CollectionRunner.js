'use client';

import { useState, useRef } from 'react';
import { Play, Square, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { buildEffectiveHeaders, readStreamBody } from '@/lib/request';
import { applyEnv } from '@/lib/env';
import { methodColor } from '@/lib/utils';

function getBody(req, envVars) {
  if (!req || ['GET', 'HEAD'].includes(req.method) || !req.bodyType || req.bodyType === 'none') return undefined;
  if (req.bodyType === 'form') {
    return (req.formFields ?? []).filter((f) => f.key)
      .map((f) => `${encodeURIComponent(applyEnv(f.key, envVars))}=${encodeURIComponent(applyEnv(f.value ?? '', envVars))}`)
      .join('&');
  }
  if (req.bodyType === 'graphql') {
    let variables = {};
    try { variables = JSON.parse(req.graphqlVariables ?? '{}'); } catch {}
    return JSON.stringify({ query: applyEnv(req.graphqlQuery ?? '', envVars), variables });
  }
  return applyEnv(req.body ?? '', envVars);
}

export default function CollectionRunner({ saved, envVars, requestTimeout, onClose }) {
  const [selected, setSelected] = useState(() => new Set(saved.map((s) => s.id)));
  const [delay, setDelay] = useState(0);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  const groups = {};
  for (const s of saved) {
    const g = s.collection || 'Ungrouped';
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  }

  const toRun = saved.filter((s) => selected.has(s.id) && s.state);
  const resultMap = results ? Object.fromEntries(results.map((r) => [r.id, r])) : {};
  const passed = results?.filter((r) => r.status === 'pass').length ?? 0;
  const failed = results?.filter((r) => r.status === 'fail' || r.status === 'error').length ?? 0;
  const hasRun = results !== null;

  function toggleAll() {
    setSelected(selected.size === saved.length ? new Set() : new Set(saved.map((s) => s.id)));
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runAll() {
    if (!toRun.length) return;
    abortRef.current = false;
    setRunning(true);
    setResults(toRun.map((s) => ({ id: s.id, status: 'pending' })));

    for (let i = 0; i < toRun.length; i++) {
      if (abortRef.current) break;
      const entry = toRun[i];
      const req = entry.state;
      setResults((prev) => prev.map((r) => r.id === entry.id ? { ...r, status: 'running' } : r));
      const start = Date.now();
      let result;

      try {
        const effectiveHeaders = buildEffectiveHeaders(req).map((h) => ({
          ...h,
          key: applyEnv(h.key, envVars),
          value: applyEnv(h.value, envVars),
        }));

        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: applyEnv(req.url, envVars),
            method: req.method,
            headers: effectiveHeaders,
            timeout: requestTimeout,
            body: getBody(req, envVars),
          }),
        });

        let httpStatus, time, error;

        if (res.headers.get('content-type')?.includes('text/event-stream')) {
          httpStatus = parseInt(res.headers.get('x-proxy-status') ?? '200');
          await readStreamBody(res.body);
          time = Date.now() - start;
        } else {
          const data = await res.json();
          httpStatus = data.status;
          time = data.time ?? (Date.now() - start);
          error = data.error;
        }

        result = {
          id: entry.id,
          status: error ? 'error' : (httpStatus >= 200 && httpStatus < 300 ? 'pass' : 'fail'),
          httpStatus,
          time,
          error,
        };
      } catch (err) {
        result = { id: entry.id, status: 'error', httpStatus: null, time: Date.now() - start, error: err.message };
      }

      setResults((prev) => prev.map((r) => r.id === entry.id ? result : r));

      if (delay > 0 && i < toRun.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, delay * 1000));
      }
    }

    setRunning(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Collection Runner</h2>
            {hasRun && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-400">{passed} passed</span>
                <span className="text-gray-700">·</span>
                <span className="text-red-400">{failed} failed</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">×</button>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800">
          <button onClick={toggleAll} disabled={running} className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40">
            {selected.size === saved.length ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-xs text-gray-500">{toRun.length} selected</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-xs text-gray-500">Delay</label>
            <input
              type="number"
              min="0"
              max="60"
              value={delay}
              onChange={(e) => setDelay(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-12 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-gray-500 font-mono"
            />
            <span className="text-xs text-gray-500">s</span>
          </div>
          {running ? (
            <button onClick={() => { abortRef.current = true; }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 rounded transition-colors">
              <Square size={10} />Stop
            </button>
          ) : (
            <button
              onClick={runAll}
              disabled={!toRun.length}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
            >
              <Play size={10} />Run
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {saved.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-10">No saved requests yet</p>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="px-5 py-2 text-xs text-gray-600 uppercase tracking-wider bg-gray-900/80 sticky top-0">
                  {group}
                </div>
                {items.map((entry) => {
                  const r = resultMap[entry.id];
                  return (
                    <div key={entry.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-800/40 border-b border-gray-800/40 last:border-0">
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggle(entry.id)}
                        disabled={running}
                        className="accent-indigo-500 shrink-0"
                      />
                      <span className={`text-xs font-bold w-14 shrink-0 ${methodColor(entry.method)}`}>{entry.method}</span>
                      <span className="text-sm text-gray-300 flex-1 truncate">{entry.name}</span>
                      <div className="flex items-center gap-2 shrink-0 min-w-[120px] justify-end">
                        {!r && <span />}
                        {r?.status === 'pending' && <span className="text-xs text-gray-600">queued</span>}
                        {r?.status === 'running' && <Loader2 size={13} className="text-indigo-400 animate-spin" />}
                        {(r?.status === 'pass' || r?.status === 'fail') && (
                          <>
                            <span className={`text-xs font-mono font-bold ${r.status === 'pass' ? 'text-green-400' : 'text-red-400'}`}>{r.httpStatus}</span>
                            <span className="text-xs text-gray-600 font-mono">{r.time}ms</span>
                            {r.status === 'pass'
                              ? <CheckCircle2 size={13} className="text-green-400" />
                              : <XCircle size={13} className="text-red-400" />}
                          </>
                        )}
                        {r?.status === 'error' && (
                          <>
                            <span className="text-xs text-orange-400 truncate max-w-[140px]" title={r.error}>{r.error}</span>
                            <XCircle size={13} className="text-orange-400" />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
