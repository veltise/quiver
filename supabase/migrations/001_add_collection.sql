-- Run this in the Supabase SQL editor
ALTER TABLE saved_requests
  ADD COLUMN IF NOT EXISTS collection text NOT NULL DEFAULT '';
