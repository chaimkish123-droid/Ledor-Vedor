import type { NextRequest } from 'next/server';
import { withoutUser } from '@/lib/api';
import { consumeInvitation, createSession, findUserByEmail, getInvitation, registerUser, setSessionCookie } from '@/lib/auth';

/** Joining a family space always begins with an invitation from someone already in it. */
export async function POST(request: NextRequest) {
  return withoutUser(async () => {
    const { code, email, password, name } = await request.json();

    const invitation = getInvitation(String(code ?? '').trim());
    if (!invitation) throw new Error('That invitation link is not recognised. Ask the relative who invited you for a new one.');
    if (invitation.used_by) throw new Error('That invitation has already been used.');
    if (findUserByEmail(String(email ?? ''))) throw new Error('There is already an account with that email — try signing in.');
    if (String(password ?? '').length < 6) throw new Error('Please choose a password of at least 6 characters.');
    if (!String(name ?? '').trim()) throw new Error('Please tell us your name.');

    const userId = registerUser({
      email: String(email),
      password: String(password),
      displayName: String(name),
      personId: invitation.person_id ?? null,
    });
    consumeInvitation(String(code), userId);
    await setSessionCookie(createSession(userId));

    return { ok: true, suggestedPersonId: invitation.person_id ?? null };
  });
}
