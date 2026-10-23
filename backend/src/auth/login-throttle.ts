import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

// Slows password guessing. Failures are counted per account (the email typed,
// whether or not such an account exists, so the limit can't reveal which do)
// and per IP address (so one source can't spray a common password across many
// accounts). Past the limit the caller gets 429 until the oldest failure in the
// window ages out; a successful sign-in clears that account's count. Checked
// before the password hash, so a locked-out guesser doesn't cost bcrypt time.
//
// In memory: fine for one API process. Behind several, each keeps its own
// counts (a guesser gets that many more tries); move to a shared store then.

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_ACCOUNT_FAILURES = 5;
export const MAX_IP_FAILURES = 20;

@Injectable()
export class LoginThrottle {
  private failures = new Map<string, number[]>();

  // Throws 429 if any of these keys has used up its failures in the window.
  check(keys: Array<[key: string, limit: number]>, now: number = Date.now()) {
    let retryAt = 0;
    for (const [key, limit] of keys) {
      const recent = this.recent(key, now);
      if (recent.length >= limit) retryAt = Math.max(retryAt, recent[recent.length - limit] + WINDOW_MS);
    }
    if (retryAt > now) {
      const minutes = Math.max(1, Math.ceil((retryAt - now) / 60_000));
      throw new HttpException(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  fail(keys: string[], now: number = Date.now()) {
    for (const key of keys) this.failures.set(key, [...this.recent(key, now), now]);
    if (this.failures.size > 10_000) this.sweep(now);
  }

  clear(key: string) {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    return (this.failures.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
  }

  // Drops keys with nothing left in the window, so memory stays bounded.
  private sweep(now: number) {
    for (const [key, times] of Array.from(this.failures)) {
      if (!times.some((t) => t > now - WINDOW_MS)) this.failures.delete(key);
    }
  }
}

export const accountKey = (email: string) => `account:${email.trim().toLowerCase()}`;
export const ipKey = (ip: string | undefined) => `ip:${ip ?? 'unknown'}`;
export const passwordKey = (userId: string) => `change-password:${userId}`;
