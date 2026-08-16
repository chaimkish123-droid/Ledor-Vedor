/**
 * A small in-memory limiter for the handful of endpoints worth protecting:
 * signing in, joining, and first-run setup.
 *
 * Deliberately simple. This is a private family application running as a single
 * instance; the counters reset on restart, which is an acceptable trade for
 * having no extra moving parts. It exists to stop password guessing, not to
 * survive a determined botnet.
 */

type Attempt = { count: number; firstAt: number; blockedUntil: number };

const attempts = new Map<string, Attempt>();

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

/**
 * Limits differ by what is being counted.
 *
 * A family shares an address — grandparents on one home connection, cousins in
 * one office — so the per-address allowance has to be generous enough that one
 * relative mistyping their password four times does not lock out everyone else
 * in the house.
 */
export const ATTEMPTS = {
  account: 8,
  address: 30,
} as const;

function sweep(now: number) {
  if (attempts.size < 500) return;
  for (const [key, attempt] of attempts) {
    if (now - attempt.firstAt > WINDOW_MS && now > attempt.blockedUntil) attempts.delete(key);
  }
}

export function tooManyAttempts(key: string, max: number = ATTEMPTS.account): boolean {
  const now = Date.now();
  const attempt = attempts.get(key);
  if (!attempt) return false;
  if (now < attempt.blockedUntil) return true;

  if (now - attempt.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return attempt.count >= max;
}

export function noteAttempt(key: string, max: number = ATTEMPTS.account) {
  const now = Date.now();
  sweep(now);

  const attempt = attempts.get(key);
  if (!attempt || now - attempt.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }

  attempt.count += 1;
  if (attempt.count >= max) attempt.blockedUntil = now + BLOCK_MS;
}

/** The caller's address, taking the client end of a proxy chain. */
export function addressOf(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'local';
}

/** A successful sign-in clears the slate for that identifier. */
export function clearAttempts(key: string) {
  attempts.delete(key);
}

/** Test seam. */
export function resetAllAttempts() {
  attempts.clear();
}
