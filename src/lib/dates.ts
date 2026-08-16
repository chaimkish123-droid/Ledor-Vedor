/**
 * Family dates are rarely tidy. A date may be exact, approximate, a year only,
 * a range, or simply unknown — and every one of those must round-trip cleanly.
 */

import {
  formatHebrewDate,
  formatHebrewDateHe,
  hebrewFromGregorian,
  hebrewYearRangeForGregorianYear,
} from './hebrew';

export type DatePrecision = 'exact' | 'month' | 'year' | 'range' | 'unknown';
export type DateQualifier = 'none' | 'about' | 'before' | 'after';
export type CalendarPreference = 'gregorian' | 'hebrew' | 'both';

export type FlexibleDate = {
  /** ISO-ish and always partial-safe: "1948-05-14", "1948-05", "1948", or "" */
  value: string;
  precision: DatePrecision;
  qualifier: DateQualifier;
  /** Second endpoint for `range` precision, same partial format. */
  endValue?: string | null;
  /** Occurred after nightfall, so the Hebrew date is the following day. */
  afterSunset?: boolean;
  /** Free text preserved verbatim when a family member typed something unparseable. */
  text?: string | null;
};

export const UNKNOWN_DATE: FlexibleDate = {
  value: '',
  precision: 'unknown',
  qualifier: 'none',
  endValue: null,
  afterSunset: false,
  text: null,
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function parseParts(value: string): { year?: number; month?: number; day?: number } {
  if (!value) return {};
  const [y, m, d] = value.split('-');
  const out: { year?: number; month?: number; day?: number } = {};
  if (y && /^\d{1,4}$/.test(y)) out.year = Number(y);
  if (m && /^\d{1,2}$/.test(m)) out.month = Number(m);
  if (d && /^\d{1,2}$/.test(d)) out.day = Number(d);
  return out;
}

export function yearOf(date: FlexibleDate | null | undefined): number | null {
  if (!date || date.precision === 'unknown') return null;
  return parseParts(date.value).year ?? null;
}

export function isKnown(date: FlexibleDate | null | undefined): date is FlexibleDate {
  return !!date && date.precision !== 'unknown' && !!date.value;
}

/**
 * Free-text entry, so nobody is forced through three dropdowns.
 * Accepts "1948", "c. 1948", "May 1948", "14 May 1948", "1948-05-14", "5/14/1948",
 * "about 1948", "before 1950", "1948 or 1949".
 */
export function parseDateInput(raw: string): FlexibleDate {
  const input = raw.trim();
  if (!input) return { ...UNKNOWN_DATE };

  let working = input;
  let qualifier: DateQualifier = 'none';

  const qualifiers: [RegExp, DateQualifier][] = [
    [/^(c\.|ca\.|circa|about|approx\.?|approximately|~)\s*/i, 'about'],
    [/^(before|bef\.?|prior to|<)\s*/i, 'before'],
    [/^(after|aft\.?|>)\s*/i, 'after'],
  ];
  for (const [pattern, kind] of qualifiers) {
    if (pattern.test(working)) {
      working = working.replace(pattern, '');
      qualifier = kind;
      break;
    }
  }

  // "1948 or 1949" / "1948-1949" / "1948–1949"
  const range = working.match(/^(\d{3,4})\s*(?:or|to|[-–—])\s*(\d{3,4})$/i);
  if (range) {
    return {
      value: range[1],
      endValue: range[2],
      precision: 'range',
      qualifier,
      afterSunset: false,
      text: input,
    };
  }

  const isoLike = working.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (isoLike) {
    const [, y, m, d] = isoLike;
    return {
      value: d ? `${y}-${pad(m)}-${pad(d)}` : `${y}-${pad(m)}`,
      precision: d ? 'exact' : 'month',
      qualifier,
      endValue: null,
      afterSunset: false,
      text: null,
    };
  }

  // "14 May 1948" or "May 14, 1948" or "May 1948"
  const monthIndex = MONTH_NAMES.findIndex((name) =>
    new RegExp(`\\b${name.slice(0, 3)}[a-z]*\\b`, 'i').test(working),
  );
  if (monthIndex >= 0) {
    const numbers = working.match(/\d+/g)?.map(Number) ?? [];
    const year = numbers.find((n) => n > 31);
    const day = numbers.find((n) => n <= 31);
    if (year) {
      return {
        value: day
          ? `${year}-${pad(monthIndex + 1)}-${pad(day)}`
          : `${year}-${pad(monthIndex + 1)}`,
        precision: day ? 'exact' : 'month',
        qualifier,
        endValue: null,
        afterSunset: false,
        text: null,
      };
    }
  }

  // "5/14/1948" (US) — day/month ambiguity resolved in favour of month-first,
  // matching the keyboards of the family this is built for.
  const slashed = working.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) {
    const [, a, b, y] = slashed;
    const month = Number(a) <= 12 ? a : b;
    const day = Number(a) <= 12 ? b : a;
    return {
      value: `${y}-${pad(month)}-${pad(day)}`,
      precision: 'exact',
      qualifier,
      endValue: null,
      afterSunset: false,
      text: null,
    };
  }

  const yearOnly = working.match(/^(\d{3,4})$/);
  if (yearOnly) {
    return {
      value: yearOnly[1],
      precision: 'year',
      qualifier,
      endValue: null,
      afterSunset: false,
      text: null,
    };
  }

  // Unparseable but meaningful — keep exactly what the family member wrote.
  return { value: '', precision: 'unknown', qualifier: 'none', endValue: null, afterSunset: false, text: input };
}

