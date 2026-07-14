export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function formatSize(body) {
  const bytes = new TextEncoder().encode(body).byteLength;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function statusBadgeClass(status) {
  if (status >= 200 && status < 300) return 'bg-green-500/15 text-green-400 ring-1 ring-green-500/20';
  if (status >= 300 && status < 400) return 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/20';
  if (status >= 400 && status < 500) return 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/20';
  return 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20';
}

export function methodColor(method) {
  if (method === 'GET')    return 'text-green-400';
  if (method === 'POST')   return 'text-yellow-400';
  if (method === 'PUT')    return 'text-blue-400';
  if (method === 'PATCH')  return 'text-violet-400';
  if (method === 'DELETE') return 'text-red-400';
  return 'text-gray-400';
}

export function methodBadgeClass(method) {
  if (method === 'GET')    return 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20';
  if (method === 'POST')   return 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/20';
  if (method === 'PUT')    return 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20';
  if (method === 'PATCH')  return 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20';
  if (method === 'DELETE') return 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20';
  return 'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20';
}

export function methodBgClass(method) {
  if (method === 'GET')    return 'bg-green-500/10';
  if (method === 'POST')   return 'bg-yellow-500/10';
  if (method === 'PUT')    return 'bg-blue-500/10';
  if (method === 'PATCH')  return 'bg-violet-500/10';
  if (method === 'DELETE') return 'bg-red-500/10';
  return 'bg-gray-500/10';
}

export function methodBorderClass(method) {
  if (method === 'GET')    return 'border-l-green-500';
  if (method === 'POST')   return 'border-l-yellow-500';
  if (method === 'PUT')    return 'border-l-blue-500';
  if (method === 'PATCH')  return 'border-l-violet-500';
  if (method === 'DELETE') return 'border-l-red-500';
  return 'border-l-gray-500';
}

export function statusColor(status) {
  if (status >= 200 && status < 300) return 'text-green-400';
  if (status >= 300 && status < 400) return 'text-yellow-400';
  if (status >= 400 && status < 500) return 'text-orange-400';
  return 'text-red-400';
}

// Response latency: green < 200ms, amber 200–1000ms, red > 1000ms
export function latencyColor(ms) {
  if (ms < 200) return 'text-green-400';
  if (ms <= 1000) return 'text-yellow-400';
  return 'text-red-400';
}

export function extractGroup(url) {
  try {
    return new URL(url).hostname;
  } catch {
    const m = url.match(/^\{\{([^}]+)\}\}/);
    return m ? `{{${m[1]}}}` : 'Other';
  }
}

export function isJsonInvalid(bodyType, body) {
  if (bodyType !== 'json' || !body?.trim()) return false;
  try { JSON.parse(body); return false; } catch { return true; }
}

export function scoreAndFilterSaved(saved, query) {
  if (!query) return [];
  return saved.map((s) => {
    const nameM = fuzzyScore(s.name, query);
    const urlM = fuzzyScore(s.url, query);
    const methodM = fuzzyScore(s.method, query);
    return {
      ...s,
      matched: nameM.matched || urlM.matched || methodM.matched,
      score: Math.max(nameM.score * 2, urlM.score, methodM.score * 3),
      nameIndices: nameM.indices,
      urlIndices: urlM.indices,
    };
  }).filter((s) => s.matched).sort((a, b) => b.score - a.score);
}

export function fuzzyScore(text, query) {
  if (!query) return { matched: true, score: 0, indices: [] };
  const tl = text.toLowerCase();
  const ql = query.toLowerCase();
  const indices = [];
  let ti = 0, qi = 0, score = 0, run = 0;
  while (ti < tl.length && qi < ql.length) {
    if (tl[ti] === ql[qi]) { indices.push(ti); run++; score += run; qi++; }
    else run = 0;
    ti++;
  }
  return qi === ql.length
    ? { matched: true, score, indices }
    : { matched: false, score: -1, indices: [] };
}
