# Quiver

A fast, shareable HTTP client. Build requests, save them to your quiver, fire at any endpoint.

Built with Next.js, Supabase, and Tailwind CSS.

## Features

- Request builder with params, headers, auth, and body editors (JSON, form, GraphQL, raw)
- Collections and history, saved per anonymous session — no account required
- Live collaborative sessions: share a link, edit a request together in real time, or run it in read-only demo mode
- One-click sharing via short public links
- cURL import/export, code generation (fetch, axios, Python `requests`)
- A server-side proxy so requests aren't blocked by browser CORS

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router) — pages, API routes
- [Supabase](https://supabase.com) — Postgres (saved requests, history, live sessions, rate limiting) + Realtime (live collaboration)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Vitest](https://vitest.dev) — unit tests

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is fine)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

In the Supabase SQL editor, run every file in `supabase/migrations/` **in numeric order** (`001_...` through the highest-numbered file). Each one is a discrete, already-applied change — run them all, even the ones that look like they're just fixing an earlier migration; that's expected.

`supabase/schema.sql` is a hand-maintained snapshot of what the schema looks like once every migration has run — read it if you want the current picture without replaying the whole history. **It is a reference, not something to run.**

### 3. Configure environment variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
IP_HASH_SALT=a-long-random-string
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API in your Supabase dashboard. These are safe to expose to the browser **only because RLS is enabled on every table** (see `supabase/schema.sql`) — don't disable RLS on a table without understanding that tradeoff.
- `SUPABASE_SERVICE_ROLE_KEY` — same page, the secret key. Server-side only; never expose this to the client.
- `IP_HASH_SALT` — any random string, used to hash client IPs before they're used as rate-limit keys (raw IPs are never stored). Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
npm test          # run once
npm run test:watch # watch mode
```

Tests live alongside the code they cover (`*.test.js`). The SSRF-protection logic in `src/lib/ssrf.js` is the most security-sensitive part of the app and the best-covered — see `src/lib/ssrf.test.js`.

## Deploying

Deployed on [Vercel](https://vercel.com). Import the repo, add the four environment variables above under Project Settings → Environment Variables (for Production and Preview), and deploy — no build configuration changes needed.

## Project structure

```
src/
  app/
    api/          # Next.js API routes (proxy, saved, history, live sessions, share)
    live/[id]/    # live collaborative session page
    p/[id]/       # public shared-request page
  components/      # React components
  lib/             # shared logic — encryption, SSRF protection, rate limiting, etc.
supabase/
  migrations/      # historical, append-only — never edit an already-applied file
  schema.sql       # current-state reference (not runnable)
```

See `AGENTS.md` for the load-bearing implementation details (encryption model, RLS, live-session auth) that aren't obvious from reading the code alone.

## License

[MIT](./LICENSE)
