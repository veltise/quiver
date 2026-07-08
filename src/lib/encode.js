export function encodeRequest(state) {
  const { auth: _auth, ...rest } = state;
  const serialized = {
    ...rest,
    headers: state.headers.map(({ key, value }) => ({ key, value })),
  };
  return btoa(JSON.stringify(serialized))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function decodeRequest(encoded) {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice((base64.length + 3) % 4);
    const data = JSON.parse(atob(padded));
    return {
      ...data,
      bodyType: data.bodyType ?? (data.body ? 'raw' : 'none'),
      auth: { type: 'none' },
      headers: (data.headers ?? []).map((h) => ({
        ...h,
        id: Math.random().toString(36).slice(2),
      })),
    };
  } catch {
    return null;
  }
}
