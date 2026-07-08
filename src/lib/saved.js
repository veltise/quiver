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

export function suggestName(method, url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return `${method} ${host}`;
  } catch {
    return '';
  }
}
