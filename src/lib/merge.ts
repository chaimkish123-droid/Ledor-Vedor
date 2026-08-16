/**
 * Merging two records of the same person.
 *
 * However careful the duplicate checks are, a family archive that several
 * people add to — and that accepts imports from other programs — will
 * eventually hold one human being twice. Left alone, that is corrosive: the
 * relationship engine sees two people, so cousins come out wrong and half a
 * life is attached to each copy.
 *
 * Merging is the most destructive thing this application can do, so it is
 * hedged accordingly: an administrator only, a verified backup first, one
 * transaction, a snapshot of the absorbed record kept in the history, and a
 * check afterwards that the graph did not fold in on itself.
 */

import { db } from './db';
import { takeBackup } from './backup';
import { formatGregorian, type FlexibleDate } from './dates';
import { dbGraph } from './graph-db';
import { ancestorMap } from './relationships';
import {
  getPerson,
  getSummary,
  nameSimilarity,
  recordRevision,
  updatePerson,
  type Actor,
} from './repo';
import type { Person, PersonSummary } from './types';

export type MergeField = {
  key: MergeFieldKey;
  label: string;
  keepValue: string;
  absorbValue: string;
  /** True when the two records disagree and someone has to choose. */
  conflict: boolean;
};

export type MergeFieldKey =
  | 'preferredName'
  | 'hebrewName'
  | 'birthName'
  | 'gender'
  | 'living'
  | 'birth'
  | 'death'
  | 'birthPlace'
  | 'deathPlace'
  | 'biography';

export type MergePreview = {
  keep: PersonSummary;
  absorb: PersonSummary;
  fields: MergeField[];
  /** What will move across, in plain numbers. */
  brings: {
    parents: number;
    children: number;
    marriages: number;
    memories: number;
    legacy: number;
    events: number;
    photograph: boolean;
    account: boolean;
  };
  /** Reasons this merge must not happen at all. */
  blockers: string[];
};

export type MergeChoices = Partial<Record<MergeFieldKey, 'keep' | 'absorb'>>;

export type MergeOutcome = {
  keepId: string;
  name: string;
  moved: { parents: number; children: number; marriages: number; memories: number; events: number };
  backup: string | null;
};

function describeValue(person: Person, key: MergeFieldKey): string {
  switch (key) {
    case 'preferredName':
      return person.preferredName;
    case 'hebrewName':
      return person.hebrewName ?? '';
    case 'birthName':
      return person.birthName ?? '';
    case 'gender':
      return person.gender ?? '';
    case 'living':
      return person.living ? 'Living' : 'Has died';
    case 'birth':
      return formatGregorian(person.birth);
    case 'death':
      return formatGregorian(person.death);
    case 'birthPlace':
      return person.birthPlace?.display ?? '';
    case 'deathPlace':
      return person.deathPlace?.display ?? '';
    case 'biography':
      return person.biography ?? '';
  }
}

const FIELD_LABELS: [MergeFieldKey, string][] = [
  ['preferredName', 'Name'],
  ['hebrewName', 'Hebrew name'],
  ['birthName', 'Name at birth'],
  ['gender', 'Recorded as'],
  ['living', 'Living'],
  ['birth', 'Born'],
  ['death', 'Passed'],
  ['birthPlace', 'Birthplace'],
  ['deathPlace', 'Place of passing'],
  ['biography', 'About them'],
];

function countRows(sql: string, ...params: unknown[]): number {
  return (db().prepare(sql).get(...(params as [])) as { n: number }).n;
}

