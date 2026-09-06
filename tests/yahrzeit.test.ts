import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginsTonight,
  deathAsHebrewDate,
  nextYahrzeit,
  upcomingYahrzeits,
  whenInWords,
  yahrzeitInYear,
} from '../src/lib/yahrzeit.ts';
import { daysInHebrewMonth, hebrewFromGregorian, isHebrewLeapYear } from '../src/lib/hebrew.ts';
import { parseDateInput } from '../src/lib/dates.ts';

const exact = (value: string, afterSunset = false) => ({
  ...parseDateInput(value),
  afterSunset,
});

test('a death becomes the Hebrew date it happened on', () => {
  // 14 May 1948 — the day Israel was declared, 5 Iyar 5708.
  const hebrew = deathAsHebrewDate(exact('May 14 1948'))!;
  assert.equal(hebrew.year, 5708);
  assert.equal(hebrew.month, 2, 'Iyar');
  assert.equal(hebrew.day, 5);
});

test('a death after nightfall belongs to the following Hebrew day', () => {
  const byDay = deathAsHebrewDate(exact('May 14 1948'))!;
  const byNight = deathAsHebrewDate(exact('May 14 1948', true))!;
  assert.equal(byNight.day, byDay.day + 1, 'the evening belongs to the next day');
});

test('a year alone gives no yahrzeit, rather than a guessed one', () => {
  assert.equal(deathAsHebrewDate(parseDateInput('1948')), null);
  assert.equal(deathAsHebrewDate(parseDateInput('c. 1948')), null);
  assert.equal(deathAsHebrewDate(parseDateInput('')), null);
  assert.equal(nextYahrzeit(parseDateInput('1948')), null);
});

test('an ordinary yahrzeit falls on the same Hebrew day each year', () => {
  const died = { year: 5760, month: 9, day: 14 }; // 14 Kislev
  for (const year of [5761, 5762, 5763, 5784, 5790]) {
    const yahrzeit = yahrzeitInYear(died, year);
    assert.equal(yahrzeit.hebrew.month, 9);
    assert.equal(yahrzeit.hebrew.day, 14);
    assert.equal(yahrzeit.ordinal, year - 5760);
  }
});

test('it begins the evening before the civil date', () => {
  const yahrzeit = yahrzeitInYear({ year: 5760, month: 9, day: 14 }, 5785);
  const day = Date.UTC(
    yahrzeit.gregorian.year,
    yahrzeit.gregorian.month - 1,
    yahrzeit.gregorian.day,
  );
  const evening = Date.UTC(
    yahrzeit.beginsEvening.year,
    yahrzeit.beginsEvening.month - 1,
    yahrzeit.beginsEvening.day,
  );
  assert.equal(day - evening, 86_400_000, 'the night before, exactly');
});

/* ------------------------------------------------------------------ *
 * Adar, in a year with two of them.
 * ------------------------------------------------------------------ */

test('an ordinary Adar is marked in the first Adar of a leap year, and says so', () => {
  const died = { year: 5781, month: 12, day: 10 }; // 10 Adar, an ordinary year
  assert.equal(isHebrewLeapYear(5781), false);
  assert.equal(isHebrewLeapYear(5784), true, 'precondition: 5784 is a leap year');

  const yahrzeit = yahrzeitInYear(died, 5784, 'first');

  assert.equal(yahrzeit.hebrew.month, 12, 'Adar I');
  assert.equal(yahrzeit.hebrew.day, 10);
  assert.match(yahrzeit.notes.join(' '), /two Adars/i);
  assert.match(yahrzeit.notes.join(' '), /second/i, 'the other practice is named, not hidden');
});

test('the second-Adar custom is honoured when a family keeps it', () => {
  const died = { year: 5781, month: 12, day: 10 };
  const yahrzeit = yahrzeitInYear(died, 5784, 'second');
  assert.equal(yahrzeit.hebrew.month, 13, 'Adar II');
  assert.match(yahrzeit.notes.join(' '), /Ashkenazi practice is the first/i);
});

test('a death in Adar II is marked in the one Adar of an ordinary year', () => {
  const died = { year: 5784, month: 13, day: 7 }; // 7 Adar II of a leap year
  const yahrzeit = yahrzeitInYear(died, 5785, 'first');
  assert.equal(isHebrewLeapYear(5785), false, 'precondition');
  assert.equal(yahrzeit.hebrew.month, 12, 'the only Adar there is');
  assert.equal(yahrzeit.hebrew.day, 7);
});

test('a death in the first Adar of a leap year stays in the first Adar', () => {
  const died = { year: 5784, month: 12, day: 20 };
  const yahrzeit = yahrzeitInYear(died, 5787, 'first');
  assert.equal(isHebrewLeapYear(5787), true, 'precondition');
  assert.equal(yahrzeit.hebrew.month, 12);
});

/* ------------------------------------------------------------------ *
 * The thirtieth of a month that some years do not have.
 * ------------------------------------------------------------------ */

