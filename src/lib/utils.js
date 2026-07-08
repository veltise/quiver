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
  if (method === 'GET') return 'text-green-400';
  if (method === 'POST') return 'text-yellow-400';
  if (method === 'DELETE') return 'text-red-400';
  return 'text-blue-400';
}

export function extractGroup(url) {
  try {
    return new URL(url).hostname;
  } catch {
    const m = url.match(/^\{\{([^}]+)\}\}/);
    return m ? `{{${m[1]}}}` : 'Other';
  }
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
