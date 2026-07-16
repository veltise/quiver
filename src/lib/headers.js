// Strips CR/LF to prevent HTTP header/response-splitting injection —
// a value like "value\r\nX-Injected: evil" could otherwise smuggle in an
// extra header when passed through to fetch() or reflected back in a response.
export function stripCrlf(str) {
  return (str ?? '').replace(/[\r\n]/g, '');
}

// Converts the client-supplied headers array into a plain object suitable for
// fetch(), sanitizing keys/values and dropping empty-key entries.
export function buildHeaderMap(headers) {
  const headerMap = {};
  for (const h of headers ?? []) {
    if (h.key?.trim()) {
      const key = stripCrlf(h.key.trim());
      const value = stripCrlf(h.value ?? '');
      headerMap[key] = value;
    }
  }
  return headerMap;
}
