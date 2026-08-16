import { db, id as newId, normalize, now } from './db';
import { formatLifespan, sortKey, type FlexibleDate, UNKNOWN_DATE } from './dates';
import type {
  Frontier,
  GraphSlice,
  LegacyEntry,
  LifeEvent,
  Memory,
  ParentEdge,
  Person,
  PersonSummary,
  Place,
  Revision,
  Union,
} from './types';

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

type Row = Record<string, any>;

function dateFrom(row: Row, prefix: string): FlexibleDate {
  return {
    value: row[`${prefix}_value`] ?? '',
    precision: row[`${prefix}_precision`] ?? 'unknown',
    qualifier: row[`${prefix}_qualifier`] ?? 'none',
    endValue: row[`${prefix}_end_value`] ?? null,
    afterSunset: !!row[`${prefix}_after_sunset`],
    text: row[`${prefix}_text`] ?? null,
  };
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function toSummary(row: Row): PersonSummary {
  const birth = dateFrom(row, 'birth');
  const death = dateFrom(row, 'death');
  return {
    id: row.id,
    preferredName: row.preferred_name,
    hebrewName: row.hebrew_name ?? null,
    gender: row.gender ?? null,
    living: !!row.living,
    birth,
    death,
    lifespan: formatLifespan(birth, death, !!row.living),
    initials: initials(row.preferred_name),
    birthPlace: row.birth_place_display ?? null,
  };
}

function toPlace(row: Row | undefined, prefix = ''): Place | null {
  const idKey = `${prefix}id`;
  if (!row || !row[idKey]) return null;
  return {
    id: row[idKey],
    display: row[`${prefix}display`],
    city: row[`${prefix}city`] ?? null,
    region: row[`${prefix}region`] ?? null,
    country: row[`${prefix}country`] ?? null,
  };
}

function toPerson(row: Row): Person {
  return {
    id: row.id,
    preferredName: row.preferred_name,
    givenName: row.given_name ?? null,
    familyName: row.family_name ?? null,
    birthName: row.birth_name ?? null,
    hebrewName: row.hebrew_name ?? null,
    gender: row.gender ?? null,
    living: !!row.living,
    birth: dateFrom(row, 'birth'),
    death: dateFrom(row, 'death'),
    birthPlace: row.bp_id
      ? { id: row.bp_id, display: row.bp_display, city: row.bp_city, region: row.bp_region, country: row.bp_country }
      : null,
    deathPlace: row.dp_id
      ? { id: row.dp_id, display: row.dp_display, city: row.dp_city, region: row.dp_region, country: row.dp_country }
      : null,
    biography: row.biography ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PERSON_SELECT = `
  SELECT p.*,
         bp.id AS bp_id, bp.display AS bp_display, bp.city AS bp_city, bp.region AS bp_region, bp.country AS bp_country,
         dp.id AS dp_id, dp.display AS dp_display, dp.city AS dp_city, dp.region AS dp_region, dp.country AS dp_country,
         bp.display AS birth_place_display
  FROM person p
  LEFT JOIN place bp ON bp.id = p.birth_place_id
  LEFT JOIN place dp ON dp.id = p.death_place_id
`;

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export function getPerson(personId: string): Person | null {
  const row = db().prepare(`${PERSON_SELECT} WHERE p.id = ?`).get(personId) as Row | undefined;
  return row ? toPerson(row) : null;
}

export function getSummaries(ids: string[]): PersonSummary[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db()
    .prepare(`${PERSON_SELECT} WHERE p.id IN (${placeholders})`)
    .all(...ids) as Row[];
  return rows.map(toSummary);
}

export function getSummary(personId: string): PersonSummary | null {
  return getSummaries([personId])[0] ?? null;
}

export function personCount(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM person').get() as Row).n;
}

export function getAlternateNames(personId: string): { kind: string; value: string }[] {
  return db()
    .prepare(`SELECT kind, value FROM person_name WHERE person_id = ? AND kind NOT IN ('preferred','given','family')`)
    .all(personId) as { kind: string; value: string }[];
}

export function parentEdgesOfChild(childId: string): ParentEdge[] {
  return (db().prepare('SELECT * FROM parent_child WHERE child_id = ?').all(childId) as Row[]).map(
    (r) => ({ id: r.id, parentId: r.parent_id, childId: r.child_id, unionId: r.union_id, kind: r.kind }),
  );
}

export function parentEdgesOfParent(parentId: string): ParentEdge[] {
  return (db().prepare('SELECT * FROM parent_child WHERE parent_id = ?').all(parentId) as Row[]).map(
    (r) => ({ id: r.id, parentId: r.parent_id, childId: r.child_id, unionId: r.union_id, kind: r.kind }),
  );
}

export function parentIdsOf(childId: string): string[] {
  return (db().prepare('SELECT parent_id FROM parent_child WHERE child_id = ?').all(childId) as Row[]).map(
    (r) => r.parent_id,
  );
}

export function childIdsOf(parentId: string): string[] {
  return (db().prepare('SELECT child_id FROM parent_child WHERE parent_id = ?').all(parentId) as Row[]).map(
    (r) => r.child_id,
  );
}

/** Full and half siblings — anyone sharing at least one parent. */
export function siblingIdsOf(personId: string): string[] {
  const rows = db()
    .prepare(
      `SELECT DISTINCT sib.child_id AS id
       FROM parent_child mine
       JOIN parent_child sib ON sib.parent_id = mine.parent_id
       WHERE mine.child_id = ? AND sib.child_id != ?`,
    )
    .all(personId, personId) as Row[];
  return rows.map((r) => r.id);
}

export function unionIdsOf(personId: string): string[] {
  return (db().prepare('SELECT union_id FROM union_partner WHERE person_id = ?').all(personId) as Row[]).map(
    (r) => r.union_id,
  );
}

export function getUnions(unionIds: string[]): Union[] {
  if (unionIds.length === 0) return [];
  const placeholders = unionIds.map(() => '?').join(',');
  const rows = db()
    .prepare(
      `SELECT u.*, pl.id AS pl_id, pl.display AS pl_display, pl.city AS pl_city, pl.region AS pl_region, pl.country AS pl_country
       FROM union_rel u LEFT JOIN place pl ON pl.id = u.place_id
       WHERE u.id IN (${placeholders})`,
    )
    .all(...unionIds) as Row[];

  const partnerRows = db()
    .prepare(`SELECT * FROM union_partner WHERE union_id IN (${placeholders}) ORDER BY position`)
    .all(...unionIds) as Row[];
  const childRows = db()
    .prepare(`SELECT * FROM parent_child WHERE union_id IN (${placeholders})`)
    .all(...unionIds) as Row[];

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    partnerIds: partnerRows.filter((p) => p.union_id === row.id).map((p) => p.person_id),
    childIds: [...new Set(childRows.filter((c) => c.union_id === row.id).map((c) => c.child_id))] as string[],
    start: {
      value: row.start_value ?? '',
      precision: row.start_precision ?? 'unknown',
      qualifier: row.start_qualifier ?? 'none',
      endValue: null,
    },
    end: {
      value: row.end_value ?? '',
      precision: row.end_precision ?? 'unknown',
      qualifier: row.end_qualifier ?? 'none',
      endValue: null,
    },
    place: toPlace(row, 'pl_'),
    note: row.note ?? null,
  }));
}

