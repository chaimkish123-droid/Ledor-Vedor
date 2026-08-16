import type { NextRequest } from 'next/server';
import { withoutUser } from '@/lib/api';
import { checkResetCode, useResetCode } from '@/lib/passwords';
import { createSession, setSessionCookie } from '@/lib/auth';
import { ATTEMPTS, addressOf, noteAttempt, tooManyAttempts } from '@/lib/rate-limit';

/** Does this link still work, and whose is it? */
export async function GET(request: NextRequest) {
  return withoutUser(() => {
    const code = request.nextUrl.searchParams.get('code') ?? '';
    const from = addressOf(request.headers);
    if (tooManyAttempts(`reset:${from}`, ATTEMPTS.address)) {
      throw new Error('Too many attempts. Please wait a few minutes and try again.');
    }
    noteAttempt(`reset:${from}`, ATTEMPTS.address);
    return checkResetCode(code);
  });
}

/** Set a new password, then sign them straight in. */
export async function POST(request: NextRequest) {
  return withoutUser(async () => {
    const from = addressOf(request.headers);
    if (tooManyAttempts(`reset:${from}`, ATTEMPTS.address)) {
      throw new Error('Too many attempts. Please wait a few minutes and try again.');
    }
    noteAttempt(`reset:${from}`, ATTEMPTS.address);

    const body = await request.json();
    const target = useResetCode(String(body?.code ?? ''), String(body?.password ?? ''));

    await setSessionCookie(createSession(target.userId));
    return { ok: true, name: target.displayName };
  });
}
