import type { NextRequest } from 'next/server';
import { withoutUser } from '@/lib/api';
import { authenticate, createSession, setSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withoutUser(async () => {
    const { email, password } = await request.json();
    const userId = authenticate(String(email ?? ''), String(password ?? ''));
    if (!userId) throw new Error('That email and password do not match.');

    await setSessionCookie(createSession(userId));
    const row = db().prepare('SELECT person_id, onboarded FROM user WHERE id = ?').get(userId) as any;
    return { ok: true, personId: row?.person_id ?? null, onboarded: !!row?.onboarded };
  });
}
