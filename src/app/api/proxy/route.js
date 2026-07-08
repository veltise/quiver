import { NextResponse } from 'next/server';

const MAX_TIMEOUT = 120;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

function isBlockedUrl(urlString) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return true; }

  if (!['http:', 'https:'].includes(parsed.protocol)) return true;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  const blockedHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '::ffff:127.0.0.1'];
  if (blockedHosts.includes(host)) return true;

  // Link-local / metadata (AWS, GCP, Azure)
  if (host === '169.254.169.254' || host.startsWith('169.254.')) return true;

  // Private IPv4 ranges
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [+ipv4[1], +ipv4[2]];
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  }

  return false;
}

export async function POST(req) {
  const { url, method, headers, body, timeout = 30 } = await req.json();

  if (!url?.trim()) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  if (isBlockedUrl(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  const clampedTimeout = Math.min(Math.max(1, Number(timeout) || 30), MAX_TIMEOUT);

  const headerMap = {};
  for (const h of headers ?? []) {
    if (h.key?.trim()) {
      const key = h.key.trim().replace(/[\r\n]/g, '');
      const value = (h.value ?? '').replace(/[\r\n]/g, '');
      headerMap[key] = value;
    }
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), clampedTimeout * 1000);
  const start = Date.now();

  try {
    const fetchOptions = { method: method ?? 'GET', headers: headerMap, signal: controller.signal, redirect: 'manual' };
    if (!['GET', 'HEAD'].includes(method) && body?.trim()) {
      if (Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
        return NextResponse.json({ error: `Request body too large (>${MAX_REQUEST_BODY_BYTES / 1024 / 1024} MB)` }, { status: 413 });
      }
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(tid);

    const elapsed = Date.now() - start;

    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    const contentType = response.headers.get('content-type') ?? '';
    const isTextMime = /text\/|application\/(json|xml|xhtml\+xml|x-ndjson|stream)/.test(contentType);
    const isChunked = !response.headers.has('content-length');

    // Stream SSE responses and chunked text responses (no Content-Length)
    if (contentType.includes('text/event-stream') || (isChunked && isTextMime)) {
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (e) {
            controller.error(e);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Proxy-Status': String(response.status),
          'X-Proxy-Status-Text': response.statusText,
          'X-Proxy-Time': String(elapsed),
          'X-Proxy-Headers': Buffer.from(JSON.stringify(responseHeaders)).toString('base64'),
        },
      });
    }

    // Guard against huge non-streaming responses
    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      return NextResponse.json({ error: `Response too large (>${MAX_RESPONSE_BYTES / 1024 / 1024} MB)` }, { status: 413 });
    }

    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
      return NextResponse.json({ error: `Response too large (>${MAX_RESPONSE_BYTES / 1024 / 1024} MB)` }, { status: 413 });
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: text,
      time: elapsed,
    });
  } catch (err) {
    clearTimeout(tid);
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: `Request timed out after ${clampedTimeout}s` }, { status: 408 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed' },
      { status: 500 }
    );
  }
}