export function previewMerge(keepId: string, absorbId: string): MergePreview {
  const keepPerson = getPerson(keepId);
  const absorbPerson = getPerson(absorbId);
  if (!keepPerson || !absorbPerson) throw new Error('One of those people could not be found.');

  const blockers: string[] = [];
  if (keepId === absorbId) blockers.push('That is the same record twice.');

  const graph = dbGraph();
  if (graph.parentsOf(keepId).includes(absorbId) || graph.parentsOf(absorbId).includes(keepId)) {
    blockers.push(
      'These two are recorded as parent and child. That is a relationship to correct, not two copies of one person.',
    );
  }
  if (graph.spousesOf(keepId).includes(absorbId)) {
    blockers.push('These two are recorded as married to each other, so they are not the same person.');
  }

  const fields: MergeField[] = FIELD_LABELS.map(([key, label]) => {
    const keepValue = describeValue(keepPerson, key);
    const absorbValue = describeValue(absorbPerson, key);
    return {
      key,
      label,
      keepValue,
      absorbValue,
      // Only a real disagreement counts: one side being blank is not a choice.
      conflict: !!keepValue && !!absorbValue && keepValue !== absorbValue,
    };
  });

  return {
    keep: getSummary(keepId)!,
    absorb: getSummary(absorbId)!,
    fields,
    brings: {
      parents: countRows('SELECT COUNT(*) AS n FROM parent_child WHERE child_id = ?', absorbId),
      children: countRows('SELECT COUNT(*) AS n FROM parent_child WHERE parent_id = ?', absorbId),
      marriages: countRows('SELECT COUNT(*) AS n FROM union_partner WHERE person_id = ?', absorbId),
      memories: countRows('SELECT COUNT(*) AS n FROM memory_person WHERE person_id = ?', absorbId),
      legacy: countRows('SELECT COUNT(*) AS n FROM legacy_entry WHERE person_id = ?', absorbId),
      events: countRows('SELECT COUNT(*) AS n FROM event_person WHERE person_id = ?', absorbId),
      photograph: countRows('SELECT COUNT(*) AS n FROM photo WHERE person_id = ?', absorbId) > 0,
      account: countRows('SELECT COUNT(*) AS n FROM user WHERE person_id = ?', absorbId) > 0,
    },
    blockers,
  };
}

