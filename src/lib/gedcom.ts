/**
 * Reading GEDCOM.
 *
 * GEDCOM is what every other genealogy program exports, which makes it the way
 * a family's existing tree gets in here without anyone retyping it. This module
 * only *reads* the format into plain structures — nothing here touches the
 * database, so it can be tested against awkward real-world files.
 *
 * The format is a flat list of lines:
 *
 *     0 @I1@ INDI
 *     1 NAME Avraham /Kish/
 *     1 BIRT
 *     2 DATE 11 MAR 1915
 *     2 PLAC Kraków, Poland
 *
 * Indentation is the level number; a record ends when level 0 comes round again.
 */

import { gregorianFromHebrew } from './hebrew';
import { parseDateInput, UNKNOWN_DATE, type FlexibleDate } from './dates';

export type GedcomNode = {
  level: number;
  tag: string;
  /** The record's own identifier, as in `0 @I1@ INDI`. */
  xref?: string;
  value: string;
  children: GedcomNode[];
};

const LINE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

export function parseGedcom(text: string): GedcomNode[] {
  // Strip a byte-order mark and normalise line endings from any platform.
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];

  for (const rawLine of clean.split('\n')) {
    if (!rawLine.trim()) continue;

    const match = rawLine.match(LINE);
    if (!match) continue; // A malformed line is skipped, never fatal.

    const [, levelText, xref, tag, value = ''] = match;
    const level = Number(levelText);

    // Continuation lines belong to the value above them, not to the tree.
    if (tag === 'CONT' || tag === 'CONC') {
      const parent = stack[stack.length - 1];
      if (parent) parent.value += tag === 'CONT' ? `\n${value}` : value;
      continue;
    }

    const node: GedcomNode = { level, tag, value, children: [], ...(xref ? { xref } : {}) };

    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();

    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);

    stack.push(node);
  }

  return roots;
}

export function child(node: GedcomNode | undefined, tag: string): GedcomNode | undefined {
  return node?.children.find((c) => c.tag === tag);
}

export function children(node: GedcomNode | undefined, tag: string): GedcomNode[] {
  return node?.children.filter((c) => c.tag === tag) ?? [];
}

