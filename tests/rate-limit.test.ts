import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTEMPTS,
  addressOf,
  clearAttempts,
  noteAttempt,
  resetAllAttempts,
  tooManyAttempts,
} from '../src/lib/rate-limit.ts';

test('an account locks after repeated wrong passwords', () => {
  resetAllAttempts();
  const key = 'signin:someone@example.com';

  for (let i = 0; i < ATTEMPTS.account - 1; i++) {
    noteAttempt(key, ATTEMPTS.account);
    assert.equal(tooManyAttempts(key, ATTEMPTS.account), false, `still allowed after ${i + 1}`);
  }

  noteAttempt(key, ATTEMPTS.account);
  assert.equal(tooManyAttempts(key, ATTEMPTS.account), true, 'locked once the limit is reached');
});

test('one relative fumbling their password does not lock out the household', () => {
  resetAllAttempts();
  const household = 'signin-from:82.14.9.7';

  // A family member gets it wrong several times over.
  for (let i = 0; i < ATTEMPTS.account; i++) noteAttempt(household, ATTEMPTS.address);

  assert.equal(
    tooManyAttempts(household, ATTEMPTS.address),
    false,
    'the address they share is still usable by everyone else',
  );
});

test('a shared address still stops sustained guessing', () => {
  resetAllAttempts();
  const household = 'signin-from:82.14.9.7';

  for (let i = 0; i < ATTEMPTS.address; i++) noteAttempt(household, ATTEMPTS.address);
  assert.equal(tooManyAttempts(household, ATTEMPTS.address), true);
});

test('signing in successfully clears the record', () => {
  resetAllAttempts();
  const key = 'signin:someone@example.com';

  for (let i = 0; i < ATTEMPTS.account; i++) noteAttempt(key, ATTEMPTS.account);
  assert.equal(tooManyAttempts(key, ATTEMPTS.account), true);

  clearAttempts(key);
  assert.equal(tooManyAttempts(key, ATTEMPTS.account), false);
});

test('the client end of a proxy chain is what counts', () => {
  assert.equal(addressOf(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' })), '203.0.113.9');
  assert.equal(addressOf(new Headers({ 'x-real-ip': '203.0.113.9' })), '203.0.113.9');
  assert.equal(addressOf(new Headers()), 'local');
});