export function unionsOfPerson(personId: string): Union[] {
  return getUnions(unionIdsOf(personId)).sort((a, b) => sortKey(a.start) - sortKey(b.start));
}

export function spouseIdsOf(personId: string): string[] {
  return unionsOfPerson(personId)
    .flatMap((u) => u.partnerIds)
    .filter((pid) => pid !== personId);
}

/* ------------------------------------------------------------------ *
 * Neighborhood — the progressive-expansion core.
 *
 * The complete family lives in the database; this returns only the part
 * that is relevant to the current focus, plus counts describing what lies
 * just beyond so the interface can offer "+ 7 more" rather than an edge.
 * ------------------------------------------------------------------ */

export type NeighborhoodOptions = {
  ancestorDepth?: number;
  descendantDepth?: number;
  /** People whose collapsed relatives the viewer explicitly opened. */
  expanded?: string[];
  /** Hard ceiling so a 5,000-person family can never stall the canvas. */
  budget?: number;
};

export function neighborhood(focusId: string, options: NeighborhoodOptions = {}): GraphSlice {
  const ancestorDepth = options.ancestorDepth ?? 2;
  const descendantDepth = options.descendantDepth ?? 2;
  const expanded = new Set(options.expanded ?? []);
  const budget = options.budget ?? 400;

  const included = new Set<string>();
  const generation = new Map<string, number>(); // + is older, − is younger

  const add = (personId: string, gen: number) => {
    if (included.size >= budget && !included.has(personId)) return false;
    if (!included.has(personId)) {
      included.add(personId);
      generation.set(personId, gen);
    }
    return true;
  };

  add(focusId, 0);

  // Upward: parents, grandparents, … Siblings of ancestors join only when opened,
  // otherwise a great-aunt's descendants would flood the canvas on first paint.
  let frontierUp: string[] = [focusId];
  for (let depth = 0; depth < ancestorDepth; depth++) {
    const next: string[] = [];
    for (const personId of frontierUp) {
      for (const parentId of parentIdsOf(personId)) {
        if (add(parentId, depth + 1)) next.push(parentId);
      }
    }
    frontierUp = next;
  }

  // The focus person's own siblings are always part of their immediate context.
  for (const sibId of siblingIdsOf(focusId)) add(sibId, 0);

  // Anyone explicitly expanded contributes their siblings and children too.
  for (const personId of expanded) {
    if (!included.has(personId)) continue;
    const gen = generation.get(personId) ?? 0;
    for (const sibId of siblingIdsOf(personId)) add(sibId, gen);
    for (const childId of childIdsOf(personId)) add(childId, gen - 1);
    for (const parentId of parentIdsOf(personId)) add(parentId, gen + 1);
  }

  // Downward from the focus person.
  let frontierDown: string[] = [focusId];
  for (let depth = 0; depth < descendantDepth; depth++) {
    const next: string[] = [];
    for (const personId of frontierDown) {
      for (const childId of childIdsOf(personId)) {
        if (add(childId, -(depth + 1))) next.push(childId);
      }
    }
    frontierDown = next;
  }

  // Spouses of everyone included: a couple is never split across the boundary.
  for (const personId of [...included]) {
    for (const spouseId of spouseIdsOf(personId)) add(spouseId, generation.get(personId) ?? 0);
  }

  const ids = [...included];
  const persons: Record<string, PersonSummary> = {};
  for (const summary of getSummaries(ids)) persons[summary.id] = summary;

  const unionIds = new Set<string>();
  for (const personId of ids) for (const unionId of unionIdsOf(personId)) unionIds.add(unionId);

  const unions: Record<string, Union> = {};
  for (const union of getUnions([...unionIds])) {
    unions[union.id] = {
      ...union,
      // Only mention children that are actually loaded; counts cover the rest.
      childIds: union.childIds.filter((cid) => included.has(cid)),
    };
  }

  const parentEdges: ParentEdge[] = [];
  for (const personId of ids) {
    for (const edge of parentEdgesOfChild(personId)) {
      if (included.has(edge.parentId)) parentEdges.push(edge);
    }
  }

  const frontier: Record<string, Frontier> = {};
  for (const personId of ids) {
    const parents = parentIdsOf(personId);
    const children = childIdsOf(personId);
    const siblings = siblingIdsOf(personId);
    const spouses = spouseIdsOf(personId);
    frontier[personId] = {
      parents: parents.length,
      children: children.length,
      siblings: siblings.length,
      spouses: spouses.length,
      moreUp: parents.some((pid) => !included.has(pid)),
      moreDown: children.some((cid) => !included.has(cid)),
    };
  }

  return { persons, unions, parentEdges, frontier };
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

export type SearchHit = {
  person: PersonSummary;
  matchedName: string;
  matchedKind: string;
};

export function searchPersons(query: string, limit = 20): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];

  const rows = db()
    .prepare(
      `SELECT pn.person_id, pn.value, pn.kind, pn.normalized
       FROM person_name pn
       WHERE pn.normalized LIKE ? OR pn.value LIKE ?
       LIMIT 300`,
    )
    .all(`%${q}%`, `%${query.trim()}%`) as Row[];

  // Rank: whole-word prefix beats mid-string; preferred names beat nicknames.
  const seen = new Map<string, { value: string; kind: string; score: number }>();
  for (const row of rows) {
    const norm: string = row.normalized;
    let score = 0;
    if (norm === q) score = 100;
    else if (norm.startsWith(q)) score = 70;
    else if (norm.split(' ').some((w: string) => w.startsWith(q))) score = 50;
    else score = 20;
    if (row.kind === 'preferred') score += 10;
    if (row.kind === 'hebrew') score += 5;

    const existing = seen.get(row.person_id);
    if (!existing || existing.score < score) {
      seen.set(row.person_id, { value: row.value, kind: row.kind, score });
    }
  }

  const ranked = [...seen.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);
  const summaries = new Map(getSummaries(ranked.map(([pid]) => pid)).map((s) => [s.id, s]));

  return ranked
    .map(([personId, meta]) => {
      const person = summaries.get(personId);
      return person ? { person, matchedName: meta.value, matchedKind: meta.kind } : null;
    })
    .filter(Boolean) as SearchHit[];
}