export async function mergePeople(
  keepId: string,
  absorbId: string,
  choices: MergeChoices,
  actor: Actor,
): Promise<MergeOutcome> {
  const preview = previewMerge(keepId, absorbId);
  if (preview.blockers.length) throw new Error(preview.blockers[0]);

  const keepPerson = getPerson(keepId)!;
  const absorbPerson = getPerson(absorbId)!;

  let backupName: string | null = null;
  try {
    const backup = await takeBackup('before-merge');
    backupName = backup.name;
  } catch (error) {
    throw new Error(
      `The archive could not be backed up, so nothing was merged. (${
        error instanceof Error ? error.message : 'unknown error'
      })`,
    );
  }

  const moved = { parents: 0, children: 0, marriages: 0, memories: 0, events: 0 };
  const database = db();

  // Everything the absorbed record held, kept in the history so an
  // administrator can always see exactly what was folded in.
  const snapshot = database.prepare('SELECT * FROM person WHERE id = ?').get(absorbId) as Record<string, any>;
  const snapshotNames = database.prepare('SELECT kind, value FROM person_name WHERE person_id = ?').all(absorbId);

  database.transaction(() => {
    /* --- Fields the reader chose from the absorbed record ------------ */

    const takeFrom = (key: MergeFieldKey) => choices[key] === 'absorb';
    const patch: Record<string, unknown> = {};

    if (takeFrom('preferredName')) patch.preferredName = absorbPerson.preferredName;
    if (takeFrom('hebrewName')) patch.hebrewName = absorbPerson.hebrewName;
    if (takeFrom('birthName')) patch.birthName = absorbPerson.birthName;
    if (takeFrom('gender')) patch.gender = absorbPerson.gender;
    if (takeFrom('living')) patch.living = absorbPerson.living;
    if (takeFrom('birth')) patch.birth = absorbPerson.birth as FlexibleDate;
    if (takeFrom('death')) patch.death = absorbPerson.death as FlexibleDate;
    if (takeFrom('birthPlace')) patch.birthPlace = absorbPerson.birthPlace?.display ?? null;
    if (takeFrom('deathPlace')) patch.deathPlace = absorbPerson.deathPlace?.display ?? null;
    if (takeFrom('biography')) patch.biography = absorbPerson.biography;

    // Anything the surviving record simply does not have is worth taking.
    for (const [key] of FIELD_LABELS) {
      const field = preview.fields.find((candidate) => candidate.key === key)!;
      if (!field.keepValue && field.absorbValue && choices[key] === undefined) {
        if (key === 'birth') patch.birth = absorbPerson.birth as FlexibleDate;
        else if (key === 'death') patch.death = absorbPerson.death as FlexibleDate;
        else if (key === 'birthPlace') patch.birthPlace = absorbPerson.birthPlace?.display ?? null;
        else if (key === 'deathPlace') patch.deathPlace = absorbPerson.deathPlace?.display ?? null;
        else if (key === 'living') patch.living = absorbPerson.living;
        else (patch as Record<string, unknown>)[key] = (absorbPerson as any)[key];
      }
    }

    /* --- Names: nobody should stop being findable by a name they had -- */

    // Gathered before the fields change, because saving a person rebuilds their
    // name index from the fields — so a name that is about to be replaced has
    // to be captured first or it disappears from search.
    const namesBefore = [
      ...(database
        .prepare('SELECT id, value, normalized FROM person_name WHERE person_id = ?')
        .all(keepId) as { id: string; value: string; normalized: string }[]),
      ...(database
        .prepare('SELECT id, value, normalized FROM person_name WHERE person_id = ?')
        .all(absorbId) as { id: string; value: string; normalized: string }[]),
    ];

    if (Object.keys(patch).length) updatePerson(keepId, patch as never, actor);

    const present = new Set(
      (database.prepare('SELECT normalized FROM person_name WHERE person_id = ?').all(keepId) as {
        normalized: string;
      }[]).map((row) => row.normalized),
    );

    const insertName = database.prepare(
      'INSERT INTO person_name (id, person_id, kind, value, normalized) VALUES (?, ?, ?, ?, ?)',
    );

    for (const name of namesBefore) {
      if (present.has(name.normalized)) continue;
      present.add(name.normalized);
      insertName.run(`${name.id}-merged`, keepId, 'alternate', name.value, name.normalized);
    }

    /* --- Parents and children --------------------------------------- */

    // Re-point edges, dropping any that the surviving record already has.
    const parentEdges = database
      .prepare('SELECT * FROM parent_child WHERE child_id = ?')
      .all(absorbId) as Record<string, any>[];
    for (const edge of parentEdges) {
      const already = database
        .prepare('SELECT 1 FROM parent_child WHERE parent_id = ? AND child_id = ?')
        .get(edge.parent_id, keepId);
      if (already || edge.parent_id === keepId) {
        database.prepare('DELETE FROM parent_child WHERE id = ?').run(edge.id);
      } else {
        database.prepare('UPDATE parent_child SET child_id = ? WHERE id = ?').run(keepId, edge.id);
        moved.parents += 1;
      }
    }

    const childEdges = database
      .prepare('SELECT * FROM parent_child WHERE parent_id = ?')
      .all(absorbId) as Record<string, any>[];
    for (const edge of childEdges) {
      const already = database
        .prepare('SELECT 1 FROM parent_child WHERE parent_id = ? AND child_id = ?')
        .get(keepId, edge.child_id);
      if (already || edge.child_id === keepId) {
        database.prepare('DELETE FROM parent_child WHERE id = ?').run(edge.id);
      } else {
        database.prepare('UPDATE parent_child SET parent_id = ? WHERE id = ?').run(keepId, edge.id);
        moved.children += 1;
      }
    }

    /* --- Marriages --------------------------------------------------- */

    const absorbUnions = database
      .prepare('SELECT union_id, position FROM union_partner WHERE person_id = ?')
      .all(absorbId) as { union_id: string; position: number }[];

    for (const membership of absorbUnions) {
      const keeperAlreadyIn = database
        .prepare('SELECT 1 FROM union_partner WHERE union_id = ? AND person_id = ?')
        .get(membership.union_id, keepId);

      if (keeperAlreadyIn) {
        // Both copies were partners in the same marriage; one row is enough.
        database
          .prepare('DELETE FROM union_partner WHERE union_id = ? AND person_id = ?')
          .run(membership.union_id, absorbId);
      } else {
        database
          .prepare('UPDATE union_partner SET person_id = ? WHERE union_id = ? AND person_id = ?')
          .run(keepId, membership.union_id, absorbId);
        moved.marriages += 1;
      }
    }

    // Two marriages between the same pair are one marriage recorded twice.
    collapseDuplicateUnions(keepId);

    /* --- Everything else the absorbed record carried ------------------ */

    for (const [table, column] of [
      ['memory_person', 'person_id'],
      ['event_person', 'person_id'],
    ] as const) {
      const rows = database.prepare(`SELECT rowid AS rid, * FROM ${table} WHERE ${column} = ?`).all(absorbId) as Record<
        string,
        any
      >[];
      for (const row of rows) {
        const key = table === 'memory_person' ? 'memory_id' : 'event_id';
        const already = database
          .prepare(`SELECT 1 FROM ${table} WHERE ${key} = ? AND ${column} = ?`)
          .get(row[key], keepId);
        if (already) database.prepare(`DELETE FROM ${table} WHERE rowid = ?`).run(row.rid);
        else {
          database.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`).run(keepId, row.rid);
          if (table === 'memory_person') moved.memories += 1;
          else moved.events += 1;
        }
      }
    }

    database.prepare('UPDATE legacy_entry SET person_id = ? WHERE person_id = ?').run(keepId, absorbId);

    // The surviving portrait wins; the other is released with its record.
    const keeperHasPhoto = countRows('SELECT COUNT(*) AS n FROM photo WHERE person_id = ?', keepId) > 0;
    if (keeperHasPhoto) {
      database.prepare('DELETE FROM photo WHERE person_id = ?').run(absorbId);
    } else {
      database.prepare('UPDATE photo SET person_id = ? WHERE person_id = ?').run(keepId, absorbId);
      const moved = database.prepare('SELECT id FROM photo WHERE person_id = ?').get(keepId) as
        | { id: string }
        | undefined;
      if (moved) database.prepare('UPDATE person SET primary_photo_id = ? WHERE id = ?').run(moved.id, keepId);
    }

    // An account must follow its person.
    database.prepare('UPDATE user SET person_id = ? WHERE person_id = ?').run(keepId, absorbId);
    database.prepare('DELETE FROM recently_viewed WHERE person_id = ?').run(absorbId);

    // The absorbed record's own history stays readable under the survivor.
    database
      .prepare("UPDATE revision SET entity_id = ? WHERE entity_type = 'person' AND entity_id = ?")
      .run(keepId, absorbId);

    database.prepare('DELETE FROM person WHERE id = ?').run(absorbId);

    recordRevision({
      entityType: 'person',
      entityId: keepId,
      action: 'update',
      summary: `Merged in a second record of ${absorbPerson.preferredName}`,
      payload: { absorbed: snapshot, names: snapshotNames },
      actor,
    });

    /* --- The graph must still make sense ----------------------------- */

    const graph = dbGraph();
    const ancestors = ancestorMap(graph, keepId);
    if (ancestors.get(keepId) !== 0 || [...ancestors.entries()].some(([id, depth]) => id === keepId && depth > 0)) {
      throw new Error('That merge would make someone their own ancestor, so nothing was changed.');
    }
    for (const childId of graph.childrenOf(keepId)) {
      if (ancestorMap(graph, childId).has(childId) && graph.parentsOf(keepId).includes(childId)) {
        throw new Error('That merge would put the family tree in a loop, so nothing was changed.');
      }
    }
  })();

  return {
    keepId,
    name: getPerson(keepId)?.preferredName ?? keepPerson.preferredName,
    moved,
    backup: backupName,
  };
}

/** Two records of one marriage become one, keeping every child. */
function collapseDuplicateUnions(personId: string) {
  const database = db();
  const unionIds = (
    database.prepare('SELECT union_id FROM union_partner WHERE person_id = ?').all(personId) as {
      union_id: string;
    }[]
  ).map((row) => row.union_id);

  const signature = new Map<string, string>();

  for (const unionId of unionIds) {
    const partners = (
      database.prepare('SELECT person_id FROM union_partner WHERE union_id = ? ORDER BY person_id').all(unionId) as {
        person_id: string;
      }[]
    ).map((row) => row.person_id);

    // A one-sided union carries children and must not be folded away.
    if (partners.length < 2) continue;

    const key = partners.join('|');
    const existing = signature.get(key);

    if (!existing) {
      signature.set(key, unionId);
      continue;
    }

    database.prepare('UPDATE parent_child SET union_id = ? WHERE union_id = ?').run(existing, unionId);
    database.prepare('DELETE FROM union_partner WHERE union_id = ?').run(unionId);
    database.prepare('DELETE FROM union_rel WHERE id = ?').run(unionId);
  }
}

/**
 * Likely duplicates across the whole archive, so nobody has to go looking.
 * Compares every pair once, which is fine for a family and would need an index
 * long before it became a problem.
 */
export function findLikelyDuplicates(limit = 25): {
  a: PersonSummary;
  b: PersonSummary;
  reasons: string[];
  confidence: number;
}[] {
  const rows = db()
    .prepare('SELECT id, preferred_name, birth_value FROM person ORDER BY preferred_name')
    .all() as { id: string; preferred_name: string; birth_value: string | null }[];

  const graph = dbGraph();
  const pairs: { a: PersonSummary; b: PersonSummary; reasons: string[]; confidence: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const first = rows[i];
      const second = rows[j];

      const similarity = nameSimilarity(first.preferred_name, second.preferred_name);
      const sameDay =
        !!first.birth_value && first.birth_value.length >= 10 && first.birth_value === second.birth_value;

      // A shared surname alone is not a signal — half a family shares one.
      // It becomes one when the same day of birth sits beside it.
      if (similarity < 0.6 && !(similarity >= 0.3 && sameDay)) continue;

      // Parent and child often share a name; that is tradition, not duplication.
      if (graph.parentsOf(first.id).includes(second.id) || graph.parentsOf(second.id).includes(first.id)) continue;
      if (graph.spousesOf(first.id).includes(second.id)) continue;

      const reasons: string[] = [similarity >= 0.99 ? 'Same name' : 'Similar name'];
      let confidence = similarity >= 0.99 ? 0.6 : 0.4;

      const yearA = first.birth_value ? Number(first.birth_value.slice(0, 4)) : null;
      const yearB = second.birth_value ? Number(second.birth_value.slice(0, 4)) : null;
      if (yearA && yearB) {
        if (sameDay) {
          confidence += 0.4;
          reasons.push('Born the same day');
        } else if (Math.abs(yearA - yearB) <= 1) {
          confidence += 0.3;
          reasons.push('Born the same year');
        } else {
          continue; // Different birth years is the clearest sign of two people.
        }
      }

      const sharedParents = graph.parentsOf(first.id).filter((id) => graph.parentsOf(second.id).includes(id));
      if (sharedParents.length) {
        confidence += 0.2;
        reasons.push('Same parents');
      }

      if (confidence < 0.55) continue;

      pairs.push({
        a: getSummary(first.id)!,
        b: getSummary(second.id)!,
        reasons,
        confidence: Math.min(1, confidence),
      });
    }
  }

  return pairs.sort((first, second) => second.confidence - first.confidence).slice(0, limit);
}
