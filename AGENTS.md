<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Quiver — load-bearing invariants

These aren't obvious from reading the code casually, and breaking one tends to silently reopen a bug that was already found and fixed. Check this list before touching auth, encryption, or live sessions.

## Encryption is per-browser, not per-session
`src/lib/crypto.js` generates an AES-GCM key once per browser and stores it in that browser's `localStorage`. It is **not** tied to any session ID. A different browser/device can never decrypt another browser's encrypted state — this is intentional, not a bug. Don't build a feature that assumes cross-device decryption will work.

## `saved_requests` mixes two trust domains in one table
- Rows from `POST /api/saved` (private "Save to workspace") are always client-encrypted before they're sent.
- Rows from `POST /api/share` are always plaintext, with `auth` and `Authorization` headers stripped server-side before storage — they're meant to be public.
- `/p/[slug]` (`src/app/p/[id]/page.js`) serves **any** `saved_requests` row by slug, with no session-ownership check at all. The only thing keeping private rows private is that every current call site remembers to encrypt first — nothing server-side enforces it.

**If you add a new way to write to `saved_requests`, it must either encrypt the state client-side first, or be fine with that row becoming publicly readable by slug.** There is no in-between.

## `saved_requests`/`history` have no plaintext `url`/`method` columns — don't re-add them
They were dropped in migration `006_drop_plaintext_url_method.sql` because they duplicated data already inside the encrypted `state` blob, and a URL's query string can carry a real credential (presigned S3 URLs, `?api_key=...` APIs) — that was readable in plaintext even though headers/auth/body were already encrypted. `method`/`url` are derived client-side from the *decrypted* `state` after fetch (see the loaders in `Playground.js` and `LiveSession.js`), not from a DB column. There is **no server-side search** on these tables (`GET` routes just `.select('*')`) — all search/sort/group in `Sidebar.js` runs against the already-decrypted in-memory array, so there's no performance reason to bring a plaintext column back.

`name`, `slug`, and `collection` remain plaintext by design — `slug` structurally has to be, since `/p/[slug]` does a server-side lookup with no browser context to decrypt anything. Note `slug` is derived from `name`, which defaults to `"{method} {hostname}"` — so the hostname is usually visible via `slug` anyway even though `url` isn't. Encrypting `name`/`collection` too was considered and deliberately skipped: `slug`'s unavoidable plaintext leak already exposes the same hostname in the common case, so the marginal privacy gain didn't justify the added complexity.

## Live sessions: the host token is the only real authorization boundary
`src/app/api/live/[id]/route.js` `PATCH`:
- `host_connected` writes and **all** writes when `is_collaborative === false` (Demo mode) require a matching `x-host-token` header, checked against `live_sessions.host_token`.
- In Collaborative mode, `state`/`response` writes are intentionally open to any participant with the link — that's the feature, not a hole.
- Client-side `isHost` (derived from `localStorage.getItem('live-host-' + sessionId)`) is **cosmetic only**. Never trust it for authorization — always re-check server-side. (A prior fix here forgot to have the client actually *send* `x-host-token` on writes, which silently broke Demo-mode host syncing — the client sending the header and the server checking it both have to be correct together.)

## `include_auth` must be enforced on every write, not just at session creation
If a live session was started with "Share auth tokens" off, the `PATCH` handler strips `auth`/`Authorization` from `state` on **every** write, regardless of how that write was triggered (typed, pasted, loaded from a saved request, curl import). This used to only happen once at creation time in the client (`GoLiveModal.js`), which meant a later edit could silently leak a real token to every guest. Don't move this check back to being client-side-only or creation-time-only.

## IP addresses are hashed before use, and rate limiting fails closed
`src/lib/db.js` `getClientIp()` returns `SHA256(IP_HASH_SALT + raw IP)`, never the raw address — don't log or store the raw IP anywhere. `rateLimit()` returns `false` (deny) if the Supabase RPC errors — don't change this back to fail-open.

## SSRF and header-injection checks live in `src/lib/`, not the route — don't simplify them away
`src/lib/ssrf.js` (`isBlockedIp`/`isBlockedUrl`/`validateDns`) blocks private/loopback/link-local IPs including `::ffff:`-mapped IPv4, and pre-resolves DNS to catch rebinding before `fetch()` runs — pulled out of `proxy/route.js` specifically so it's unit-testable (`src/lib/ssrf.test.js`). If you touch `isBlockedIp` or `validateDns`, keep both the IPv4-mapped-IPv6 unwrapping and the DNS pre-resolution — each closes a distinct bypass. `src/lib/headers.js` strips `\r\n` from header keys/values and the proxied `statusText` before they reach `fetch()` — skipping this reopens HTTP header injection.

## Every DELETE/PATCH on `saved_requests` or `history` must filter on `session_id`, not just `id`
e.g. `.eq('id', id).eq('session_id', sessionId)` — both conditions, always together, in every route under `saved/`, `history/`, and `share/`. Dropping the `session_id` half would let any session modify or delete another session's rows just by guessing/enumerating IDs. This is the app-layer half of a defense-in-depth pairing with RLS below — neither one is a substitute for the other. Every mutating endpoint should also rate-limit; `history/[id]/route.js`'s `DELETE` was missing this for a while, and the tell was that its test file was the only one that didn't need a `rateLimit` mock.

## There's a real test suite — extend it, don't route around it
`npm test` (Vitest). Tests live next to the code they cover (`src/lib/*.test.js`, and `route.test.js` beside each API route). The two live-session bugs described above — the host token not being sent, and `include_auth` only being enforced at creation — are both encoded as regression tests in `src/app/api/live/[id]/route.test.js`. Route tests mock `@/lib/supabase` and use `vi.mock('@/lib/db', async (importOriginal) => ({ ...await importOriginal(), rateLimit: ... }))` to keep real validation logic (`isValidSessionId`, etc.) while only overriding what needs controlling — don't hand-roll a looser reimplementation of validation in a mock, it can silently drift from what the app actually enforces.

## Every Supabase table needs RLS — "the API routes already check this" is not a substitute
`src/lib/supabase.js` has two clients: `createServerClient()` (service role, bypasses RLS, used by all Next.js API routes) and `createBrowserClient()` (anon key, subject to RLS). The anon key is a `NEXT_PUBLIC_*` var — it's compiled into the shipped JS bundle and trivially visible to anyone. Supabase auto-generates a REST API for every table, reachable directly with that key, completely independent of this app's Next.js routes. A table without RLS is fully readable/writable via that direct path no matter how careful the Next.js route handlers are — `session_id` scoping, validation, and rate limiting in the API routes only protect the path that goes through them, not the one that doesn't. `saved_requests` and `history` had no RLS until `007_lock_down_rls.sql`; if you add a new table, enable RLS on it immediately, even if (especially if) you think only server-side code will ever touch it — it costs nothing, since the service-role client bypasses RLS regardless of whether it's enabled.
