# Database Migrations

Migrations live in `supabase/migrations/` and are the source of truth for the database schema. Run them **in order** whenever you set up a fresh Supabase project or after pulling changes that include new migration files.

## How to run

Open the [Supabase SQL editor](https://supabase.com/dashboard/project/_/sql) for your project and paste each file's contents, in filename order.

There is no automatic migration runner — each file is a plain SQL script you execute once.

## Migrations

### 001_add_collection.sql
Adds a `collection` column to the `saved_requests` table so requests can be grouped into named collections.

Run this if your `saved_requests` table already exists from an earlier version of the app. If you're setting up fresh, the base table creation should come first — check your Supabase project for the initial table or create it:

```sql
CREATE TABLE IF NOT EXISTS saved_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  url text NOT NULL,
  state jsonb,
  collection text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  method text NOT NULL,
  url text NOT NULL,
  status int,
  state jsonb,
  timestamp bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 002_live_sessions.sql
Creates the `live_sessions` table used by the Go Live feature. Sets up RLS so only non-expired sessions are readable by the anon key, and enables Realtime so viewers receive live updates via WebSocket.

### 003_live_collaborative.sql
Adds `is_collaborative` boolean to `live_sessions`. Controls whether viewers of a live session can interact with the request state or only observe.

## Fresh setup checklist

1. Create a Supabase project
2. Copy `.env.example` → `.env.local` and fill in your keys
3. Run the base table SQL above in the SQL editor
4. Run `001_add_collection.sql`
5. Run `002_live_sessions.sql`
6. Run `003_live_collaborative.sql`
7. `npm run dev`

## Notes

- All writes from the app go through server-side API routes using the **service role key**, which bypasses RLS.
- The **anon key** is only used for browser-side Realtime subscriptions (live session updates).
- Sessions and history are identified by a random `session_id` stored in `localStorage` — there is no user auth.
