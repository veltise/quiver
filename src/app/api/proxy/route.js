import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, tooManyRequests } from '@/lib/db';
import { isBlockedUrl, validateDns } from '@/lib/ssrf';
import { stripCrlf, buildHeaderMap } from '@/lib/headers';

export const maxDuration = 10;

const MAX_TIMEOUT = 10;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

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

  const headerMap = buildHeaderMap(headers);

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

    const elapsed = Date.now() - start;

    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    const contentType = response.headers.get('content-type') ?? '';
    const isTextMime = /text\/|application\/(json|xml|xhtml\+xml|x-ndjson|stream)/.test(contentType);
    const isChunked = !response.headers.has('content-length');

    // Stream SSE responses and chunked text responses (no Content-Length)
    if (contentType.includes('text/event-stream') || (isChunked && isTextMime)) {
      const stream = new ReadableStream({
        async start(streamController) {
          const reader = response.body.getReader();
          let received = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // MAX_RESPONSE_BYTES is checked against Content-Length further down,
              // but "chunked" means there is no Content-Length — so without this
              // count the cap wouldn't apply to the majority of real responses.
              received += value.byteLength;
              if (received > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                streamController.error(new Error('Response too large'));
                return;
              }
              streamController.enqueue(value);
            }
            streamController.close();
          } catch (e) {
            // Not in a finally: close() on an already-errored stream throws, and
            // the original code did exactly that on every failure path.
            streamController.error(e);
          } finally {
            // The abort timer has to outlive fetch() here — pumping the body is
            // where a slow stream actually spends its time, so clearing it as
            // soon as the headers arrived left the read loop unbounded.
            clearTimeout(tid);
          }
        },
        cancel() {
          clearTimeout(tid);
          controller.abort();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Proxy-Status': String(response.status),
          'X-Proxy-Status-Text': stripCrlf(response.statusText),
          'X-Proxy-Time': String(elapsed),
          'X-Proxy-Headers': Buffer.from(JSON.stringify(responseHeaders)).toString('base64'),
        },
      });
    }

    // Guard against huge non-streaming responses
    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      clearTimeout(tid);
      return NextResponse.json({ error: `Response too large (>${MAX_RESPONSE_BYTES / 1024 / 1024} MB)` }, { status: 413 });
    }

    // Timer stays armed across the body read — a server that dribbles out bytes
    // below the size cap would otherwise hold the function open indefinitely.
    const text = await response.text();
    clearTimeout(tid);

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
