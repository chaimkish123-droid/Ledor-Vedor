import type { NextRequest } from 'next/server';
import { withoutUser } from '@/lib/api';
import {
  consumeInvitation,
  createSession,
  findUserByEmail,
  getInvitation,
  invitationProblem,
  registerUser,
  setSessionCookie,
} from '@/lib/auth';
import { ATTEMPTS, addressOf, noteAttempt, tooManyAttempts } from '@/lib/rate-limit';

/** Joining a family space always begins with an invitation from someone already in it. */
export async function POST(request: NextRequest) {
  return withoutUser(async () => {
    const { code, email, password, name } = await request.json();

    // An invitation code should not be guessable by brute force either.
    const from = addressOf(request.headers);
    if (tooManyAttempts(`join:${from}`, ATTEMPTS.address)) {
      throw new Error('Too many attempts. Please wait a few minutes and try again.');
    }
    noteAttempt(`join:${from}`, ATTEMPTS.address);

    const invitation = getInvitation(String(code ?? '').trim());
    const problem = invitationProblem(invitation);
    if (problem || !invitation) throw new Error(problem ?? 'That invitation is not usable.');
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
