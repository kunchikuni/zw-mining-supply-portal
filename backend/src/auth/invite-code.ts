import { createHash, randomBytes } from 'crypto';

// Invite codes are 192 bits of randomness, so a plain SHA-256 is enough to
// store them safely — there's nothing to brute-force, unlike a password.
export function generateInviteCode(): string {
  return randomBytes(24).toString('base64url');
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// The first-admin code is handed back in the same response that creates the
// company, so it only needs to outlive the second step of onboarding.
export const BOOTSTRAP_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const MEMBER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
