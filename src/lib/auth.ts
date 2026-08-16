import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { db, hashPassword, id as newId, now, verifyPassword } from './db';
import type { SessionUser } from './types';

const COOKIE = 'ldor_session';
const SESSION_DAYS = 60;

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db()
    .prepare('INSERT INTO session (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, now(), expires);
  return token;
}

/**
 * Whether the session cookie insists on HTTPS.
 *
 * It should, everywhere it is reachable from the internet. But somebody trying
 * this on their own machine first, over plain http://localhost, would find that
 * signing in appears to do nothing at all — the browser quietly declines to
 * keep a secure cookie, and there is no error anywhere to explain it. That is a
 * miserable first ten minutes, so it can be turned off deliberately for a
 * machine on your own desk.
 */
function requireHttps(): boolean {
  if (process.env.LDOR_COOKIE_SECURE === 'false') return false;
  if (process.env.LDOR_COOKIE_SECURE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: requireHttps(),
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const row = db()
    .prepare(
      `SELECT u.* FROM session s JOIN user u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now()) as Record<string, any> | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    personId: row.person_id ?? null,
    role: row.role,
    onboarded: !!row.onboarded,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export function findUserByEmail(email: string) {
  return db().prepare('SELECT * FROM user WHERE email = ?').get(email.trim().toLowerCase()) as
    | Record<string, any>
    | undefined;
}

export function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  personId?: string | null;
  role?: 'member' | 'admin';
}): string {
  const userId = newId();
  db()
    .prepare(
      `INSERT INTO user (id, email, password_hash, display_name, person_id, role, onboarded, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      userId,
      input.email.trim().toLowerCase(),
      hashPassword(input.password),
      input.displayName.trim(),
      input.personId ?? null,
      input.role ?? 'member',
      now(),
    );
  return userId;
}

export function authenticate(email: string, password: string): string | null {
  const row = findUserByEmail(email);
  if (!row) return null;
  return verifyPassword(password, row.password_hash) ? row.id : null;
}

export function linkUserToPerson(userId: string, personId: string) {
  db().prepare('UPDATE user SET person_id = ?, onboarded = 1 WHERE id = ?').run(personId, userId);
}

export function markOnboarded(userId: string) {
  db().prepare('UPDATE user SET onboarded = 1 WHERE id = ?').run(userId);
}

/* ---------------------------------------------------------------- *
 * Invitations — the only way into a private family space.
 * ---------------------------------------------------------------- */

/** Invitations are single use and stop working after two weeks. */
export const INVITATION_DAYS = 14;

export function createInvitation(input: { createdBy: string; note?: string; personId?: string | null }): string {
  const code = randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000).toISOString();
  db()
    .prepare(
      `INSERT INTO invitation (id, code, note, person_id, created_by, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), code, input.note ?? null, input.personId ?? null, input.createdBy, now(), expiresAt);
  return code;
}

export function invitationProblem(invitation: Record<string, any> | undefined): string | null {
  if (!invitation) {
    return 'That invitation link is not recognised. Ask the relative who invited you for a new one.';
  }
  if (invitation.used_by) return 'That invitation has already been used.';
  if (invitation.expires_at && invitation.expires_at < now()) {
    return 'That invitation has expired. Ask the relative who invited you for a new one.';
  }
  return null;
}

export function getInvitation(code: string) {
  return db().prepare('SELECT * FROM invitation WHERE code = ?').get(code) as Record<string, any> | undefined;
}

export function consumeInvitation(code: string, userId: string) {
  db().prepare('UPDATE invitation SET used_by = ?, used_at = ? WHERE code = ?').run(userId, now(), code);
}

export function listInvitations() {
  return db().prepare('SELECT * FROM invitation ORDER BY created_at DESC LIMIT 50').all() as Record<string, any>[];
}
