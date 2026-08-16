import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeOwnPassword,
  checkResetCode,
  createResetCode,
  listMembers,
  useResetCode,
} from '../src/lib/passwords.ts';
import { authenticate, createSession, registerUser } from '../src/lib/auth.ts';
import { db } from '../src/lib/db.ts';

const admin = { id: null as string | null, name: 'An administrator' };

let seq = 0;
function anAccount(name: string, password = 'the-first-password') {
  seq += 1;
  const email = `locked${seq}@example.test`;
  const id = registerUser({ email, password, displayName: name });
  if (!admin.id) admin.id = id;
  return { id, email, password, name };
}

function sessionCount(userId: string): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM session WHERE user_id = ?').get(userId) as { n: number }).n;
}

test('a relative who cannot sign in is given a way back', () => {
  const person = anAccount('Bracha Weiss');
  const { code } = createResetCode(person.id, admin);

  assert.equal(checkResetCode(code).displayName, 'Bracha Weiss', 'the page can greet them by name');

  useResetCode(code, 'a-brand-new-password');

  assert.equal(authenticate(person.email, 'a-brand-new-password'), person.id, 'the new password works');
  assert.equal(authenticate(person.email, person.password), null, 'the old one does not');
});

test('a link works once and no more', () => {
  const person = anAccount('Yitzchak Weiss');
  const { code } = createResetCode(person.id, admin);

  useResetCode(code, 'the-second-password');
  assert.throws(() => useResetCode(code, 'a-third-attempt'), /already been used/);
  assert.equal(authenticate(person.email, 'the-second-password'), person.id, 'the first use stands');
});

test('a link stops working when it expires', () => {
  const person = anAccount('Gittel Weiss');
  const { code } = createResetCode(person.id, admin);

  db()
    .prepare("UPDATE password_reset SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?")
    .run(person.id);

  assert.throws(() => checkResetCode(code), /expired/);
});

test('making a new link cancels the one before it', () => {
  const person = anAccount('Shmuel Weiss');
  const { code: first } = createResetCode(person.id, admin);
  const { code: second } = createResetCode(person.id, admin);

  assert.throws(() => checkResetCode(first), /not recognised/);
  assert.equal(checkResetCode(second).userId, person.id);
});

test('the code itself is never stored', () => {
  const person = anAccount('Rivka Weiss');
  const { code } = createResetCode(person.id, admin);

  const rows = db().prepare('SELECT code_hash FROM password_reset WHERE user_id = ?').all(person.id) as {
    code_hash: string;
  }[];

  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].code_hash, code, 'a copy of the archive carries no live keys');
  assert.equal(rows[0].code_hash.length, 64, 'it is a hash');
});

test('using a link signs that account out everywhere', () => {
  // A forgotten password and a taken account look identical from here.
  const person = anAccount('Nachum Weiss');
  createSession(person.id);
  createSession(person.id);
  assert.equal(sessionCount(person.id), 2);

  const { code } = createResetCode(person.id, admin);
  useResetCode(code, 'a-replacement-password');

  assert.equal(sessionCount(person.id), 0, 'anyone already signed in as them is out');
});

test('a rubbish link is refused, and a short password too', () => {
  const person = anAccount('Zelda Weiss');
  assert.throws(() => checkResetCode('not-a-real-code'), /not recognised/);

  const { code } = createResetCode(person.id, admin);
  assert.throws(() => useResetCode(code, 'short'), /at least 8/);
  assert.ok(checkResetCode(code), 'and the link is still good after a rejected attempt');
});

test('changing your own password needs the current one', () => {
  const person = anAccount('Menachem Weiss');

  assert.throws(
    () => changeOwnPassword(person.id, 'not-the-right-one', 'a-new-password-entirely', null),
    /not your current password/,
  );

  changeOwnPassword(person.id, person.password, 'a-new-password-entirely', null);
  assert.equal(authenticate(person.email, 'a-new-password-entirely'), person.id);
});

test('changing your password keeps you signed in here and nowhere else', () => {
  const person = anAccount('Tzipora Weiss');
  const thisDevice = createSession(person.id);
  createSession(person.id);
  createSession(person.id);
  assert.equal(sessionCount(person.id), 3);

  changeOwnPassword(person.id, person.password, 'yet-another-password', thisDevice);

  assert.equal(sessionCount(person.id), 1, 'the other devices are signed out');
  const remaining = db().prepare('SELECT token FROM session WHERE user_id = ?').get(person.id) as { token: string };
  assert.equal(remaining.token, thisDevice, 'and it is this one that stays');
});

test('an administrator can see who has an account', () => {
  const person = anAccount('Elka Weiss');
  const members = listMembers();

  assert.ok(members.some((member) => member.id === person.id));
  const found = members.find((member) => member.id === person.id)!;
  assert.equal(found.displayName, 'Elka Weiss');
  assert.equal(found.personId, null, 'she has not been placed in the family yet, and it says so');
});