function pointer(value: string): string | null {
  const match = value.trim().match(/^@([^@]+)@$/);
  return match ? match[1] : null;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** Hebrew months as GEDCOM abbreviates them. */
const HEBREW_MONTHS: Record<string, number> = {
  NSN: 1, IYR: 2, SVN: 3, TMZ: 4, AAV: 5, ELL: 6,
  TSH: 7, CSH: 8, KSL: 9, TVT: 10, SHV: 11, ADR: 12, ADS: 13,
};

/**
 * GEDCOM dates, including the vagueness real records are full of:
 * `ABT 1912`, `BEF 1950`, `BET 1904 AND 1906`, `MAY 1948`, `1948`.
 *
 * Hebrew-calendar dates (`@#DHEBREW@ 21 AAV 5786`) are converted, which matters
 * for a family whose older records were kept that way.
 */
export function parseGedcomDate(raw: string): FlexibleDate {
  const input = raw.trim();
  if (!input) return { ...UNKNOWN_DATE };

  const hebrew = input.match(/^@#D?HEBREW@\s*(.*)$/i);
  if (hebrew) return parseHebrewGedcomDate(hebrew[1], input);

  // Other calendar escapes are noted but read as-is.
  const escaped = input.replace(/^@#D?[A-Z_]+@\s*/i, '');

  const between = escaped.match(/^BET(?:WEEN)?\s+(.+?)\s+AND\s+(.+)$/i);
  if (between) {
    const from = parseGedcomDate(between[1]);
    const to = parseGedcomDate(between[2]);
    return {
      value: from.value,
      endValue: to.value,
      precision: 'range',
      qualifier: 'none',
      afterSunset: false,
      text: input,
    };
  }

  const qualified = escaped.match(/^(ABT|EST|CAL|BEF|AFT|FROM|TO)\s+(.+)$/i);
  if (qualified) {
    const [, word, rest] = qualified;
    const inner = parseGedcomDate(rest);
    const qualifier =
      /^(ABT|EST|CAL)$/i.test(word) ? 'about' : /^BEF$/i.test(word) ? 'before' : /^(AFT|FROM)$/i.test(word) ? 'after' : 'none';
    return { ...inner, qualifier: qualifier as FlexibleDate['qualifier'], text: inner.text ?? null };
  }

  const parts = escaped.split(/\s+/).filter(Boolean);
  const day = parts.find((part) => /^\d{1,2}$/.test(part));
  const monthName = parts.find((part) => MONTHS[part.toUpperCase()] !== undefined);
  const year = parts.find((part) => /^\d{3,4}$/.test(part));

  if (year) {
    const month = monthName ? MONTHS[monthName.toUpperCase()] : undefined;
    if (month && day) {
      return {
        value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        precision: 'exact',
        qualifier: 'none',
        endValue: null,
        afterSunset: false,
        text: null,
      };
    }
    if (month) {
      return {
        value: `${year}-${String(month).padStart(2, '0')}`,
        precision: 'month',
        qualifier: 'none',
        endValue: null,
        afterSunset: false,
        text: null,
      };
    }
    return { value: year, precision: 'year', qualifier: 'none', endValue: null, afterSunset: false, text: null };
  }

  // Anything we cannot read is kept exactly as the other program wrote it.
  const fallback = parseDateInput(escaped);
  return fallback.precision === 'unknown' ? { ...UNKNOWN_DATE, text: input } : fallback;
}

function parseHebrewGedcomDate(rest: string, original: string): FlexibleDate {
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  const day = parts.find((part) => /^\d{1,2}$/.test(part));
  const monthKey = parts.find((part) => HEBREW_MONTHS[part.toUpperCase()] !== undefined);
  const year = parts.find((part) => /^\d{4,5}$/.test(part));

  if (!year) return { ...UNKNOWN_DATE, text: original };

  const hebrewYear = Number(year);
  if (day && monthKey) {
    const gregorian = gregorianFromHebrew({
      year: hebrewYear,
      month: HEBREW_MONTHS[monthKey.toUpperCase()],
      day: Number(day),
    });
    return {
      value: `${gregorian.year}-${String(gregorian.month).padStart(2, '0')}-${String(gregorian.day).padStart(2, '0')}`,
      precision: 'exact',
      qualifier: 'none',
      endValue: null,
      afterSunset: false,
      text: original,
    };
  }

  // Without a day, a Hebrew year spans two civil years; record the earlier one
  // approximately rather than inventing a precision the record does not have.
  const gregorian = gregorianFromHebrew({ year: hebrewYear, month: 7, day: 1 });
  return {
    value: String(gregorian.year),
    precision: 'year',
    qualifier: 'about',
    endValue: null,
    afterSunset: false,
    text: original,
  };
}

/* ------------------------------------------------------------------ *
 * Interpretation
 * ------------------------------------------------------------------ */

export type ImportedName = { kind: string; value: string };

export type ImportedPerson = {
  xref: string;
  preferredName: string;
  givenName: string | null;
  familyName: string | null;
  birthName: string | null;
  hebrewName: string | null;
  nicknames: string[];
  alternates: string[];
  gender: 'male' | 'female' | null;
  living: boolean;
  birth: FlexibleDate;
  death: FlexibleDate;
  birthPlace: string | null;
  deathPlace: string | null;
  biography: string | null;
  events: { kind: string; title: string; date: FlexibleDate; place: string | null; description: string | null }[];
  /** Families this person is a child of, and how they joined them. */
  childOf: { family: string; adopted: boolean }[];
};

export type ImportedFamily = {
  xref: string;
  husband: string | null;
  wife: string | null;
  children: { xref: string; adopted: boolean }[];
  status: 'married' | 'divorced' | 'partnered';
  marriage: FlexibleDate;
  divorce: FlexibleDate;
  place: string | null;
};

export type ImportReading = {
  people: ImportedPerson[];
  families: ImportedFamily[];
  warnings: string[];
  /** The program that produced the file, when it says so. */
  source: string | null;
};

const EVENT_TAGS: Record<string, string> = {
  OCCU: 'occupation',
  RESI: 'residence',
  EDUC: 'education',
  IMMI: 'immigration',
  EMIG: 'immigration',
  NATU: 'immigration',
  GRAD: 'education',
  RETI: 'occupation',
  BURI: 'passing',
  BAPM: 'family',
  BARM: 'family',
  BASM: 'family',
  CENS: 'family',
  EVEN: 'custom',
};

function nameParts(value: string): { display: string; given: string | null; surname: string | null } {
  // GEDCOM wraps the surname in slashes: "Avraham /Kish/".
  const match = value.match(/^(.*?)\/([^/]*)\/(.*)$/);
  if (!match) {
    const trimmed = value.trim();
    return { display: trimmed, given: trimmed.split(/\s+/)[0] || null, surname: null };
  }
  const given = match[1].trim();
  const surname = match[2].trim();
  const suffix = match[3].trim();
  const display = [given, surname, suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return { display, given: given || null, surname: surname || null };
}

function placeOf(node: GedcomNode | undefined): string | null {
  const place = child(node, 'PLAC')?.value.trim();
  return place ? place : null;
}

function isHebrew(text: string): boolean {
  return /[֐-׿]/.test(text);
}

export function interpretGedcom(text: string): ImportReading {
  const records = parseGedcom(text);
  const warnings: string[] = [];
  const people: ImportedPerson[] = [];
  const families: ImportedFamily[] = [];

  const header = records.find((record) => record.tag === 'HEAD');
  const source =
    child(child(header, 'SOUR'), 'NAME')?.value || child(header, 'SOUR')?.value || null;

  const encoding = child(child(header, 'CHAR'), 'CHAR')?.value || child(header, 'CHAR')?.value;
  if (encoding && /ANSEL/i.test(encoding)) {
    warnings.push(
      'This file says it is ANSEL encoded. Accented letters may not have come through correctly — re-export as UTF-8 if names look wrong.',
    );
  }

  for (const record of records) {
    if (record.tag === 'INDI' && record.xref) people.push(readPerson(record, warnings));
    if (record.tag === 'FAM' && record.xref) families.push(readFamily(record, warnings));
  }

  // Adoption is recorded in two different places depending on which program
  // wrote the file: the standard puts it on the individual's FAMC, while many
  // programs put it on the family's CHIL. Honour both.
  const byXref = new Map(families.map((family) => [family.xref, family]));
  for (const person of people) {
    for (const membership of person.childOf) {
      if (!membership.adopted) continue;
      const family = byXref.get(membership.family);
      const entry = family?.children.find((kid) => kid.xref === person.xref);
      if (entry) entry.adopted = true;
    }
  }

  if (people.length === 0) {
    warnings.push('No people were found in this file. It may not be a GEDCOM export.');
  }

  return { people, families, warnings, source };
}

function readPerson(record: GedcomNode, warnings: string[]): ImportedPerson {
  const xref = record.xref!.replace(/@/g, '');
  const nameNodes = children(record, 'NAME');
  const primary = nameNodes[0];
  const parsed = primary ? nameParts(primary.value) : { display: 'Unknown', given: null, surname: null };

  const nicknames: string[] = [];
  const alternates: string[] = [];
  let hebrewName: string | null = null;
  let birthName: string | null = null;

  for (const [index, nameNode] of nameNodes.entries()) {
    const nick = child(nameNode, 'NICK')?.value.trim();
    if (nick) nicknames.push(nick);

    const type = child(nameNode, 'TYPE')?.value.trim().toLowerCase();
    const readable = nameParts(nameNode.value).display;

    if (index === 0) {
      // Some programs record the Hebrew name as a second NAME line.
      if (isHebrew(readable)) hebrewName = readable;
      continue;
    }
    if (type === 'birth' || type === 'maiden') birthName = readable;
    else if (isHebrew(readable)) hebrewName = readable;
    else if (readable) alternates.push(readable);
  }

  // A few programs use a custom tag for the Hebrew name.
  for (const tag of ['_HEB', '_HEBN', '_JEWISHNAME']) {
    const custom = child(record, tag)?.value.trim();
    if (custom && !hebrewName) hebrewName = custom;
  }

  const sex = child(record, 'SEX')?.value.trim().toUpperCase();
  const birthNode = child(record, 'BIRT');
  const deathNode = child(record, 'DEAT');

  const birth = birthNode ? parseGedcomDate(child(birthNode, 'DATE')?.value ?? '') : { ...UNKNOWN_DATE };
  const death = deathNode ? parseGedcomDate(child(deathNode, 'DATE')?.value ?? '') : { ...UNKNOWN_DATE };

  // A DEAT tag with no date still means the person has died.
  const living = !deathNode && child(record, 'BURI') === undefined;

  const notes = children(record, 'NOTE')
    .map((note) => note.value.trim())
    .filter(Boolean);

  const events = record.children
    .filter((node) => EVENT_TAGS[node.tag])
    .map((node) => ({
      kind: EVENT_TAGS[node.tag],
      title: eventTitle(node),
      date: parseGedcomDate(child(node, 'DATE')?.value ?? ''),
      place: placeOf(node),
      description: node.value.trim() || child(node, 'NOTE')?.value.trim() || null,
    }));

  const unknownTags = record.children
    .map((node) => node.tag)
    .filter(
      (tag) =>
        !['NAME', 'SEX', 'BIRT', 'DEAT', 'FAMC', 'FAMS', 'NOTE', 'CHAN', 'OBJE', 'SOUR', 'RIN', '_UID', 'REFN'].includes(tag) &&
        !EVENT_TAGS[tag],
    );
  if (unknownTags.length) {
    warnings.push(`Some details on ${parsed.display} were not imported: ${[...new Set(unknownTags)].join(', ')}.`);
  }

  const childOf = children(record, 'FAMC')
    .map((node) => {
      const family = node.value.trim().replace(/@/g, '');
      if (!family) return null;
      const pedigree = child(node, 'PEDI')?.value.trim().toLowerCase();
      return { family, adopted: pedigree === 'adopted' };
    })
    .filter(Boolean) as { family: string; adopted: boolean }[];

  return {
    xref,
    childOf,
    preferredName: parsed.display || 'Unknown',
    givenName: parsed.given,
    familyName: parsed.surname,
    birthName,
    hebrewName,
    nicknames,
    alternates,
    gender: sex === 'M' ? 'male' : sex === 'F' ? 'female' : null,
    living,
    birth,
    death,
    birthPlace: placeOf(birthNode),
    deathPlace: placeOf(deathNode),
    biography: notes.length ? notes.join('\n\n') : null,
    events,
  };
}

function eventTitle(node: GedcomNode): string {
  const type = child(node, 'TYPE')?.value.trim();
  const named: Record<string, string> = {
    OCCU: node.value.trim() || 'Occupation',
    RESI: 'Lived here',
    EDUC: node.value.trim() || 'Education',
    IMMI: 'Immigrated',
    EMIG: 'Emigrated',
    NATU: 'Naturalised',
    GRAD: node.value.trim() || 'Graduated',
    RETI: 'Retired',
    BURI: 'Burial',
    BARM: 'Bar mitzvah',
    BASM: 'Bat mitzvah',
    CENS: 'Census',
  };
  return type || named[node.tag] || node.value.trim() || 'Event';
}

function readFamily(record: GedcomNode, warnings: string[]): ImportedFamily {
  const xref = record.xref!.replace(/@/g, '');
  const husband = pointer(child(record, 'HUSB')?.value ?? '');
  const wife = pointer(child(record, 'WIFE')?.value ?? '');

  const kids = children(record, 'CHIL')
    .map((node) => {
      const ref = pointer(node.value);
      if (!ref) return null;
      const pedigree = child(node, 'PEDI')?.value.trim().toLowerCase();
      return { xref: ref, adopted: pedigree === 'adopted' };
    })
    .filter(Boolean) as { xref: string; adopted: boolean }[];

  const marriageNode = child(record, 'MARR');
  const divorceNode = child(record, 'DIV');

  if (!husband && !wife && kids.length === 0) {
    warnings.push('A family record with nobody in it was skipped.');
  }

  return {
    xref,
    husband,
    wife,
    children: kids,
    status: divorceNode ? 'divorced' : marriageNode ? 'married' : 'partnered',
    marriage: marriageNode ? parseGedcomDate(child(marriageNode, 'DATE')?.value ?? '') : { ...UNKNOWN_DATE },
    divorce: divorceNode ? parseGedcomDate(child(divorceNode, 'DATE')?.value ?? '') : { ...UNKNOWN_DATE },
    place: placeOf(marriageNode),
  };
}