function pad(value: string | number): string {
  return String(value).padStart(2, '0');
}

const QUALIFIER_PREFIX: Record<DateQualifier, string> = {
  none: '',
  about: 'c. ',
  before: 'before ',
  after: 'after ',
};

export function formatGregorian(date: FlexibleDate | null | undefined): string {
  if (!date) return '';
  if (date.precision === 'unknown') return date.text ?? '';

  const { year, month, day } = parseParts(date.value);
  if (!year) return date.text ?? '';

  const prefix = QUALIFIER_PREFIX[date.qualifier];

  if (date.precision === 'range') {
    const end = parseParts(date.endValue ?? '').year;
    return `${prefix}${year}${end ? ` or ${end}` : ''}`;
  }
  if (date.precision === 'year' || !month) return `${prefix}${year}`;
  if (date.precision === 'month' || !day) return `${prefix}${MONTH_NAMES[month - 1]} ${year}`;
  return `${prefix}${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

export function formatHebrew(date: FlexibleDate | null | undefined, script: 'latin' | 'hebrew' = 'latin'): string {
  if (!isKnown(date)) return '';
  const { year, month, day } = parseParts(date.value);
  if (!year) return '';

  const prefix = QUALIFIER_PREFIX[date.qualifier];

  // Without a day we cannot pin a single Hebrew date — show the year(s) it spans.
  if (!month || !day || date.precision === 'year' || date.precision === 'range') {
    return `${prefix}${hebrewYearRangeForGregorianYear(year)}`;
  }

  const hebrew = hebrewFromGregorian({ year, month, day }, !!date.afterSunset);
  return prefix + (script === 'hebrew' ? formatHebrewDateHe(hebrew) : formatHebrewDate(hebrew));
}

export function formatDate(
  date: FlexibleDate | null | undefined,
  calendar: CalendarPreference = 'gregorian',
): string {
  if (!date) return '';
  if (calendar === 'gregorian') return formatGregorian(date);
  if (calendar === 'hebrew') return formatHebrew(date) || formatGregorian(date);

  const gregorian = formatGregorian(date);
  const hebrew = formatHebrew(date);
  return hebrew ? `${gregorian} · ${hebrew}` : gregorian;
}

/** "1948–2019", "b. 1948", "1948–" — the compact form shown on a person card. */
export function formatLifespan(
  birth: FlexibleDate | null | undefined,
  death: FlexibleDate | null | undefined,
  living: boolean,
): string {
  const birthYear = yearOf(birth);
  const deathYear = yearOf(death);
  const approx = (date: FlexibleDate | null | undefined, year: number | null) =>
    year === null ? '' : `${date?.qualifier === 'about' ? 'c. ' : ''}${year}`;

  if (birthYear && deathYear) return `${approx(birth, birthYear)}–${approx(death, deathYear)}`;
  if (birthYear && living) return `b. ${approx(birth, birthYear)}`;
  if (birthYear) return `${approx(birth, birthYear)}–`;
  if (deathYear) return `d. ${approx(death, deathYear)}`;
  return '';
}

/** Whole years between two dates, when both are known well enough to be honest about it. */
export function ageBetween(
  birth: FlexibleDate | null | undefined,
  end: FlexibleDate | null | undefined,
): number | null {
  const birthYear = yearOf(birth);
  const endYear = yearOf(end);
  if (birthYear === null || endYear === null) return null;

  const b = parseParts(birth!.value);
  const e = parseParts(end!.value);
  let age = endYear - birthYear;
  if (b.month && e.month && (e.month < b.month || (e.month === b.month && (e.day ?? 0) < (b.day ?? 0)))) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
}

export function ageToday(birth: FlexibleDate | null | undefined): number | null {
  const now = new Date();
  return ageBetween(birth, {
    ...UNKNOWN_DATE,
    value: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    precision: 'exact',
  });
}

/** Sortable key so timelines and sibling rows order sensibly even with partial dates. */
export function sortKey(date: FlexibleDate | null | undefined): number {
  const parts = parseParts(date?.value ?? '');
  if (!parts.year) return Number.MAX_SAFE_INTEGER;
  return parts.year * 10000 + (parts.month ?? 0) * 100 + (parts.day ?? 0);
}