/* ------------------------------------------------------------------ *
 * Duplicate detection
 * ------------------------------------------------------------------ */

export type DuplicateCandidate = {
  person: PersonSummary;
  reasons: string[];
  confidence: number;
};

function nameSimilarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const xWords = new Set(x.split(' '));
  const yWords = new Set(y.split(' '));
  const shared = [...xWords].filter((w) => yWords.has(w)).length;
  const union = new Set([...xWords, ...yWords]).size;
  const jaccard = union ? shared / union : 0;

  // Also reward a shared given name with a differing surname (maiden names).
  const firstMatch = x.split(' ')[0] === y.split(' ')[0] ? 0.35 : 0;
  return Math.min(1, jaccard + firstMatch);
}

export function findDuplicates(input: {
  name: string;
  birthYear?: number | null;
  parentIds?: string[];
  spouseIds?: string[];
  excludeId?: string;
}): DuplicateCandidate[] {
  const candidates = new Map<string, DuplicateCandidate>();
  const nameRows = db().prepare('SELECT person_id, value FROM person_name').all() as Row[];

  const byPerson = new Map<string, string[]>();
  for (const row of nameRows) {
    const list = byPerson.get(row.person_id) ?? [];
    list.push(row.value);
    byPerson.set(row.person_id, list);
  }

  for (const [personId, names] of byPerson) {
    if (personId === input.excludeId) continue;
    const best = Math.max(...names.map((n) => nameSimilarity(input.name, n)));
    if (best < 0.5) continue;

    const reasons: string[] = [best >= 0.99 ? 'Same name' : 'Similar name'];
    let confidence = best * 0.6;

    const summary = getSummary(personId);
    if (!summary) continue;

    if (input.birthYear) {
      const year = summary.birth.value ? Number(summary.birth.value.slice(0, 4)) : null;
      if (year && Math.abs(year - input.birthYear) <= 1) {
        confidence += 0.25;
        reasons.push(`Born ${year}`);
      } else if (year && Math.abs(year - input.birthYear) > 5) {
        confidence -= 0.3;
      }
    }

    if (input.parentIds?.length) {
      const shared = parentIdsOf(personId).filter((pid) => input.parentIds!.includes(pid));
      if (shared.length) {
        confidence += 0.3;
        reasons.push('Same parents');
      }
    }

    if (input.spouseIds?.length) {
      const shared = spouseIdsOf(personId).filter((pid) => input.spouseIds!.includes(pid));
      if (shared.length) {
        confidence += 0.3;
        reasons.push('Same spouse');
      }
    }

    if (confidence >= 0.45) {
      candidates.set(personId, { person: summary, reasons, confidence: Math.min(1, confidence) });
    }
  }

  return [...candidates.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/* ------------------------------------------------------------------ *
 * Writes — every one of which leaves a revision behind
 * ------------------------------------------------------------------ */

export type Actor = { id: string | null; name: string };

export function recordRevision(input: {
  entityType: string;
  entityId: string;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  summary?: string | null;
  actor: Actor;
}) {
  db()
    .prepare(
      `INSERT INTO revision (id, entity_type, entity_id, action, field, old_value, new_value, summary, user_id, user_name, created_at)
       VALUES (@id, @entityType, @entityId, @action, @field, @oldValue, @newValue, @summary, @userId, @userName, @createdAt)`,
    )
    .run({
      id: newId(),
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      field: input.field ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      summary: input.summary ?? null,
      userId: input.actor.id,
      userName: input.actor.name,
      createdAt: now(),
    });
}

export function upsertPlace(display: string): string | null {
  const text = display.trim();
  if (!text) return null;
  const norm = normalize(text);
  const existing = db().prepare('SELECT id FROM place WHERE normalized = ?').get(norm) as Row | undefined;
  if (existing) return existing.id;

  const parts = text.split(',').map((p) => p.trim());
  const placeId = newId();
  db()
    .prepare(
      `INSERT INTO place (id, display, normalized, city, region, country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      placeId,
      text,
      norm,
      parts[0] ?? null,
      parts.length > 2 ? parts[1] : parts.length === 2 ? parts[1] : null,
      parts.length > 2 ? parts[parts.length - 1] : null,
      now(),
    );
  return placeId;
}

type NameFields = {
  preferredName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  birthName?: string | null;
  hebrewName?: string | null;
  nicknames?: string[];
  alternates?: string[];
};

export function syncNames(personId: string, person: NameFields) {
  const database = db();
  database.prepare('DELETE FROM person_name WHERE person_id = ?').run(personId);

  const insert = database.prepare(
    'INSERT INTO person_name (id, person_id, kind, value, normalized) VALUES (?, ?, ?, ?, ?)',
  );
  const entries: [string, string | null | undefined][] = [
    ['preferred', person.preferredName],
    ['given', person.givenName],
    ['family', person.familyName],
    ['birth', person.birthName],
    ['hebrew', person.hebrewName],
    ...(person.nicknames ?? []).map((n) => ['nickname', n] as [string, string]),
    ...(person.alternates ?? []).map((n) => ['alternate', n] as [string, string]),
  ];

  const seen = new Set<string>();
  for (const [kind, value] of entries) {
    if (!value || !value.trim()) continue;
    const key = `${kind}:${value.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    insert.run(newId(), personId, kind, value.trim(), normalize(value));
  }
}

export type PersonInput = {
  preferredName: string;
  givenName?: string | null;
  familyName?: string | null;
  birthName?: string | null;
  hebrewName?: string | null;
  gender?: string | null;
  living?: boolean;
  birth?: FlexibleDate;
  death?: FlexibleDate;
  birthPlace?: string | null;
  deathPlace?: string | null;
  biography?: string | null;
  nicknames?: string[];
  alternates?: string[];
};

export function createPerson(input: PersonInput, actor: Actor): string {
  const personId = newId();
  const birth = input.birth ?? UNKNOWN_DATE;
  const death = input.death ?? UNKNOWN_DATE;
  const living = input.living ?? !(death.precision !== 'unknown');

  db()
    .prepare(
      `INSERT INTO person (
        id, preferred_name, given_name, family_name, birth_name, hebrew_name, gender, living,
        birth_value, birth_precision, birth_qualifier, birth_end_value, birth_after_sunset, birth_text, birth_place_id,
        death_value, death_precision, death_qualifier, death_end_value, death_after_sunset, death_text, death_place_id,
        biography, created_at, created_by, updated_at, updated_by
      ) VALUES (
        @id, @preferredName, @givenName, @familyName, @birthName, @hebrewName, @gender, @living,
        @birthValue, @birthPrecision, @birthQualifier, @birthEndValue, @birthAfterSunset, @birthText, @birthPlaceId,
        @deathValue, @deathPrecision, @deathQualifier, @deathEndValue, @deathAfterSunset, @deathText, @deathPlaceId,
        @biography, @createdAt, @actorId, @createdAt, @actorId
      )`,
    )
    .run({
      id: personId,
      preferredName: input.preferredName.trim(),
      givenName: input.givenName ?? null,
      familyName: input.familyName ?? null,
      birthName: input.birthName ?? null,
      hebrewName: input.hebrewName ?? null,
      gender: input.gender ?? null,
      living: living ? 1 : 0,
      birthValue: birth.value,
      birthPrecision: birth.precision,
      birthQualifier: birth.qualifier,
      birthEndValue: birth.endValue ?? null,
      birthAfterSunset: birth.afterSunset ? 1 : 0,
      birthText: birth.text ?? null,
      birthPlaceId: input.birthPlace ? upsertPlace(input.birthPlace) : null,
      deathValue: death.value,
      deathPrecision: death.precision,
      deathQualifier: death.qualifier,
      deathEndValue: death.endValue ?? null,
      deathAfterSunset: death.afterSunset ? 1 : 0,
      deathText: death.text ?? null,
      deathPlaceId: input.deathPlace ? upsertPlace(input.deathPlace) : null,
      biography: input.biography ?? null,
      createdAt: now(),
      actorId: actor.id,
    });

  syncNames(personId, { ...input, nicknames: input.nicknames, alternates: input.alternates });
  recordRevision({
    entityType: 'person',
    entityId: personId,
    action: 'create',
    summary: `Added ${input.preferredName}`,
    actor,
  });
  return personId;
}

const PERSON_FIELD_LABELS: Record<string, string> = {
  preferred_name: 'Name',
  given_name: 'Given name',
  family_name: 'Family name',
  birth_name: 'Name at birth',
  hebrew_name: 'Hebrew name',
  gender: 'Gender',
  living: 'Living',
  biography: 'Biography',
  birth_value: 'Date of birth',
  death_value: 'Date of passing',
  birth_place_id: 'Place of birth',
  death_place_id: 'Place of passing',
};

export function updatePerson(personId: string, input: Partial<PersonInput>, actor: Actor) {
  const before = db().prepare('SELECT * FROM person WHERE id = ?').get(personId) as Row | undefined;
  if (!before) throw new Error('Person not found');

  const patch: Row = {};
  const set = (column: string, value: unknown) => {
    if (value !== undefined) patch[column] = value;
  };

  set('preferred_name', input.preferredName?.trim());
  set('given_name', input.givenName);
  set('family_name', input.familyName);
  set('birth_name', input.birthName);
  set('hebrew_name', input.hebrewName);
  set('gender', input.gender);
  if (input.living !== undefined) patch.living = input.living ? 1 : 0;
  set('biography', input.biography);

  if (input.birth) {
    patch.birth_value = input.birth.value;
    patch.birth_precision = input.birth.precision;
    patch.birth_qualifier = input.birth.qualifier;
    patch.birth_end_value = input.birth.endValue ?? null;
    patch.birth_after_sunset = input.birth.afterSunset ? 1 : 0;
    patch.birth_text = input.birth.text ?? null;
  }
  if (input.death) {
    patch.death_value = input.death.value;
    patch.death_precision = input.death.precision;
    patch.death_qualifier = input.death.qualifier;
    patch.death_end_value = input.death.endValue ?? null;
    patch.death_after_sunset = input.death.afterSunset ? 1 : 0;
    patch.death_text = input.death.text ?? null;
  }
  if (input.birthPlace !== undefined) patch.birth_place_id = input.birthPlace ? upsertPlace(input.birthPlace) : null;
  if (input.deathPlace !== undefined) patch.death_place_id = input.deathPlace ? upsertPlace(input.deathPlace) : null;

  const columns = Object.keys(patch).filter((c) => String(before[c] ?? '') !== String(patch[c] ?? ''));
  if (columns.length === 0) return;

  db()
    .prepare(
      `UPDATE person SET ${columns.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @updatedAt, updated_by = @actorId
       WHERE id = @id`,
    )
    .run({ ...patch, id: personId, updatedAt: now(), actorId: actor.id });

  for (const column of columns) {
    recordRevision({
      entityType: 'person',
      entityId: personId,
      action: 'update',
      field: PERSON_FIELD_LABELS[column] ?? column,
      oldValue: before[column] === null || before[column] === undefined ? null : String(before[column]),
      newValue: patch[column] === null ? null : String(patch[column]),
      actor,
    });
  }

  const after = db().prepare('SELECT * FROM person WHERE id = ?').get(personId) as Row;
  syncNames(personId, {
    preferredName: after.preferred_name,
    givenName: after.given_name,
    familyName: after.family_name,
    birthName: after.birth_name,
    hebrewName: after.hebrew_name,
    nicknames: input.nicknames,
    alternates: input.alternates,
  });
}

export function createUnion(
  partnerIds: string[],
  data: { status?: string; start?: FlexibleDate; end?: FlexibleDate; place?: string | null; note?: string | null },
  actor: Actor,
): string {
  const unionId = newId();
  const start = data.start ?? UNKNOWN_DATE;
  const end = data.end ?? UNKNOWN_DATE;

  db()
    .prepare(
      `INSERT INTO union_rel (id, status, start_value, start_precision, start_qualifier, end_value, end_precision, end_qualifier, place_id, note, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      unionId,
      data.status ?? 'married',
      start.value,
      start.precision,
      start.qualifier,
      end.value,
      end.precision,
      end.qualifier,
      data.place ? upsertPlace(data.place) : null,
      data.note ?? null,
      now(),
      actor.id,
    );

  const insertPartner = db().prepare(
    'INSERT OR IGNORE INTO union_partner (union_id, person_id, position) VALUES (?, ?, ?)',
  );
  partnerIds.forEach((personId, index) => insertPartner.run(unionId, personId, index));

  recordRevision({ entityType: 'union', entityId: unionId, action: 'create', summary: 'Added a marriage', actor });
  return unionId;
}

export function linkParentChild(
  parentId: string,
  childId: string,
  options: { unionId?: string | null; kind?: string } = {},
  actor: Actor = { id: null, name: 'System' },
) {
  db()
    .prepare(
      `INSERT INTO parent_child (id, parent_id, child_id, union_id, kind)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(parent_id, child_id) DO UPDATE SET union_id = COALESCE(excluded.union_id, union_id)`,
    )
    .run(newId(), parentId, childId, options.unionId ?? null, options.kind ?? 'biological');

  recordRevision({
    entityType: 'parent_child',
    entityId: `${parentId}:${childId}`,
    action: 'create',
    summary: 'Linked parent and child',
    actor,
  });
}

/** The union shared by both parents, if there is one — so children attach correctly. */
export function findSharedUnion(personA: string, personB: string): string | null {
  const row = db()
    .prepare(
      `SELECT a.union_id AS id FROM union_partner a
       JOIN union_partner b ON a.union_id = b.union_id
       WHERE a.person_id = ? AND b.person_id = ? LIMIT 1`,
    )
    .get(personA, personB) as Row | undefined;
  return row?.id ?? null;
}

/* ------------------------------------------------------------------ *
 * Stories, legacy, events, revisions
 * ------------------------------------------------------------------ */

export function memoriesFor(personId: string): Memory[] {
  const rows = db()
    .prepare(
      `SELECT m.* FROM memory m
       JOIN memory_person mp ON mp.memory_id = m.id
       WHERE mp.person_id = ?
       ORDER BY m.created_at DESC`,
    )
    .all(personId) as Row[];
  return rows.map(hydrateMemory);
}

function hydrateMemory(row: Row): Memory {
  const people = db()
    .prepare(
      `SELECT p.id, p.preferred_name AS name FROM memory_person mp
       JOIN person p ON p.id = mp.person_id WHERE mp.memory_id = ?`,
    )
    .all(row.id) as { id: string; name: string }[];
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    dateText: row.date_text ?? null,
    provenance: row.provenance ?? null,
    contributorName: row.contributor_name ?? null,
    createdAt: row.created_at,
    personIds: people.map((p) => p.id),
    people,
  };
}

export function createMemory(
  input: { title: string; body: string; dateText?: string; provenance?: string; personIds: string[] },
  actor: Actor,
): string {
  const memoryId = newId();
  db()
    .prepare(
      `INSERT INTO memory (id, title, body, date_text, provenance, contributor_id, contributor_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(memoryId, input.title, input.body, input.dateText ?? null, input.provenance ?? null, actor.id, actor.name, now());

  const link = db().prepare('INSERT OR IGNORE INTO memory_person (memory_id, person_id) VALUES (?, ?)');
  for (const personId of input.personIds) link.run(memoryId, personId);

  recordRevision({ entityType: 'memory', entityId: memoryId, action: 'create', summary: `Added a memory: ${input.title}`, actor });
  return memoryId;
}

export function legacyFor(personId: string): LegacyEntry[] {
  const rows = db()
    .prepare('SELECT * FROM legacy_entry WHERE person_id = ? ORDER BY created_at')
    .all(personId) as Row[];
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    kind: row.kind,
    title: row.title ?? null,
    body: row.body,
    contributorName: row.contributor_name ?? null,
    createdAt: row.created_at,
  }));
}

export function createLegacy(
  input: { personId: string; kind: string; title?: string; body: string },
  actor: Actor,
): string {
  const entryId = newId();
  db()
    .prepare(
      `INSERT INTO legacy_entry (id, person_id, kind, title, body, contributor_id, contributor_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(entryId, input.personId, input.kind, input.title ?? null, input.body, actor.id, actor.name, now());

  recordRevision({ entityType: 'legacy', entityId: entryId, action: 'create', summary: 'Added to legacy', actor });
  return entryId;
}

export function eventsFor(personId: string): LifeEvent[] {
  const rows = db()
    .prepare(
      `SELECT e.*, pl.id AS pl_id, pl.display AS pl_display, pl.city AS pl_city, pl.region AS pl_region, pl.country AS pl_country
       FROM event e
       JOIN event_person ep ON ep.event_id = e.id
       LEFT JOIN place pl ON pl.id = e.place_id
       WHERE ep.person_id = ?`,
    )
    .all(personId) as Row[];

  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description ?? null,
      date: {
        value: row.date_value ?? '',
        precision: row.date_precision ?? 'unknown',
        qualifier: row.date_qualifier ?? 'none',
        endValue: row.date_end_value ?? null,
      } as FlexibleDate,
      place: toPlace(row, 'pl_'),
      personIds: [personId],
    }))
    .sort((a, b) => sortKey(a.date) - sortKey(b.date));
}

export function createEvent(
  input: { kind: string; title: string; description?: string; date?: FlexibleDate; place?: string | null; personIds: string[] },
  actor: Actor,
): string {
  const eventId = newId();
  const date = input.date ?? UNKNOWN_DATE;
  db()
    .prepare(
      `INSERT INTO event (id, kind, title, description, date_value, date_precision, date_qualifier, date_end_value, place_id, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      eventId,
      input.kind,
      input.title,
      input.description ?? null,
      date.value,
      date.precision,
      date.qualifier,
      date.endValue ?? null,
      input.place ? upsertPlace(input.place) : null,
      now(),
      actor.id,
    );

  const link = db().prepare('INSERT OR IGNORE INTO event_person (event_id, person_id, role) VALUES (?, ?, ?)');
  for (const personId of input.personIds) link.run(eventId, personId, 'subject');

  recordRevision({ entityType: 'event', entityId: eventId, action: 'create', summary: `Added event: ${input.title}`, actor });
  return eventId;
}

export function revisionsFor(entityType: string, entityId: string): Revision[] {
  const rows = db()
    .prepare('SELECT * FROM revision WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC')
    .all(entityType, entityId) as Row[];
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    field: row.field ?? null,
    oldValue: row.old_value ?? null,
    newValue: row.new_value ?? null,
    summary: row.summary ?? null,
    userName: row.user_name ?? null,
    createdAt: row.created_at,
  }));
}

export function recordView(userId: string, personId: string) {
  db()
    .prepare(
      `INSERT INTO recently_viewed (user_id, person_id, viewed_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, person_id) DO UPDATE SET viewed_at = excluded.viewed_at`,
    )
    .run(userId, personId, now());
}

export function recentlyViewed(userId: string, limit = 8): PersonSummary[] {
  const rows = db()
    .prepare('SELECT person_id FROM recently_viewed WHERE user_id = ? ORDER BY viewed_at DESC LIMIT ?')
    .all(userId, limit) as Row[];
  const order = rows.map((r) => r.person_id);
  const summaries = new Map(getSummaries(order).map((s) => [s.id, s]));
  return order.map((pid) => summaries.get(pid)).filter(Boolean) as PersonSummary[];
}

export function getPref(userId: string, key: string): string | null {
  const row = db().prepare('SELECT value FROM user_pref WHERE user_id = ? AND key = ?').get(userId, key) as Row | undefined;
  return row?.value ?? null;
}

export function setPref(userId: string, key: string, value: string) {
  db()
    .prepare(
      `INSERT INTO user_pref (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    )
    .run(userId, key, value);
}
