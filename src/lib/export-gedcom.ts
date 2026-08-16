/**
 * Writing GEDCOM.
 *
 * A family's history should never be trapped in one application — including
 * this one. Export produces a standard file that any other genealogy program
 * can read, so leaving is always possible. That the same file can be imported
 * straight back is the test that it is honest.
 */

import { db } from './db';
import { parseParts, type FlexibleDate } from './dates';
import { getPerson, getSummaries, unionsOfPerson, parentEdgesOfChild } from './repo';
import type { Person } from './types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function gedcomDate(date: FlexibleDate | null | undefined): string | null {
  if (!date || date.precision === 'unknown' || !date.value) return null;

  const render = (value: string) => {
    const { year, month, day } = parseParts(value);
    if (!year) return null;
    if (month && day) return `${day} ${MONTHS[month - 1]} ${year}`;
    if (month) return `${MONTHS[month - 1]} ${year}`;
    return String(year);
  };

  const main = render(date.value);
  if (!main) return null;

  if (date.precision === 'range' && date.endValue) {
    const end = render(date.endValue);
    if (end) return `BET ${main} AND ${end}`;
  }

  if (date.qualifier === 'about') return `ABT ${main}`;
  if (date.qualifier === 'before') return `BEF ${main}`;
  if (date.qualifier === 'after') return `AFT ${main}`;
  return main;
}

/** Long values are split the way the format expects, on CONT lines. */
function textLines(level: number, tag: string, value: string): string[] {
  const [first, ...rest] = value.split('\n');
  return [`${level} ${tag} ${first}`, ...rest.map((line) => `${level + 1} CONT ${line}`)];
}

export function exportGedcom(options: { familyName?: string } = {}): string {
  const database = db();
  const personIds = (database.prepare('SELECT id FROM person ORDER BY created_at').all() as { id: string }[]).map(
    (row) => row.id,
  );

  const indiOf = new Map<string, string>();
  personIds.forEach((id, index) => indiOf.set(id, `I${index + 1}`));

  const unionRows = database.prepare('SELECT id FROM union_rel ORDER BY created_at').all() as { id: string }[];
  const famOf = new Map<string, string>();
  unionRows.forEach((row, index) => famOf.set(row.id, `F${index + 1}`));

  const lines: string[] = [
    '0 HEAD',
    '1 SOUR LDORVADOR',
    "2 NAME L'Dor VaDor",
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    `1 DATE ${gedcomDate({ value: new Date().toISOString().slice(0, 10), precision: 'exact', qualifier: 'none' })}`,
  ];

  if (options.familyName) lines.push(...textLines(1, 'NOTE', `${options.familyName} family`));

  for (const personId of personIds) {
    const person = getPerson(personId);
    if (!person) continue;
    lines.push(...personLines(person, indiOf, famOf));
  }

  for (const row of unionRows) {
    lines.push(...unionLines(row.id, indiOf, famOf));
  }

  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}

