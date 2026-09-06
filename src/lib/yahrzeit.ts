/**
 * Yahrzeitn — the Hebrew anniversary of a death.
 *
 * A pure module: dates in, dates out, no React and no database, so the parts
 * that are easy to get quietly wrong can be tested directly.
 *
 * Three things make this more than adding a year to a date, and all three are
 * places where families differ. Where they differ, this does not decide for
 * anybody: it takes the more widespread practice, says so on the screen, and
 * names the other one. A calendar that silently picks a side is worse than one
 * that admits there is a question.
 *
 *   1. Adar. Somebody who died in Adar of an ordinary year has two Adars to
 *      choose from when the year is a leap year. The Rema's ruling — and the
 *      prevailing Ashkenazi practice — is the first Adar; the Mechaber's is the
 *      second, and many observe both.
 *
 *   2. The thirtieth. Cheshvan and Kislev have thirty days in some years and
 *      twenty-nine in others, so a death on the thirtieth has years with no
 *      such date at all. The same is true of 30 Adar I in an ordinary year.
 *
 *   3. Nightfall. The Hebrew day begins in the evening, so a yahrzeit begins
 *      the night before the civil date everybody writes in their diary. The
 *      archive already records whether a death itself was after nightfall.
 */

import {
  daysInHebrewMonth,
  gregorianFromHebrew,
  hebrewFromGregorian,
  hebrewMonthName,
  isHebrewLeapYear,
  type GregorianDate,
  type HebrewDate,
} from './hebrew';
import { parseParts, type FlexibleDate } from './dates';

/** Which Adar a death in an ordinary Adar is marked in, when the year is long. */
export type AdarCustom = 'first' | 'second';

export type Yahrzeit = {
  hebrew: HebrewDate;
  /** The civil date of the Hebrew day. */
  gregorian: GregorianDate;
  /** The evening it begins — the civil day before, since the day starts at nightfall. */
  beginsEvening: GregorianDate;
  /** Which anniversary this is: 1 for the first. */
  ordinal: number;
  /** Anything the family should know about this particular year. */
  notes: string[];
};

const NISAN = 1;
const CHESHVAN = 8;
const KISLEV = 9;
const ADAR = 12;
const ADAR_II = 13;

/**
 * The Hebrew date of a death, where the archive knows the day.
 *
 * A year alone, or a month without a day, cannot give a yahrzeit — and guessing
 * one would be worse than leaving it blank, since the family would light a
 * candle on a day nobody died.
 */
export function deathAsHebrewDate(death: FlexibleDate): HebrewDate | null {
  if (death.precision !== 'exact') return null;
  const { year, month, day } = parseParts(death.value);
  if (!year || !month || !day) return null;
  return hebrewFromGregorian({ year, month, day }, death.afterSunset ?? false);
}

/**
 * Where the yahrzeit falls in a given Hebrew year.
 */
export function yahrzeitInYear(
  died: HebrewDate,
  hebrewYear: number,
  custom: AdarCustom = 'first',
): Yahrzeit {
  const notes: string[] = [];
  const leapThisYear = isHebrewLeapYear(hebrewYear);
  const leapWhenDied = isHebrewLeapYear(died.year);

  let month = died.month;

  if (died.month === ADAR && !leapWhenDied && leapThisYear) {
    // An ordinary Adar, and this year there are two of them.
    month = custom === 'first' ? ADAR : ADAR_II;
    notes.push(
      custom === 'first'
        ? 'A leap year, with two Adars. Marked in the first, as the Rema rules; others mark it in the second, and some in both.'
        : 'A leap year, with two Adars. Marked in the second; the prevailing Ashkenazi practice is the first.',
    );
  } else if (died.month === ADAR_II && !leapThisYear) {
    // Adar II exists only in a leap year; an ordinary year has one Adar.
    month = ADAR;
    notes.push('An ordinary year, with one Adar.');
  } else if (died.month === ADAR && leapWhenDied && leapThisYear) {
    notes.push('Marked in the first Adar, as it was.');
  }

  let day = died.day;
  const lengthThisYear = daysInHebrewMonth(month, hebrewYear);

  if (day > lengthThisYear) {
    // The thirtieth of a month that is short this year.
    day = lengthThisYear;
    const name = hebrewMonthName(month, hebrewYear);
    notes.push(
      `${name} has only ${lengthThisYear} days this year, so the thirtieth does not come round. ` +
        `Marked on the last day of ${name}; some families mark it on the first of the month following. Worth asking.`,
    );
  }

  const hebrew: HebrewDate = { year: hebrewYear, month, day };
  const gregorian = gregorianFromHebrew(hebrew);

  return {
    hebrew,
    gregorian,
    beginsEvening: dayBefore(gregorian),
    ordinal: hebrewYear - died.year,
    notes,
  };
}

