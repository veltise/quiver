-- Quiver — current database schema, as a single reference file.
--
-- This is NOT a migration and should not be run — the tables already exist.
-- It's a snapshot of "what does the schema look like right now," maintained
-- by hand alongside the numbered migrations in this folder, so understanding
-- the current state doesn't require mentally replaying every migration in order.
--
-- The numbered migrations/*.sql files remain the source of truth for HOW the
-- schema got here (including fixes to earlier mistakes) and are never edited
-- or deleted after being applied. This file is regenerated/updated by hand
-- whenever the schema changes, to stay an accurate "current state" reference.
--
-- saved_requests and history predate this repo's migration history — they were
-- created directly in the Supabase dashboard, which is why there's no CREATE
-- TABLE for them in migrations/. Column types below are inferred from how the
-- app actually uses them; verify against the dashboard if precision matters.

-- ── saved_requests ──────────────────────────────────────────────────────────
-- id, session_id, name, slug, created_at inferred (no tracked CREATE TABLE)
-- state:      client-encrypted (AES-GCM) JSON blob for private saves, plaintext
--             (auth-stripped) for public shares — POST /api/saved rejects
--             non-encrypted state, so a private row can never hold plaintext.
-- url/method: intentionally NOT columns — dropped in 006, live only inside `state`
-- collection: added in 001
-- is_public:  added in 008 — true only for rows from POST /api/share. /p/[slug]
--             and /api/p/[slug] both require this, so a private row is never
--             servable by slug regardless of what's in `state`.
create table if not exists saved_requests (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  name        text not null,
  slug        text not null unique,
  state       jsonb,
  collection  text not null default '',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table saved_requests enable row level security;
drop policy if exists "deny anon" on saved_requests;
create policy "deny anon" on saved_requests for all to anon using (false) with check (false);
-- All app access goes through the service-role client (src/lib/supabase.js),
-- which bypasses RLS — this policy only blocks direct anon-key REST access.

-- ── history ──────────────────────────────────────────────────────────────
-- timestamp: epoch-ms integer sent from the client (Date.now()) — verify
-- column type in the dashboard if this ever needs precise handling.
create table if not exists history (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,
  status      integer,
  "timestamp" bigint,
  state       jsonb
);

alter table history enable row level security;
drop policy if exists "deny anon" on history;
create policy "deny anon" on history for all to anon using (false) with check (false);

-- ── live_sessions ────────────────────────────────────────────────────────
-- id is the short (8-char) shareable session code, not a uuid.
create table if not exists live_sessions (
  id                text primary key,
  host_token        text not null,
  state             jsonb,
  response          jsonb,
  include_auth      boolean not null default false,
  host_connected    boolean not null default true,
  is_collaborative  boolean not null default true,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '24 hours')
);

alter table live_sessions enable row level security;

-- anon needs SELECT for Supabase Realtime (postgres_changes) to work —
-- the one table where anon access is intentional, not a mistake.
drop policy if exists "anon_read_live_sessions" on live_sessions;
create policy "anon_read_live_sessions"
  on live_sessions for select
  to anon
  using (expires_at > now());

alter publication supabase_realtime add table live_sessions;

-- ── rate_limits ──────────────────────────────────────────────────────────
create table if not exists rate_limits (
  ip           text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

alter table rate_limits enable row level security;
drop policy if exists "deny anon" on rate_limits;
create policy "deny anon" on rate_limits for all to anon using (false) with check (false);

-- Atomically increments the counter for an IP (already hashed client-side —
-- see src/lib/db.js getClientIp) within a sliding window.
create or replace function rate_limit_increment(p_ip text, p_window_seconds int)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into rate_limits (ip, count, window_start)
  values (p_ip, 1, now())
  on conflict (ip) do update
  set
    count = case
      when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then 1
        else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then now()
        else rate_limits.window_start
    end
  returning count into v_count;

  return v_count;
end;
$$;
