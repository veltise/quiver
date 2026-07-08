function pythonRepr(value, depth = 0) {
  const pad = '    '.repeat(depth);
  const inner = '    '.repeat(depth + 1);
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => `${inner}${pythonRepr(v, depth + 1)}`).join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${pythonRepr(v, depth + 1)}`).join(',\n')}\n${pad}}`;
}

export function buildBody(req) {
  if (!req || ['GET', 'HEAD'].includes(req.method)) return null;
  const { bodyType, body, formFields, graphqlQuery, graphqlVariables } = req;
  if (!bodyType || bodyType === 'none') return null;
  if (bodyType === 'form') {
    const encoded = (formFields ?? []).filter((f) => f.key)
      .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value ?? '')}`)
      .join('&');
    return encoded || null;
  }
  if (bodyType === 'graphql') {
    let variables = {};
    try { variables = JSON.parse(graphqlVariables ?? '{}'); } catch {}
    return JSON.stringify({ query: graphqlQuery ?? '', variables });
  }
  return body?.trim() ? body : null;
}

export function generateFetch(req) {
  const method = req.method ?? 'GET';
  const url = req.url ?? '';
  const hdrs = buildEffectiveHeaders(req).filter((h) => h.key?.trim());
  const body = buildBody(req);
  const optParts = [];

  if (method !== 'GET' && method !== 'HEAD') optParts.push(`  method: "${method}"`);
  if (hdrs.length) {
    const hLines = hdrs.map((h) => `    ${JSON.stringify(h.key)}: ${JSON.stringify(h.value ?? '')}`);
    optParts.push(`  headers: {\n${hLines.join(',\n')}\n  }`);
  }
  if (body) optParts.push(`  body: ${JSON.stringify(body)}`);

  const init = optParts.length ? `, {\n${optParts.join(',\n')}\n}` : '';
  return `const response = await fetch(${JSON.stringify(url)}${init});\nconst data = await response.json();\nconsole.log(data);`;
}

export function generateAxios(req) {
  const method = req.method?.toLowerCase() ?? 'get';
  const url = req.url ?? '';
  const hdrs = buildEffectiveHeaders(req).filter((h) => h.key?.trim());
  const body = buildBody(req);
  const bodyType = req.bodyType;

  const cfgParts = [];
  if (hdrs.length) {
    const hLines = hdrs.map((h) => `    ${JSON.stringify(h.key)}: ${JSON.stringify(h.value ?? '')}`);
    cfgParts.push(`  headers: {\n${hLines.join(',\n')}\n  }`);
  }
  const cfg = cfgParts.length ? `, {\n${cfgParts.join(',\n')}\n}` : '';

  if (body && ['post', 'put', 'patch'].includes(method)) {
    if (bodyType === 'form') {
      return `const params = new URLSearchParams(${JSON.stringify(body)});\nconst response = await axios.${method}(${JSON.stringify(url)}, params${cfg});\nconsole.log(response.data);`;
    }
    if (bodyType === 'json') {
      try {
        const parsed = JSON.parse(body);
        return `const payload = ${JSON.stringify(parsed, null, 2)};\nconst response = await axios.${method}(${JSON.stringify(url)}, payload${cfg});\nconsole.log(response.data);`;
      } catch {}
    }
    return `const response = await axios.${method}(${JSON.stringify(url)}, ${JSON.stringify(body)}${cfg});\nconsole.log(response.data);`;
  }
  return `const response = await axios.${method}(${JSON.stringify(url)}${cfg});\nconsole.log(response.data);`;
}

export function generatePython(req) {
  const method = req.method ?? 'GET';
  const url = req.url ?? '';
  const hdrs = buildEffectiveHeaders(req).filter((h) => h.key?.trim());
  const body = buildBody(req);
  const bodyType = req.bodyType;

  const lines = ['import requests', ''];
  const callArgs = [JSON.stringify(url)];

  if (hdrs.length) {
    lines.push(`headers = ${pythonRepr(Object.fromEntries(hdrs.map((h) => [h.key, h.value])))}`, '');
    callArgs.push('headers=headers');
  }

  if (body) {
    if (bodyType === 'json') {
      try {
        lines.push(`payload = ${pythonRepr(JSON.parse(body))}`, '');
        callArgs.push('json=payload');
      } catch {
        lines.push(`data = ${JSON.stringify(body)}`, '');
        callArgs.push('data=data');
      }
    } else if (bodyType === 'form') {
      const fields = (req.formFields ?? []).filter((f) => f.key);
      const dictRepr = pythonRepr(Object.fromEntries(fields.map((f) => [f.key, f.value ?? ''])));
      lines.push(`data = ${dictRepr}`, '');
      callArgs.push('data=data');
    } else {
      lines.push(`data = ${JSON.stringify(body)}`, '');
      callArgs.push('data=data');
    }
  }

  lines.push(`response = requests.${method.toLowerCase()}(${callArgs.join(', ')})`);
  lines.push('print(response.json())');
  return lines.join('\n');
}

export function buildEffectiveHeaders(req) {
  const headers = [...(req.headers ?? [])];
  if (req.bodyType === 'json' || req.bodyType === 'form' || req.bodyType === 'graphql') {
    const hasContentType = headers.some((h) => h.key.trim().toLowerCase() === 'content-type');
    if (!hasContentType) {
      const ct = req.bodyType === 'form' ? 'application/x-www-form-urlencoded' : 'application/json';
      headers.push({ id: '__ct', key: 'Content-Type', value: ct });
    }
  }
  const auth = req.auth ?? {};
  if (auth.type === 'bearer' && auth.token) {
    headers.push({ id: '__auth', key: 'Authorization', value: `Bearer ${auth.token}` });
  } else if (auth.type === 'basic') {
    const encoded = btoa(`${auth.username ?? ''}:${auth.password ?? ''}`);
    headers.push({ id: '__auth', key: 'Authorization', value: `Basic ${encoded}` });
  } else if (auth.type === 'apikey' && auth.key) {
    headers.push({ id: '__auth', key: auth.key, value: auth.value ?? '' });
  }
  return headers;
}

export function generateCurl(req) {
  const { method = 'GET', url, bodyType, body, formFields = [] } = req;
  const effectiveHeaders = buildEffectiveHeaders(req);
  const parts = [`curl -X ${method}`];

  for (const h of effectiveHeaders) {
    if (h.key?.trim()) {
      const k = h.key.trim().replace(/'/g, "'\\''");
      const v = (h.value ?? '').replace(/'/g, "'\\''");
      parts.push(`  -H '${k}: ${v}'`);
    }
  }

  if (!['GET', 'HEAD'].includes(method)) {
    if ((bodyType === 'json' || bodyType === 'raw') && body?.trim()) {
      parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
    } else if (bodyType === 'form' && formFields.length) {
      const encoded = formFields
        .filter((f) => f.key)
        .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value ?? '')}`)
        .join('&');
      parts.push(`  -d '${encoded}'`);
    } else if (bodyType === 'graphql') {
      let variables = {};
      try { variables = JSON.parse(req.graphqlVariables ?? '{}'); } catch {}
      const gqlBody = JSON.stringify({ query: req.graphqlQuery ?? '', variables });
      parts.push(`  -d '${gqlBody.replace(/'/g, "'\\''")}'`);
    }
  }

  parts.push(`  '${(url ?? '').replace(/'/g, "'\\''")}'`);
  return parts.join(' \\\n');
}
