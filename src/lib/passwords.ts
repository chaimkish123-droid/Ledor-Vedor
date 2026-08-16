/**
 * Getting back in.
 *
 * There is no email server here, and adding one would mean credentials to
 * keep, deliverability to worry about, and another way for this to break at
 * the moment somebody needs it. Invitations already work by handing a person a
 * link; so does this. An administrator makes a link and gives it to their
 * relative however they normally reach them — a message, a phone call, across
 * the kitchen table.
 *
 * The rules that matter:
 *   * A reset link is single use and expires.
 *   * Only its hash is stored, so a copy of the archive carries no live keys.
 *   * Using one signs that account out everywhere, because a forgotten
 *     password and a taken account look identical from here.
 */

import { createHash, randomBytes } from 'node:crypto';
import { db, hashPassword, id as newId, now, verifyPassword } from './db';
import { recordRevision, type Actor } from './repo';

/** Long enough that guessing is hopeless, short enough to read down a phone. */
const RESET_HOURS = 48;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export type Member = {
  id: string;
  displayName: string;
  email: string;
  role: 'member' | 'admin';
  personId: string | null;
  personName: string | null;
  joinedAt: string;
  onboarded: boolean;
};

export function listMembers(): Member[] {
  const rows = db()
    .prepare(
      `SELECT u.id, u.display_name, u.email, u.role, u.person_id, u.created_at, u.onboarded,
              p.preferred_name AS person_name
       FROM user u LEFT JOIN person p ON p.id = u.person_id
       ORDER BY u.created_at`,
    )
    .all() as Record<string, any>[];

  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    personId: row.person_id ?? null,
    personName: row.person_name ?? null,
    joinedAt: row.created_at,
    onboarded: !!row.onboarded,
  }));
}

/** Make a link for a relative who cannot get in. Returns the code once, only. */
export function createResetCode(userId: string, actor: Actor): { code: string; expiresAt: string } {
  const user = db().prepare('SELECT display_name FROM user WHERE id = ?').get(userId) as
    | { display_name: string }
    | undefined;
  if (!user) throw new Error('That family member could not be found.');

  // Any earlier link stops working the moment a new one is made.
  db().prepare('DELETE FROM password_reset WHERE user_id = ? AND used_at IS NULL').run(userId);

  const code = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_HOURS * 3600_000).toISOString();

  db()
    .prepare(
      `INSERT INTO password_reset (id, user_id, code_hash, created_by, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), userId, hashCode(code), actor.id, now(), expiresAt);

  recordRevision({
    entityType: 'account',
    entityId: userId,
    action: 'update',
    summary: `Made a way back in for ${user.display_name}`,
    actor,
  });

  return { code, expiresAt };
}

export type ResetTarget = { userId: string; displayName: string };

/** Check a link without spending it, so the page can greet them by name. */
export function checkResetCode(code: string): ResetTarget {
  const row = db()
    .prepare(
      `SELECT r.user_id, r.expires_at, r.used_at, u.display_name
       FROM password_reset r JOIN user u ON u.id = r.user_id
       WHERE r.code_hash = ?`,
    )
    .get(hashCode(code)) as Record<string, any> | undefined;

  if (!row) throw new Error('That link is not recognised. Ask whoever sent it for a new one.');
  if (row.used_at) throw new Error('That link has already been used. Ask for a new one.');
  if (row.expires_at < now()) throw new Error('That link has expired. Ask for a new one.');

  return { userId: row.user_id, displayName: row.display_name };
}

export function useResetCode(code: string, newPassword: string): ResetTarget {
  const target = checkResetCode(code);
  if (newPassword.length < 8) throw new Error('Please choose a password of at least 8 characters.');

  db().transaction(() => {
    db().prepare('UPDATE user SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), target.userId);
    db().prepare('UPDATE password_reset SET used_at = ? WHERE code_hash = ?').run(now(), hashCode(code));

    // A forgotten password and a taken account look the same from here, so
    // every existing session for them ends.
    db().prepare('DELETE FROM session WHERE user_id = ?').run(target.userId);

    recordRevision({
      entityType: 'account',
      entityId: target.userId,
      action: 'update',
      summary: `${target.displayName} set a new password`,
      actor: { id: target.userId, name: target.displayName },
    });
  })();

  return target;
}

/** Changing your own password, which needs the current one. */
export function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionToken: string | null,
): void {
  const row = db().prepare('SELECT password_hash, display_name FROM user WHERE id = ?').get(userId) as
    | { password_hash: string; display_name: string }
    | undefined;
  if (!row) throw new Error('Account not found.');

  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw new Error('That is not your current password.');
  }
  if (newPassword.length < 8) throw new Error('Please choose a password of at least 8 characters.');

  db().transaction(() => {
    db().prepare('UPDATE user SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);

    // Other devices are signed out; the one making the change stays.
    if (keepSessionToken) {
      db().prepare('DELETE FROM session WHERE user_id = ? AND token != ?').run(userId, keepSessionToken);
    } else {
      db().prepare('DELETE FROM session WHERE user_id = ?').run(userId);
    }

    recordRevision({
      entityType: 'account',
      entityId: userId,
      action: 'update',
      summary: `${row.display_name} changed their password`,
      actor: { id: userId, name: row.display_name },
    });
  })();
}