function personLines(person: Person, indiOf: Map<string, string>, famOf: Map<string, string>): string[] {
  const lines: string[] = [`0 @${indiOf.get(person.id)}@ INDI`];

  // GEDCOM wants the surname in slashes.
  const surname = person.familyName ?? '';
  const given = person.givenName ?? person.preferredName.replace(surname, '').trim();
  lines.push(`1 NAME ${given}${surname ? ` /${surname}/` : ''}`.trim());

  const nicknames = db()
    .prepare("SELECT value FROM person_name WHERE person_id = ? AND kind = 'nickname'")
    .all(person.id) as { value: string }[];
  for (const nickname of nicknames) lines.push(`2 NICK ${nickname.value}`);

  if (person.birthName && person.birthName !== person.preferredName) {
    const parts = person.birthName.split(' ');
    const last = parts.length > 1 ? parts.pop()! : '';
    lines.push(`1 NAME ${parts.join(' ')}${last ? ` /${last}/` : ''}`.trim());
    lines.push('2 TYPE birth');
  }

  if (person.hebrewName) {
    lines.push(`1 NAME ${person.hebrewName}`);
    lines.push('2 TYPE hebrew');
  }

  if (person.gender === 'male') lines.push('1 SEX M');
  if (person.gender === 'female') lines.push('1 SEX F');

  const birthDate = gedcomDate(person.birth);
  if (birthDate || person.birthPlace) {
    lines.push('1 BIRT');
    if (birthDate) lines.push(`2 DATE ${birthDate}`);
    if (person.birthPlace) lines.push(`2 PLAC ${person.birthPlace.display}`);
  }

  const deathDate = gedcomDate(person.death);
  if (!person.living || deathDate || person.deathPlace) {
    lines.push('1 DEAT');
    if (deathDate) lines.push(`2 DATE ${deathDate}`);
    if (person.deathPlace) lines.push(`2 PLAC ${person.deathPlace.display}`);
  }

  if (person.biography) lines.push(...textLines(1, 'NOTE', person.biography));

  // Memories and legacy travel as notes: another program has nowhere better to
  // put them, and losing them entirely would be worse.
  const memories = db()
    .prepare(
      `SELECT m.title, m.body, m.contributor_name FROM memory m
       JOIN memory_person mp ON mp.memory_id = m.id WHERE mp.person_id = ?`,
    )
    .all(person.id) as { title: string; body: string; contributor_name: string | null }[];
  for (const memory of memories) {
    lines.push(
      ...textLines(
        1,
        'NOTE',
        `Memory — ${memory.title}\n${memory.body}${memory.contributor_name ? `\nShared by ${memory.contributor_name}` : ''}`,
      ),
    );
  }

  const legacy = db()
    .prepare('SELECT title, body FROM legacy_entry WHERE person_id = ?')
    .all(person.id) as { title: string | null; body: string }[];
  for (const entry of legacy) {
    lines.push(...textLines(1, 'NOTE', `Legacy${entry.title ? ` — ${entry.title}` : ''}\n${entry.body}`));
  }

  for (const union of unionsOfPerson(person.id)) {
    const fam = famOf.get(union.id);
    if (fam) lines.push(`1 FAMS @${fam}@`);
  }

  for (const edge of parentEdgesOfChild(person.id)) {
    const fam = edge.unionId ? famOf.get(edge.unionId) : null;
    if (fam) {
      lines.push(`1 FAMC @${fam}@`);
      if (edge.kind === 'adoptive') lines.push('2 PEDI adopted');
    }
  }

  return lines;
}

function unionLines(unionId: string, indiOf: Map<string, string>, famOf: Map<string, string>): string[] {
  const database = db();
  const row = database.prepare('SELECT * FROM union_rel WHERE id = ?').get(unionId) as Record<string, any>;
  const partners = database
    .prepare('SELECT person_id FROM union_partner WHERE union_id = ? ORDER BY position')
    .all(unionId) as { person_id: string }[];
  const kids = database
    .prepare('SELECT DISTINCT child_id FROM parent_child WHERE union_id = ?')
    .all(unionId) as { child_id: string }[];

  const lines: string[] = [`0 @${famOf.get(unionId)}@ FAM`];

  const summaries = getSummaries(partners.map((partner) => partner.person_id));
  // GEDCOM insists on husband and wife; where gender is unrecorded, order stands in.
  const male = summaries.find((summary) => summary.gender === 'male');
  const female = summaries.find((summary) => summary.gender === 'female');
  const husband = male ?? summaries.find((s) => s !== female);
  const wife = female ?? summaries.find((s) => s !== husband);

  if (husband && indiOf.has(husband.id)) lines.push(`1 HUSB @${indiOf.get(husband.id)}@`);
  if (wife && indiOf.has(wife.id)) lines.push(`1 WIFE @${indiOf.get(wife.id)}@`);

  for (const kid of kids) {
    const ref = indiOf.get(kid.child_id);
    if (ref) lines.push(`1 CHIL @${ref}@`);
  }

  const marriage = gedcomDate({
    value: row.start_value ?? '',
    precision: row.start_precision ?? 'unknown',
    qualifier: row.start_qualifier ?? 'none',
  });
  const place = row.place_id
    ? (database.prepare('SELECT display FROM place WHERE id = ?').get(row.place_id) as { display: string } | undefined)
    : undefined;

  if (marriage || place || row.status === 'married') {
    lines.push('1 MARR');
    if (marriage) lines.push(`2 DATE ${marriage}`);
    if (place) lines.push(`2 PLAC ${place.display}`);
  }

  if (row.status === 'divorced') {
    lines.push('1 DIV');
    const ended = gedcomDate({
      value: row.end_value ?? '',
      precision: row.end_precision ?? 'unknown',
      qualifier: row.end_qualifier ?? 'none',
    });
    if (ended) lines.push(`2 DATE ${ended}`);
  }

  return lines;
}
