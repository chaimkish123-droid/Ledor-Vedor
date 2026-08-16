import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hebrewFromGregorian,
  gregorianFromHebrew,
  formatHebrewDate,
  formatHebrewDateHe,
  isHebrewLeapYear,
  daysInHebrewYear,
  toGematria,
} from '../src/lib/hebrew.ts';

test('Rosh Hashanah anchors', () => {
  // 1 Tishri of each year, verified against published calendars.
  assert.deepEqual(gregorianFromHebrew({ year: 5786, month: 7, day: 1 }), { year: 2025, month: 9, day: 23 });
  assert.deepEqual(gregorianFromHebrew({ year: 5784, month: 7, day: 1 }), { year: 2023, month: 9, day: 16 });
  assert.deepEqual(gregorianFromHebrew({ year: 5760, month: 7, day: 1 }), { year: 1999, month: 9, day: 11 });
});

test('Pesach anchor: 15 Nisan 5784 = 23 April 2024', () => {
  assert.deepEqual(gregorianFromHebrew({ year: 5784, month: 1, day: 15 }), { year: 2024, month: 4, day: 23 });
});

test('Israeli independence: 14 May 1948 = 5 Iyar 5708', () => {
  const h = hebrewFromGregorian({ year: 1948, month: 5, day: 14 });
  assert.deepEqual(h, { year: 5708, month: 2, day: 5 });
});

test('civil millennium: 1 Jan 2000 = 23 Tevet 5760', () => {
  const h = hebrewFromGregorian({ year: 2000, month: 1, day: 1 });
  assert.deepEqual(h, { year: 5760, month: 10, day: 23 });
});

test('after sunset rolls into the next Hebrew day', () => {
  const day = hebrewFromGregorian({ year: 2026, month: 8, day: 14 }, false);
  const evening = hebrewFromGregorian({ year: 2026, month: 8, day: 14 }, true);
  assert.equal(evening.day, day.day + 1);
});

test('round-trips across a long span of days', () => {
  for (let y = 1750; y <= 2100; y += 7) {
    for (const [m, d] of [[1, 1], [3, 15], [7, 4], [12, 31]] as const) {
      const h = hebrewFromGregorian({ year: y, month: m, day: d });
      assert.deepEqual(gregorianFromHebrew(h), { year: y, month: m, day: d }, `${y}-${m}-${d}`);
    }
  }
});

test('year lengths are always one of the six valid values', () => {
  for (let y = 5600; y <= 5900; y++) {
    assert.ok([353, 354, 355, 383, 384, 385].includes(daysInHebrewYear(y)), `year ${y}`);
  }
});

test('leap years follow the 19-year Metonic cycle', () => {
  assert.equal(isHebrewLeapYear(5784), true);
  assert.equal(isHebrewLeapYear(5785), false);
  assert.equal(isHebrewLeapYear(5786), false);
  assert.equal(isHebrewLeapYear(5787), true);
});

test('formatting', () => {
  const h = hebrewFromGregorian({ year: 2026, month: 8, day: 14 });
  assert.equal(formatHebrewDate(h), '1 Elul 5786');
  assert.equal(formatHebrewDateHe(h), 'א׳ אלול תשפ״ו');
});

test('gematria avoids spelling the Divine Name', () => {
  assert.equal(toGematria(15, false), 'טו');
  assert.equal(toGematria(16, false), 'טז');
  assert.equal(toGematria(21, false), 'כא');
  assert.equal(toGematria(786, false), 'תשפו');
});
