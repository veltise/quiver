import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time comparison for bearer-style secrets (the live-session host token).
//
// Server-only — imports node:crypto, so never pull this into a 'use client' file.
//
// Both sides are hashed to a fixed 32 bytes first because timingSafeEqual throws
// on a length mismatch, and letting it throw would itself leak the expected
// length through the error path. Hashing makes every comparison the same width,
// so the only thing the timing reveals is "same or not".
export function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
