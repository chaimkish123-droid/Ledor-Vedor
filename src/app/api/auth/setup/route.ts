import type { NextRequest } from 'next/server';
import { withoutUser } from '@/lib/api';
import { createSession, registerUser, setSessionCookie } from '@/lib/auth';
import { needsFirstAccount } from '@/lib/seed';
import { ATTEMPTS, addressOf, noteAttempt, tooManyAttempts } from '@/lib/rate-limit';

/**
 * The founding account. Available only while no account exists, so a fresh
 * installation has a way in without an invitation — and never a second time.
 */
export async function POST(request: NextRequest) {
  return withoutUser(async () => {
    if (!needsFirstAccount()) {
      throw new Error('This family space has already been set up. Please sign in instead.');
    }

    const from = addressOf(request.headers);
    if (tooManyAttempts(`setup:${from}`, ATTEMPTS.address)) {
      throw new Error('Too many attempts. Please wait a few minutes and try again.');
    }
    noteAttempt(`setup:${from}`, ATTEMPTS.address);

    const { email, password, name } = await request.json();
    if (!String(name ?? '').trim()) throw new Error('Please tell us your name.');
    if (!String(email ?? '').includes('@')) throw new Error('Please enter a valid email address.');
    if (String(password ?? '').length < 8) {
      throw new Error('Please choose a password of at least 8 characters.');
    }

    const userId = registerUser({
      email: String(email),
      password: String(password),
      displayName: String(name),
      role: 'admin',
    });
    await setSessionCookie(createSession(userId));
    return { ok: true };
  });
}
