import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-side client — uses service role key, bypasses RLS.
// Only import this in API routes (never in 'use client' files).
export function createServerClient() {
  return createClient(url, serviceRole);
}

// Browser-safe client — uses anon key, subject to RLS.
export function createBrowserClient() {
  return createClient(url, anon);
}
