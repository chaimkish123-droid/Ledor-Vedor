/**
 * Hebrew (Jewish) calendar conversion.
 *
 * Implements the arithmetic Hebrew calendar with all four postponement rules
 * (lo ADU rosh, molad zaken, GaTaRaD, BeTU'TaKPaT), converting through the
 * "absolute day" (Rata Die) number shared with the Gregorian calendar.
 *
 * No dependencies: the family graph must keep working offline and forever.
 */

/** Days elapsed before absolute date 1 (1 Jan 1 CE Gregorian). */
const HEBREW_EPOCH_OFFSET = -1373429;

export type HebrewDate = {
  /** 1 = Nisan … 6 = Elul, 7 = Tishri … 12 = Adar (Adar I in a leap year), 13 = Adar II */
  month: number;
  day: number;
  year: number;
};

export type GregorianDate = { year: number; month: number; day: number };

const HEBREW_MONTH_NAMES = [
  '', 'Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul',
  'Tishrei', 'Cheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Adar II',
];

const HEBREW_MONTH_NAMES_HE = [
  '', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול',
  'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב׳',
];

function gregorianLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Absolute (Rata Die) day number from a Gregorian date. */
export function absoluteFromGregorian({ year, month, day }: GregorianDate): number {
  const priorYear = year - 1;
  return (
    365 * priorYear +
    Math.floor(priorYear / 4) -
    Math.floor(priorYear / 100) +
    Math.floor(priorYear / 400) +
    Math.floor((367 * month - 362) / 12) +
    (month <= 2 ? 0 : gregorianLeap(year) ? -1 : -2) +
    day
  );
}

export function gregorianFromAbsolute(absolute: number): GregorianDate {
  let year = Math.floor(absolute / 366);
  while (absolute >= absoluteFromGregorian({ year: year + 1, month: 1, day: 1 })) year += 1;

  let month = 1;
  while (
    absolute >
    absoluteFromGregorian({
      year,
      month,
      day: daysInGregorianMonth(month, year),
    })
  ) {
    month += 1;
  }

  const day = absolute - absoluteFromGregorian({ year, month, day: 1 }) + 1;
  return { year, month, day };
}

