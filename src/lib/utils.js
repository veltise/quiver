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
  if (status >= 200 && status < 300) return 'bg-success/15 text-success ring-1 ring-success/20';
  if (status >= 300 && status < 400) return 'bg-warning/15 text-warning ring-1 ring-warning/20';
  if (status >= 400 && status < 500) return 'bg-warning/15 text-warning ring-1 ring-warning/20';
  return 'bg-error/15 text-error ring-1 ring-error/20';
}

export function methodColor(method) {
  if (method === 'GET')    return 'text-success';
  if (method === 'DELETE') return 'text-error';
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') return 'text-accent';
  return 'text-muted';
}

export function methodBadgeClass(method) {
  if (method === 'GET')    return 'bg-success/10 text-success ring-1 ring-success/20';
  if (method === 'DELETE') return 'bg-error/10 text-error ring-1 ring-error/20';
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') return 'bg-accent/10 text-accent ring-1 ring-accent/20';
  return 'bg-[rgba(242,237,228,.06)] text-muted ring-1 ring-border';
}

export function methodBgClass(method) {
  if (method === 'GET')    return 'bg-success/10';
  if (method === 'DELETE') return 'bg-error/10';
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') return 'bg-accent/10';
  return 'bg-[rgba(242,237,228,.06)]';
}

export function methodBorderClass(method) {
  if (method === 'GET')    return 'border-l-success';
  if (method === 'DELETE') return 'border-l-error';
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') return 'border-l-accent';
  return 'border-l-border-strong';
}

export function statusColor(status) {
  if (status >= 200 && status < 300) return 'text-success';
  if (status >= 300 && status < 400) return 'text-warning';
  if (status >= 400 && status < 500) return 'text-warning';
  return 'text-error';
}

// Response latency: green < 200ms, amber 200–1000ms, red > 1000ms
export function latencyColor(ms) {
  if (ms < 200) return 'text-success';
  if (ms <= 1000) return 'text-warning';
  return 'text-error';
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
