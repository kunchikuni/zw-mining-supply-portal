// A token's `iat` is in whole seconds, so the "tokens issued before this are
// refused" cutoff (User.tokensValidAfter) is too: a token issued later in the
// same second as a password change — like the fresh one the change returns —
// stays valid. One issued earlier in that same second would survive as well,
// which is an acceptable edge for a one-second window.
export function sessionCutoff(now: Date = new Date()): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}

export function issuedBeforeCutoff(iat: number | undefined, cutoff: Date | null): boolean {
  return cutoff != null && (iat ?? 0) * 1000 < cutoff.getTime();
}
