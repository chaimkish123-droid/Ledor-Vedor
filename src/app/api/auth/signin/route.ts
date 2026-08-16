import type { NextRequest } from 'next/server';
import { withoutUser } from '@/lib/api';
import { authenticate, createSession, setSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { ATTEMPTS, addressOf, clearAttempts, noteAttempt, tooManyAttempts } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  return withoutUser(async () => {
    const { email, password } = await request.json();

    // Guessing a family member's password should get slow, quickly — while a
    // household sharing one address keeps a much longer leash.
    const account = String(email ?? '').trim().toLowerCase();
    const from = addressOf(request.headers);
    const limits: [string, number][] = [
      [`signin:${account}`, ATTEMPTS.account],
      [`signin-from:${from}`, ATTEMPTS.address],
    ];

    if (limits.some(([key, max]) => tooManyAttempts(key, max))) {
      throw new Error('Too many attempts. Please wait a few minutes and try again.');
    }

    const userId = authenticate(account, String(password ?? ''));
    if (!userId) {
      for (const [key, max] of limits) noteAttempt(key, max);
      throw new Error('That email and password do not match.');
    }
    for (const [key] of limits) clearAttempts(key);

    await setSessionCookie(createSession(userId));
    const row = db().prepare('SELECT person_id, onboarded FROM user WHERE id = ?').get(userId) as any;
    return { ok: true, personId: row?.person_id ?? null, onboarded: !!row?.onboarded };
  });
}
