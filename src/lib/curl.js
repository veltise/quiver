function uid() {
  return Math.random().toString(36).slice(2);
}

function tokenize(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === ' ' || str[i] === '\t') { i++; continue; }
    if (str[i] === "'") {
      let j = i + 1;
      while (j < str.length && str[j] !== "'") j++;
      tokens.push(str.slice(i + 1, j));
      i = j + 1;
    } else if (str[i] === '"') {
      let j = i + 1;
      while (j < str.length) {
        if (str[j] === '\\') j += 2;
        else if (str[j] === '"') break;
        else j++;
      }
      tokens.push(str.slice(i + 1, j).replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      i = j + 1;
    } else {
      let j = i;
      while (j < str.length && str[j] !== ' ' && str[j] !== '\t') j++;
      tokens.push(str.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function parseFormBody(body) {
  return body.split('&').filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=');
    return {
      id: uid(),
      key: decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq)),
      value: decodeURIComponent(eq === -1 ? '' : pair.slice(eq + 1)),
    };
  });
}

// Flags that consume the next token as their value
const FLAGS_WITH_ARGS = new Set([
  '-o', '--output', '-m', '--max-time', '--connect-timeout',
  '-x', '--proxy', '-b', '--cookie', '-c', '--cookie-jar',
  '--cert', '--key', '--cacert', '--capath',
  '-F', '--form', '-T', '--upload-file',
  '-e', '--referer', '-w', '--write-out',
  '--interface', '--resolve', '--retry',
]);

export function parseCurl(input) {
  const normalized = input.replace(/\\\r?\n\s*/g, ' ').trim();
  const tokens = tokenize(normalized);

  if (!tokens.length || tokens[0].toLowerCase() !== 'curl') return null;

  let method = null;
  let url = '';
  const headers = [];
  let body = '';
  let formFields = [];

  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];

    if (t === '-X' || t === '--request') {
      method = tokens[++i] ?? 'GET';
    } else if (t === '-H' || t === '--header') {
      const h = tokens[++i] ?? '';
      const sep = h.indexOf(':');
      if (sep !== -1) {
        headers.push({ id: uid(), key: h.slice(0, sep).trim(), value: h.slice(sep + 1).trim() });
      }
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
      body = tokens[++i] ?? '';
    } else if (t === '--json') {
      body = tokens[++i] ?? '';
      headers.push({ id: uid(), key: 'Content-Type', value: 'application/json' });
      headers.push({ id: uid(), key: 'Accept', value: 'application/json' });
    } else if (t === '--data-urlencode') {
      const val = tokens[++i] ?? '';
      const eq = val.indexOf('=');
      formFields.push({ id: uid(), key: eq === -1 ? val : val.slice(0, eq), value: eq === -1 ? '' : val.slice(eq + 1) });
    } else if (t === '-u' || t === '--user') {
      const creds = tokens[++i] ?? '';
      headers.push({ id: uid(), key: 'Authorization', value: `Basic ${btoa(creds)}` });
    } else if (t === '-A' || t === '--user-agent') {
      headers.push({ id: uid(), key: 'User-Agent', value: tokens[++i] ?? '' });
    } else if (FLAGS_WITH_ARGS.has(t)) {
      i++; // consume the arg value but ignore it
    } else if (!t.startsWith('-')) {
      if (!url) url = t;
    }
    i++;
  }

  if (!method) method = (body || formFields.length) ? 'POST' : 'GET';

  let bodyType = 'none';
  if (formFields.length) {
    bodyType = 'form';
    body = '';
  } else if (body) {
    const ct = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
    if (ct.includes('application/x-www-form-urlencoded')) {
      bodyType = 'form';
      formFields = parseFormBody(body);
      body = '';
    } else {
      try { JSON.parse(body); bodyType = 'json'; } catch { bodyType = 'raw'; }
    }
  }

  return { method, url, headers, bodyType, body, formFields, auth: { type: 'none' } };
}