test('the thirtieth of a short Kislev moves to the last day it has', () => {
  // Find a year where Kislev runs to 30, and a later one where it does not.
  let long = 0;
  let short = 0;
  for (let year = 5780; year < 5820; year++) {
    if (!long && daysInHebrewMonth(9, year) === 30) long = year;
    if (long && !short && year > long && daysInHebrewMonth(9, year) === 29) short = year;
  }
  assert.ok(long && short, 'the seed of years should contain both');

  const died = { year: long, month: 9, day: 30 };
  const yahrzeit = yahrzeitInYear(died, short);

  assert.equal(yahrzeit.hebrew.day, 29, 'the last day Kislev has that year');
  assert.match(yahrzeit.notes.join(' '), /only 29 days/i);
  assert.match(yahrzeit.notes.join(' '), /first of the month following/i, 'the other custom is named');
  assert.match(yahrzeit.notes.join(' '), /asking/i);
});

test('the thirtieth is left alone in a year that has one', () => {
  let long = 0;
  for (let year = 5780; year < 5820; year++) {
    if (daysInHebrewMonth(8, year) === 30) { long = year; break; }
  }
  const yahrzeit = yahrzeitInYear({ year: long, month: 8, day: 30 }, long + 19);
  if (daysInHebrewMonth(8, long + 19) === 30) {
    assert.equal(yahrzeit.hebrew.day, 30);
    assert.deepEqual(yahrzeit.notes, [], 'nothing to say when nothing is unusual');
  }
});

test('30 Adar I has no home in an ordinary year, and is moved with a note', () => {
  let leap = 0;
  for (let year = 5780; year < 5820; year++) {
    if (isHebrewLeapYear(year)) { leap = year; break; }
  }
  const died = { year: leap, month: 12, day: 30 };
  assert.equal(daysInHebrewMonth(12, leap), 30, 'Adar I runs to thirty');

  let ordinary = leap + 1;
  while (isHebrewLeapYear(ordinary)) ordinary++;

  const yahrzeit = yahrzeitInYear(died, ordinary);
  assert.equal(yahrzeit.hebrew.day, 29, 'Adar has twenty-nine days in an ordinary year');
  assert.match(yahrzeit.notes.join(' '), /29 days/);
});

/* ------------------------------------------------------------------ *
 * The next one, and the ones coming up.
 * ------------------------------------------------------------------ */

test('the next yahrzeit is the one still to come', () => {
  const death = exact('May 14 1948');
  const from = new Date(Date.UTC(2026, 8, 6)); // 6 September 2026

  const next = nextYahrzeit(death, from)!;
  const asDate = Date.UTC(next.gregorian.year, next.gregorian.month - 1, next.gregorian.day);

  assert.ok(asDate >= Date.UTC(2026, 8, 6), 'not one that has already passed');
  assert.ok(asDate < Date.UTC(2027, 8, 6), 'and within the year');
  assert.equal(next.hebrew.month, 2, 'still Iyar');
  assert.equal(next.hebrew.day, 5);
});

test('one falling today is still the next one — that is the day it is needed', () => {
  const death = exact('May 14 1948');
  const died = hebrewFromGregorian({ year: 1948, month: 5, day: 14 });
  const thisYear = yahrzeitInYear(died, 5787);
  const onTheDay = new Date(
    Date.UTC(thisYear.gregorian.year, thisYear.gregorian.month - 1, thisYear.gregorian.day),
  );

  const next = nextYahrzeit(death, onTheDay)!;
  assert.deepEqual(next.gregorian, thisYear.gregorian, 'today, not a year from today');
  assert.equal(beginsTonight(next, onTheDay), false, 'it began last night');
});

test('the ones coming up are ordered by nearness, and the far ones left out', () => {
  const died = hebrewFromGregorian({ year: 2000, month: 6, day: 1 });
  const soon = yahrzeitInYear(died, 5790);
  const from = new Date(
    Date.UTC(soon.gregorian.year, soon.gregorian.month - 1, soon.gregorian.day - 3),
  );

  const entries = [
    { subject: 'Chana', death: exact('June 1 2000') },
    { subject: 'Yaakov', death: exact('January 1 1990') },
    { subject: 'Unknown day', death: parseDateInput('1975') },
  ];

  const within = upcomingYahrzeits(entries, { from, withinDays: 7 });

  assert.ok(within.some((hit) => hit.subject === 'Chana'), 'the near one is listed');
  assert.ok(
    !within.some((hit) => hit.subject === 'Unknown day'),
    'a death with no known day is not guessed at',
  );
  for (let i = 1; i < within.length; i++) {
    assert.ok(within[i].daysAway >= within[i - 1].daysAway, 'soonest first');
  }
  for (const hit of within) assert.ok(hit.daysAway >= 0 && hit.daysAway <= 7);
});

test('the wording is what a person would say', () => {
  assert.equal(whenInWords(0), 'today');
  assert.equal(whenInWords(1), 'tomorrow');
  assert.equal(whenInWords(3), 'in 3 days');
  assert.equal(whenInWords(9), 'next week');
  assert.equal(whenInWords(21), 'in 3 weeks');
});
