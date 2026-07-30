// Shared live-session helpers. These live here rather than in a route or a
// component because the same two rules have to hold on three separate paths —
// POST /api/live, PATCH /api/live/[id], and the client's optimistic view — and
// each one having its own copy is how the "include_auth was only enforced at
// creation" bug happened in the first place.

// Removes the auth block and any Authorization header from a request state.
// Used whenever a session's include_auth is false: the host's choice is made
// once and must hold for the session's whole lifetime, on every write, no
// matter what triggered it (typed, pasted, loaded from a saved request, curl
// import). See AGENTS.md.
export function stripAuth(state) {
  return {
    ...state,
    auth: { type: 'none' },
    headers: (state?.headers ?? []).filter(
      (h) => h?.key?.trim().toLowerCase() !== 'authorization'
    ),
  };
}

// A live-session state must be a plain object. Anything else (notably a JSON
// *string*) would slip past stripAuth's object spread and get stored verbatim,
// quietly defeating the include_auth guarantee.
export function isValidLiveState(state) {
  return !!state && typeof state === 'object' && !Array.isArray(state);
}
