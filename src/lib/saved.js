const SAVED_KEY = 'api-playground-saved';

export function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function persistSaved(items) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(items));
  } catch {}
}

export function nameToSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Labels that are part of a two-part public suffix rather than the name itself,
// so `example.co.uk` suggests "example" and not "example.co".
const SECOND_LEVEL_SUFFIXES = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);

function isIpHost(host) {
  // `new URL().hostname` gives IPv6 in brackets, IPv4 as plain dotted quad
  return host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

// `jsonplaceholder.typicode.com` → `jsonplaceholder.typicode`. Hosts with no TLD
// to strip (`localhost`, bare IPs) are returned untouched.
export function stripTld(host) {
  if (isIpHost(host)) return host;
  const labels = host.split('.');
  if (labels.length < 2) return host;
  labels.pop();
  if (labels.length >= 2 && SECOND_LEVEL_SUFFIXES.has(labels[labels.length - 1])) labels.pop();
  return labels.join('.');
}

// The method is deliberately left out — the sidebar and tab strip already render
// it in its own colour-coded column, so repeating it in the name is noise.
export function suggestName(url) {
  try {
    return stripTld(new URL(url).hostname.replace(/^www\./, ''));
  } catch {
    return '';
  }
}