function daysInGregorianMonth(month: number, year: number): number {
  const lengths = [31, gregorianLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

export function isHebrewLeapYear(year: number): boolean {
  return ((7 * year + 1) % 19) < 7;
}

export function lastMonthOfHebrewYear(year: number): number {
  return isHebrewLeapYear(year) ? 13 : 12;
}

/**
 * Number of days elapsed from the Hebrew epoch to 1 Tishri of `year`,
 * including all postponements of Rosh Hashanah.
 */
function hebrewElapsedDays(year: number): number {
  const monthsElapsed =
    235 * Math.floor((year - 1) / 19) +
    12 * ((year - 1) % 19) +
    Math.floor((7 * ((year - 1) % 19) + 1) / 19);

  const partsElapsed = 204 + 793 * (monthsElapsed % 1080);
  const hoursElapsed =
    5 + 12 * monthsElapsed + 793 * Math.floor(monthsElapsed / 1080) + Math.floor(partsElapsed / 1080);

  const day = 1 + 29 * monthsElapsed + Math.floor(hoursElapsed / 24);
  const parts = 1080 * (hoursElapsed % 24) + (partsElapsed % 1080);

  // Molad zaken, GaTaRaD, BeTU'TaKPaT
  const alternativeDay =
    parts >= 19440 ||
    (day % 7 === 2 && parts >= 9924 && !isHebrewLeapYear(year)) ||
    (day % 7 === 1 && parts >= 16789 && isHebrewLeapYear(year - 1))
      ? day + 1
      : day;

  // Lo ADU rosh: Rosh Hashanah never falls on Sunday, Wednesday or Friday.
  return [0, 3, 5].includes(alternativeDay % 7) ? alternativeDay + 1 : alternativeDay;
}

export function daysInHebrewYear(year: number): number {
  return hebrewElapsedDays(year + 1) - hebrewElapsedDays(year);
}

export function daysInHebrewMonth(month: number, year: number): number {
  if ([2, 4, 6, 10, 13].includes(month)) return 29;
  if (month === 12 && !isHebrewLeapYear(year)) return 29;
  if (month === 8 && ![355, 385].includes(daysInHebrewYear(year))) return 29; // Cheshvan
  if (month === 9 && [353, 383].includes(daysInHebrewYear(year))) return 29; // Kislev
  return 30;
}

export function absoluteFromHebrew({ year, month, day }: HebrewDate): number {
  let total = day + hebrewElapsedDays(year) + HEBREW_EPOCH_OFFSET;

  if (month < 7) {
    // Months from Tishri to the end of the year, then Nisan up to this month.
    for (let m = 7; m <= lastMonthOfHebrewYear(year); m++) total += daysInHebrewMonth(m, year);
    for (let m = 1; m < month; m++) total += daysInHebrewMonth(m, year);
  } else {
    for (let m = 7; m < month; m++) total += daysInHebrewMonth(m, year);
  }

  return total;
}

export function hebrewFromAbsolute(absolute: number): HebrewDate {
  let year = Math.floor((absolute + HEBREW_EPOCH_OFFSET) / 366);
  while (absolute >= absoluteFromHebrew({ year: year + 1, month: 7, day: 1 })) year += 1;

  // Tishri if on/after 1 Tishri, otherwise start the search at Nisan.
  let month = absolute < absoluteFromHebrew({ year, month: 1, day: 1 }) ? 7 : 1;
  while (
    absolute > absoluteFromHebrew({ year, month, day: daysInHebrewMonth(month, year) })
  ) {
    month += 1;
  }

  const day = absolute - absoluteFromHebrew({ year, month, day: 1 }) + 1;
  return { year, month, day };
}

/**
 * Convert a Gregorian date to a Hebrew date.
 * The Hebrew day begins at nightfall, so an event after sunset belongs to the next Hebrew day.
 */
export function hebrewFromGregorian(date: GregorianDate, afterSunset = false): HebrewDate {
  return hebrewFromAbsolute(absoluteFromGregorian(date) + (afterSunset ? 1 : 0));
}

export function gregorianFromHebrew(date: HebrewDate): GregorianDate {
  return gregorianFromAbsolute(absoluteFromHebrew(date));
}

export function hebrewMonthName(month: number, year: number): string {
  if (month === 12 && isHebrewLeapYear(year)) return 'Adar I';
  return HEBREW_MONTH_NAMES[month] ?? '';
}

export function hebrewMonthNameHe(month: number, year: number): string {
  if (month === 12 && isHebrewLeapYear(year)) return 'אדר א׳';
  return HEBREW_MONTH_NAMES_HE[month] ?? '';
}

const GEMATRIA_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const GEMATRIA_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const GEMATRIA_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** Hebrew numeral (gematria) for a number, with the traditional geresh/gershayim. */
export function toGematria(value: number, withMarks = true): string {
  let n = value;
  let out = '';

  while (n >= 1000) {
    out += GEMATRIA_HUNDREDS[Math.min(Math.floor(n / 1000), 9)];
    n %= 1000;
  }

  out += GEMATRIA_HUNDREDS[Math.floor(n / 100)];
  n %= 100;

  // 15 and 16 are written טו / טז to avoid spelling the Divine Name.
  if (n === 15) out += 'טו';
  else if (n === 16) out += 'טז';
  else {
    out += GEMATRIA_TENS[Math.floor(n / 10)];
    out += GEMATRIA_ONES[n % 10];
  }

  if (!withMarks || out.length === 0) return out;
  if (out.length === 1) return out + '׳';
  return out.slice(0, -1) + '״' + out.slice(-1);
}

/** "21 Av 5786" */
export function formatHebrewDate(date: HebrewDate): string {
  return `${date.day} ${hebrewMonthName(date.month, date.year)} ${date.year}`;
}

/** "כ״א אב תשפ״ו" */
export function formatHebrewDateHe(date: HebrewDate): string {
  const year = date.year % 1000; // Years are conventionally written without the millennium.
  return `${toGematria(date.day)} ${hebrewMonthNameHe(date.month, date.year)} ${toGematria(year)}`;
}

/** The Hebrew year alone, e.g. "5786" — used when only a Gregorian year is known. */
export function hebrewYearRangeForGregorianYear(gregorianYear: number): string {
  const start = hebrewFromGregorian({ year: gregorianYear, month: 1, day: 1 }).year;
  const end = hebrewFromGregorian({ year: gregorianYear, month: 12, day: 31 }).year;
  return start === end ? String(start) : `${start}–${end}`;
}
