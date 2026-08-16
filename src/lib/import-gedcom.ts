/**
 * Bringing an existing family tree into the archive.
 *
 * Two rules shape this:
 *
 *   1. Nothing is imported until the person doing it has seen what will happen.
 *      Import runs as preview-then-apply, never as a single irreversible click.
 *   2. Applying takes a verified backup first and runs in one transaction, so a
 *      file that turns out to be malformed halfway through leaves the family's
 *      archive exactly as it was.
 */

import { db } from './db';
import { takeBackup } from './backup';
import { interpretGedcom, type ImportedFamily, type ImportedPerson } from './gedcom';
import { formatGregorian } from './dates';
import {
  createEvent,
  createPerson,
  createUnion,
  findDuplicates,
  getSummary,
  linkParentChild,
  recordRevision,
  type Actor,
} from './repo';

export type ImportMatch = {
  xref: string;
  incomingName: string;
  incomingYears: string;
  existingId: string;
  existingName: string;
  existingYears: string;
  reasons: string[];
  confidence: number;
};

export type ImportPreview = {
  source: string | null;
  counts: { people: number; families: number; events: number };
  /** A handful of people, so the reader can see the file was understood. */
  sample: { name: string; years: string; detail: string }[];
  matches: ImportMatch[];
  warnings: string[];
};

export type ImportOutcome = {
  added: number;
  linked: number;
  unions: number;
  relationships: number;
  events: number;
  backup: string | null;
};

function years(person: ImportedPerson): string {
  const birth = formatGregorian(person.birth);
  const death = formatGregorian(person.death);
  if (birth && death) return `${birth} – ${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return '';
}

/** Read the file and report what importing it would do. Touches nothing. */
export function previewImport(text: string): ImportPreview {
  const reading = interpretGedcom(text);

  const matches: ImportMatch[] = [];
  for (const person of reading.people) {
    const birthYear = person.birth.value ? Number(person.birth.value.slice(0, 4)) : null;
    const candidates = findDuplicates({
      name: person.preferredName,
      birthYear: Number.isFinite(birthYear) ? birthYear : null,
    });

    const best = candidates[0];
    // Only worth mentioning when it is likely to be the same human being.
    if (best && best.confidence >= 0.6) {
      matches.push({
        xref: person.xref,
        incomingName: person.preferredName,
        incomingYears: years(person),
        existingId: best.person.id,
        existingName: best.person.preferredName,
        existingYears: best.person.lifespan,
        reasons: best.reasons,
        confidence: best.confidence,
      });
    }
  }

  return {
    source: reading.source,
    counts: {
      people: reading.people.length,
      families: reading.families.length,
      events: reading.people.reduce((total, person) => total + person.events.length, 0),
    },
    sample: reading.people.slice(0, 8).map((person) => ({
      name: person.preferredName,
      years: years(person),
      detail: [person.birthPlace, person.hebrewName].filter(Boolean).join(' · '),
    })),
    matches: matches.sort((a, b) => b.confidence - a.confidence),
    warnings: reading.warnings,
  };
}

export type ImportOptions = {
  /**
   * People the reader confirmed are already here, as incoming xref → existing
   * person id. Their relationships are attached to the person we already have
   * rather than creating a second record for the same human being.
   */
  linkTo?: Record<string, string>;
};

export async function applyImport(
  text: string,
  actor: Actor,
  options: ImportOptions = {},
): Promise<ImportOutcome> {
  const reading = interpretGedcom(text);
  if (reading.people.length === 0) {
    throw new Error('There are no people in this file to import.');
  }

  // Before anything is written: a verified copy of the archive as it stands.
  let backupName: string | null = null;
  try {
    const backup = await takeBackup('before-import');
    backupName = backup.name;
  } catch (error) {
    throw new Error(
      `The archive could not be backed up, so the import was not started. (${
        error instanceof Error ? error.message : 'unknown error'
      })`,
    );
  }

  const linkTo = options.linkTo ?? {};
  const outcome: ImportOutcome = {
    added: 0,
    linked: 0,
    unions: 0,
    relationships: 0,
    events: 0,
    backup: backupName,
  };

  const idByXref = new Map<string, string>();

  db().transaction(() => {
    for (const person of reading.people) {
      const existing = linkTo[person.xref];
      if (existing && getSummary(existing)) {
        idByXref.set(person.xref, existing);
        outcome.linked += 1;
        continue;
      }

      const personId = createPerson(
        {
          preferredName: person.preferredName,
          givenName: person.givenName,
          familyName: person.familyName,
          birthName: person.birthName,
          hebrewName: person.hebrewName,
          gender: person.gender,
          living: person.living,
          birth: person.birth,
          death: person.death,
          birthPlace: person.birthPlace,
          deathPlace: person.deathPlace,
          biography: person.biography,
          nicknames: person.nicknames,
          alternates: person.alternates,
        },
        actor,
      );

      idByXref.set(person.xref, personId);
      outcome.added += 1;

      for (const event of person.events) {
        createEvent(
          {
            kind: event.kind,
            title: event.title,
            description: event.description ?? undefined,
            date: event.date,
            place: event.place,
            personIds: [personId],
          },
          actor,
        );
        outcome.events += 1;
      }
    }

    for (const family of reading.families) {
      applyFamily(family, idByXref, actor, outcome);
    }

    recordRevision({
      entityType: 'import',
      entityId: backupName ?? 'import',
      action: 'create',
      summary:
        `Imported ${outcome.added} people and ${outcome.unions} marriages` +
        (outcome.linked ? `, joined to ${outcome.linked} already here` : '') +
        (reading.source ? ` from ${reading.source}` : ''),
      actor,
    });
  })();

  return outcome;
}

function applyFamily(
  family: ImportedFamily,
  idByXref: Map<string, string>,
  actor: Actor,
  outcome: ImportOutcome,
) {
  const husbandId = family.husband ? idByXref.get(family.husband) : undefined;
  const wifeId = family.wife ? idByXref.get(family.wife) : undefined;
  const partnerIds = [husbandId, wifeId].filter(Boolean) as string[];

  let unionId: string | null = null;

  // A union is worth recording even with one known partner: it is what the
  // children of that relationship hang from.
  if (partnerIds.length > 0) {
    unionId = createUnion(
      partnerIds,
      {
        status: family.status,
        start: family.marriage,
        end: family.divorce,
        place: family.place,
      },
      actor,
    );
    if (partnerIds.length > 1) outcome.unions += 1;
  }

  for (const kid of family.children) {
    const childId = idByXref.get(kid.xref);
    if (!childId) continue;

    for (const parentId of partnerIds) {
      linkParentChild(
        parentId,
        childId,
        { unionId, kind: kid.adopted ? 'adoptive' : 'biological' },
        actor,
      );
      outcome.relationships += 1;
    }
  }
}
