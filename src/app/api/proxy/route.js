import { NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import { getClientIp, rateLimit, tooManyRequests } from '@/lib/db';

export const maxDuration = 10;

const MAX_TIMEOUT = 10;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

// Checks a single resolved IP (IPv4 or IPv6) against private/reserved ranges.
// Also unwraps IPv6-mapped IPv4 (::ffff:x.x.x.x) so those bypass the old explicit-list approach.
function isBlockedIp(ip) {
  const h = ip.toLowerCase();
  if (h === '::1' || h.startsWith('fe80:')) return true; // IPv6 loopback / link-local

  // Unwrap ::ffff:x.x.x.x so private IPv4 checks apply
  const v4mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const addr = v4mapped ? v4mapped[1] : h;

  const m = addr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    if (a === 127) return true;                         // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local / metadata
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  }
  return false;
}

function isBlockedUrl(urlString) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return true; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return true;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (['localhost', '0.0.0.0'].includes(host)) return true;
  return isBlockedIp(host);
}

const LITERAL_IP_RE = /^(\d+\.){3}\d+$/;

// Pre-resolve the hostname and reject if any returned address is private.
// Mitigates DNS rebinding: even if DNS later resolves differently, we at least
// validate the addresses the server's resolver returns before sending the request.
async function validateDns(hostname) {
  if (LITERAL_IP_RE.test(hostname) || hostname.startsWith('[')) return true; // already checked by isBlockedUrl
  try {
    const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
    const addrs = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];
    // Only block if we got addresses back AND one is private.
    // If resolution fails entirely, allow — fetch() will fail naturally.
    return addrs.length === 0 || addrs.every(a => !isBlockedIp(a));
  } catch {
    return false;
  }
}

export async function POST(req) {
  const ip = getClientIp(req);
  if (!await rateLimit(`proxy:${ip}`, { limit: 10, window: 60 })) return tooManyRequests();

  const { url, method, headers, body, timeout = 30 } = await req.json();

  if (!url?.trim()) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  if (url.length > 4096) {
    return NextResponse.json({ error: 'URL too long' }, { status: 400 });
  }

  if (isBlockedUrl(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  // DNS pre-resolution: reject if any resolved address is private (mitigates rebinding)
  if (!await validateDns(new URL(url).hostname)) {
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
          'X-Proxy-Status-Text': response.statusText.replace(/[\r\n]/g, ''),
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
