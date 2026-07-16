-- Run this in the Supabase SQL editor
-- url/method were duplicated as plaintext columns alongside the client-encrypted
-- `state` blob, purely so the sidebar could search/sort/group without decrypting.
-- That duplication was unnecessary — the app already decrypts every row into
-- memory on load before any search/sort/group runs — and it meant a secret
-- embedded in a URL's query string (presigned URLs, ?api_key=... APIs) was
-- readable in plain text even though headers/auth/body were already encrypted.
-- url/method now live only inside the encrypted `state` blob.
ALTER TABLE saved_requests DROP COLUMN IF EXISTS url;
ALTER TABLE saved_requests DROP COLUMN IF EXISTS method;
ALTER TABLE history DROP COLUMN IF EXISTS url;
ALTER TABLE history DROP COLUMN IF EXISTS method;