/**
 * The next yahrzeit falling on or after a given day.
 *
 * "On or after" rather than "after": a yahrzeit being marked today is the one
 * the family most needs to see.
 */
export function nextYahrzeit(
  death: FlexibleDate,
  from: Date = new Date(),
  custom: AdarCustom = 'first',
): Yahrzeit | null {
  const died = deathAsHebrewDate(death);
  if (!died) return null;

  const today = hebrewFromGregorian({
    year: from.getFullYear(),
    month: from.getMonth() + 1,
    day: from.getDate(),
  });

  // The current Hebrew year first; if it has already passed, the next one.
  for (const year of [today.year, today.year + 1]) {
    if (year <= died.year) continue;
    const candidate = yahrzeitInYear(died, year, custom);
    if (onOrAfter(candidate.gregorian, from)) return candidate;
  }

  // A death later in the current Hebrew year: the first yahrzeit is next year.
  return yahrzeitInYear(died, Math.max(today.year, died.year) + 1, custom);
}

export type YahrzeitEntry<T> = { subject: T; death: FlexibleDate };

export type UpcomingYahrzeit<T> = { subject: T; yahrzeit: Yahrzeit; daysAway: number };

/**
 * Everyone whose yahrzeit falls within the next so many days, soonest first.
 */
export function upcomingYahrzeits<T>(
  entries: YahrzeitEntry<T>[],
  options: { from?: Date; withinDays?: number; custom?: AdarCustom } = {},
): UpcomingYahrzeit<T>[] {
  const from = options.from ?? new Date();
  const withinDays = options.withinDays ?? 30;
  const custom = options.custom ?? 'first';

  const found: UpcomingYahrzeit<T>[] = [];

  for (const entry of entries) {
    const yahrzeit = nextYahrzeit(entry.death, from, custom);
    if (!yahrzeit) continue;
    const daysAway = daysBetween(from, yahrzeit.gregorian);
    if (daysAway < 0 || daysAway > withinDays) continue;
    found.push({ subject: entry.subject, yahrzeit, daysAway });
  }

  return found.sort((a, b) => a.daysAway - b.daysAway);
}

/* ------------------------------------------------------------------ *
 * Small date arithmetic, kept here so the module stays self-contained.
 * ------------------------------------------------------------------ */

function toUtc(date: GregorianDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function startOfDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayBefore(date: GregorianDate): GregorianDate {
  const before = new Date(toUtc(date) - 86_400_000);
  return {
    year: before.getUTCFullYear(),
    month: before.getUTCMonth() + 1,
    day: before.getUTCDate(),
  };
}

function onOrAfter(date: GregorianDate, from: Date): boolean {
  return toUtc(date) >= startOfDay(from);
}

function daysBetween(from: Date, to: GregorianDate): number {
  return Math.round((toUtc(to) - startOfDay(from)) / 86_400_000);
}

/** "in 3 days", "tomorrow", "today" — how a person would say it. */
export function whenInWords(daysAway: number): string {
  if (daysAway === 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  if (daysAway < 7) return `in ${daysAway} days`;
  if (daysAway < 14) return 'next week';
  return `in ${Math.round(daysAway / 7)} weeks`;
}

/** Whether the evening it begins is tonight — the moment a family wants told. */
export function beginsTonight(yahrzeit: Yahrzeit, from: Date = new Date()): boolean {
  return toUtc(yahrzeit.beginsEvening) === startOfDay(from);
}

export { NISAN, CHESHVAN, KISLEV, ADAR, ADAR_II };
