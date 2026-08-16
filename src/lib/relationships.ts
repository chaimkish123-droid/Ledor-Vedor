/**
 * Relationship calculation.
 *
 * Direct edges (parent/child, union) are the only stored truth. Every extended
 * relationship — "second cousin once removed", "great-aunt", "brother-in-law" —
 * is derived here, so no family member ever types genealogical terminology.
 *
 * Calculation is deliberately kept apart from wording: `describe()` is the only
 * place English appears, so the terms can be localised or softened later.
 */

export type Gender = 'female' | 'male' | 'other' | null | undefined;

/** Minimal graph interface, so this module is testable without a database. */
export type GraphAccess = {
  parentsOf(personId: string): string[];
  childrenOf(personId: string): string[];
  spousesOf(personId: string): string[];
  genderOf(personId: string): Gender;
  nameOf(personId: string): string;
  /**
   * The union a person was born into, when recorded. Two children of the same
   * parent from different unions are half-siblings even when only one parent
   * is known for each — the union is the evidence, not the parent count.
   */
  unionOfChild?(personId: string): string | null;
};

export type RelationshipKind =
  | 'self'
  | 'spouse'
  | 'parent'
  | 'child'
  | 'sibling'
  | 'half-sibling'
  | 'ancestor'
  | 'descendant'
  | 'pibling' // aunt/uncle
  | 'nibling' // niece/nephew
  | 'cousin'
  | 'in-law'
  | 'step'
  | 'unrelated';

export type Relationship = {
  kind: RelationshipKind;
  /** Cousin degree: 1 = first cousin. */
  degree?: number;
  /** Generations removed between the two cousins. */
  removed?: number;
  /** Generational distance for ancestors/descendants: 2 = grandparent. */
  generations?: number;
  /** Common ancestors that produced this relationship. */
  via?: string[];
  /** For in-law and step relationships, the underlying blood relationship. */
  through?: Relationship;
  /** Person the in-law relationship passes through (a spouse). */
  throughPersonId?: string;
  /** Half-blood: only one shared parent. */
  half?: boolean;
  /** Legal rather than biological (adoption/step edges on the path). */
  legal?: boolean;
};

const ORDINALS = [
  '', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth',
];

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

function timesRemoved(n: number): string {
  if (n === 0) return '';
  if (n === 1) return ' once removed';
  if (n === 2) return ' twice removed';
  if (n === 3) return ' three times removed';
  return ` ${n} times removed`;
}

/** "great-great-grandmother" — built from the generation gap. */
function greats(generations: number, base: string): string {
  if (generations <= 1) return base;
  if (generations === 2) return `grand${base}`;
  return `${'great-'.repeat(generations - 2)}grand${base}`;
}

/**
 * All ancestors of a person with their generational distance.
 * Handles cycles defensively — bad data must never hang the app.
 */
export function ancestorMap(graph: GraphAccess, personId: string, maxDepth = 20): Map<string, number> {
  const distances = new Map<string, number>([[personId, 0]]);
  let frontier = [personId];

  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const parentId of graph.parentsOf(current)) {
        if (distances.has(parentId)) continue; // keep the shortest path
        distances.set(parentId, depth);
        next.push(parentId);
      }
    }
    frontier = next;
  }

  return distances;
}

/**
 * The blood relationship between two people, or null when there is none.
 * Returns the *closest* relationship when several common ancestors exist.
 */
export function bloodRelationship(graph: GraphAccess, fromId: string, toId: string): Relationship | null {
  if (fromId === toId) return { kind: 'self' };

  const fromAncestors = ancestorMap(graph, fromId);
  const toAncestors = ancestorMap(graph, toId);

  // Direct line first. Everything is worded from `from`'s point of view:
  // if `to` is an ancestor of `from`, then to *is* the parent/grandparent.
  if (fromAncestors.has(toId)) {
    return { kind: 'ancestor', generations: fromAncestors.get(toId)!, via: [toId] };
  }
  if (toAncestors.has(fromId)) {
    return { kind: 'descendant', generations: toAncestors.get(fromId)!, via: [fromId] };
  }

  // Common ancestors, closest first.
  let best: { ancestorIds: string[]; a: number; b: number } | null = null;
  for (const [ancestorId, distanceFrom] of fromAncestors) {
    const distanceTo = toAncestors.get(ancestorId);
    if (distanceTo === undefined) continue;

    const score = Math.max(distanceFrom, distanceTo) * 100 + Math.min(distanceFrom, distanceTo);
    const bestScore = best ? Math.max(best.a, best.b) * 100 + Math.min(best.a, best.b) : Infinity;

    if (score < bestScore) best = { ancestorIds: [ancestorId], a: distanceFrom, b: distanceTo };
    else if (score === bestScore && best) best.ancestorIds.push(ancestorId);
  }

  if (!best) return null;

  // Drop ancestors that are themselves descendants of another common ancestor
  // in the set — a couple counts as one origin, their parents don't.
  const { a, b, ancestorIds } = best;

  // Siblings: both one generation from a shared parent.
  if (a === 1 && b === 1) {
    const fromParents = graph.parentsOf(fromId);
    const toParents = graph.parentsOf(toId);
    const shared = fromParents.filter((p) => toParents.includes(p));

    let half = shared.length === 1 && fromParents.length > 1 && toParents.length > 1;

    // Different parental unions is stronger evidence than counting parents.
    const fromUnion = graph.unionOfChild?.(fromId) ?? null;
    const toUnion = graph.unionOfChild?.(toId) ?? null;
    if (shared.length === 1 && fromUnion && toUnion) half = fromUnion !== toUnion;

    return {
      kind: half ? 'half-sibling' : 'sibling',
      half,
      via: shared.length ? shared : ancestorIds,
    };
  }

  // Aunt/uncle and niece/nephew: one of the pair is a sibling of an ancestor.
  if (a === 1 && b > 1) return { kind: 'nibling', generations: b - 1, via: ancestorIds };
  if (b === 1 && a > 1) return { kind: 'pibling', generations: a - 1, via: ancestorIds };

  const degree = Math.min(a, b) - 1;
  const removed = Math.abs(a - b);
  return { kind: 'cousin', degree, removed, via: ancestorIds };
}

/**
 * The full relationship, including marriage and step/in-law connections that
 * blood alone cannot express.
 */
export function relationship(graph: GraphAccess, fromId: string, toId: string): Relationship {
  if (fromId === toId) return { kind: 'self' };

  if (graph.spousesOf(fromId).includes(toId)) return { kind: 'spouse' };

  const blood = bloodRelationship(graph, fromId, toId);
  if (blood) return blood;

  // Step-parent / step-child, checked before in-law wording: the person who
  // raised you reads as a stepmother, never as a "father-in-law's wife".
  for (const parentId of graph.parentsOf(fromId)) {
    if (graph.spousesOf(parentId).includes(toId)) return { kind: 'step', generations: 1, through: { kind: 'parent' } };
  }
  for (const parentId of graph.parentsOf(toId)) {
    if (graph.spousesOf(parentId).includes(fromId)) return { kind: 'step', generations: 1, through: { kind: 'child' } };
  }

  // Married into the family: my spouse's relative.
  for (const spouseId of graph.spousesOf(fromId)) {
    const viaSpouse = bloodRelationship(graph, spouseId, toId);
    if (viaSpouse && viaSpouse.kind !== 'self') {
      return { kind: 'in-law', through: viaSpouse, throughPersonId: spouseId };
    }
  }

  // My relative's spouse.
  for (const spouseId of graph.spousesOf(toId)) {
    const viaSpouse = bloodRelationship(graph, fromId, spouseId);
    if (viaSpouse && viaSpouse.kind !== 'self') {
      return { kind: 'in-law', through: viaSpouse, throughPersonId: spouseId };
    }
  }

  // Step-siblings: our parents are married to each other but we share none.
  for (const myParent of graph.parentsOf(fromId)) {
    for (const theirParent of graph.parentsOf(toId)) {
      if (graph.spousesOf(myParent).includes(theirParent)) {
        return { kind: 'step', through: { kind: 'sibling' } };
      }
    }
  }

  return { kind: 'unrelated' };
}

type Wording = { female: string; male: string; neutral: string };

function gendered(gender: Gender, wording: Wording): string {
  if (gender === 'female') return wording.female;
  if (gender === 'male') return wording.male;
  return wording.neutral;
}

/**
 * Plain-language wording, from the perspective of the first person.
 * `gender` is that of the *second* person (the one being described).
 */
export function describe(rel: Relationship, gender: Gender = null): string {
  switch (rel.kind) {
    case 'self':
      return 'the same person';

    case 'spouse':
      return gendered(gender, { female: 'wife', male: 'husband', neutral: 'spouse' });

    case 'sibling':
      return gendered(gender, { female: 'sister', male: 'brother', neutral: 'sibling' });

    case 'half-sibling':
      return gendered(gender, { female: 'half-sister', male: 'half-brother', neutral: 'half-sibling' });

    case 'ancestor': {
      const g = rel.generations ?? 1;
      return greats(g, gendered(gender, { female: 'mother', male: 'father', neutral: 'parent' }));
    }

    case 'descendant': {
      const g = rel.generations ?? 1;
      return greats(g, gendered(gender, { female: 'daughter', male: 'son', neutral: 'child' }));
    }

    case 'parent':
      return gendered(gender, { female: 'mother', male: 'father', neutral: 'parent' });

    case 'child':
      return gendered(gender, { female: 'daughter', male: 'son', neutral: 'child' });

    case 'pibling': {
      const g = rel.generations ?? 1;
      const base = gendered(gender, { female: 'aunt', male: 'uncle', neutral: 'aunt or uncle' });
      return g <= 1 ? base : `${'great-'.repeat(g - 1)}${base}`;
    }

    case 'nibling': {
      const g = rel.generations ?? 1;
      const base = gendered(gender, { female: 'niece', male: 'nephew', neutral: 'niece or nephew' });
      return g <= 1 ? base : `${'great-'.repeat(g - 1)}${base}`;
    }

    case 'cousin':
      return `${ordinal(rel.degree ?? 1)} cousin${timesRemoved(rel.removed ?? 0)}`;

    case 'in-law': {
      const inner = rel.through ? describe(rel.through, gender) : 'relative';
      // Only the close terms have natural "-in-law" forms in English.
      if (inner === 'sister') return 'sister-in-law';
      if (inner === 'brother') return 'brother-in-law';
      if (inner === 'mother') return 'mother-in-law';
      if (inner === 'father') return 'father-in-law';
      if (inner === 'daughter') return 'daughter-in-law';
      if (inner === 'son') return 'son-in-law';
      return `${inner} by marriage`;
    }

    case 'step': {
      const inner = rel.through ? describe(rel.through, gender) : 'relative';
      return `step${inner}`;
    }

    default:
      return 'not directly related';
  }
}

/** "Sarah is your second cousin once removed." */
export function describeSentence(
  rel: Relationship,
  subjectName: string,
  gender: Gender,
  viewerIsFirstPerson = true,
): string {
  if (rel.kind === 'self') return `${subjectName} is you.`;
  if (rel.kind === 'unrelated') {
    return `No family connection found between you and ${subjectName} yet.`;
  }
  const term = describe(rel, gender);
  const article = /^[aeiou]/i.test(term) ? 'an' : 'a';
  const possessive = viewerIsFirstPerson ? 'your' : 'their';

  if (rel.kind === 'cousin') return `${subjectName} is ${possessive} ${term}.`;
  if (rel.kind === 'in-law' && term.endsWith('by marriage')) {
    return `${subjectName} is ${possessive} ${term}.`;
  }
  return `${subjectName} is ${possessive} ${term}.`;
}

/* ------------------------------------------------------------------ *
 * Connection paths — "show me exactly how we are related"
 * ------------------------------------------------------------------ */

export type PathStep = {
  personId: string;
  /** How this person connects to the previous step. */
  via: 'parent' | 'child' | 'spouse' | 'start';
};

export type ConnectionPath = {
  steps: PathStep[];
  relationship: Relationship;
  /** Human summary of the hops: "Mother → her father → his sister". */
  length: number;
};

/**
 * Breadth-first search over parent/child/spouse edges.
 * Returns up to `maxPaths` distinct routes, shortest first — large families
 * genuinely do connect in more than one way.
 */
export function findPaths(
  graph: GraphAccess,
  fromId: string,
  toId: string,
  maxPaths = 3,
  maxDepth = 12,
): ConnectionPath[] {
  if (fromId === toId) {
    return [{ steps: [{ personId: fromId, via: 'start' }], relationship: { kind: 'self' }, length: 0 }];
  }

  const results: ConnectionPath[] = [];
  const queue: PathStep[][] = [[{ personId: fromId, via: 'start' }]];
  // Allow revisiting nodes across different paths, but never within one path.
  const visitCount = new Map<string, number>();

  while (queue.length && results.length < maxPaths) {
    const path = queue.shift()!;
    const tail = path[path.length - 1];

    if (path.length > maxDepth) continue;

    const seenOnPath = new Set(path.map((s) => s.personId));
    const neighbours: PathStep[] = [
      ...graph.parentsOf(tail.personId).map((pid) => ({ personId: pid, via: 'parent' as const })),
      ...graph.childrenOf(tail.personId).map((pid) => ({ personId: pid, via: 'child' as const })),
      // Spouse hops are allowed but never consecutively — that would let the
      // search wander through unrelated families forever.
      ...(tail.via === 'spouse'
        ? []
        : graph.spousesOf(tail.personId).map((pid) => ({ personId: pid, via: 'spouse' as const }))),
    ];

    for (const step of neighbours) {
      if (seenOnPath.has(step.personId)) continue;

      const count = visitCount.get(step.personId) ?? 0;
      if (count > maxPaths) continue;
      visitCount.set(step.personId, count + 1);

      const nextPath = [...path, step];
      if (step.personId === toId) {
        results.push({
          steps: nextPath,
          relationship: relationship(graph, fromId, toId),
          length: nextPath.length - 1,
        });
        if (results.length >= maxPaths) break;
      } else {
        queue.push(nextPath);
      }
    }
  }

  return results;
}

/** Reading of a single hop, e.g. "his sister", "her mother". */
export function stepLabel(step: PathStep, gender: Gender, previousGender: Gender): string {
  const possessive = previousGender === 'female' ? 'her' : previousGender === 'male' ? 'his' : 'their';
  switch (step.via) {
    case 'start':
      return '';
    case 'parent':
      return `${possessive} ${gendered(gender, { female: 'mother', male: 'father', neutral: 'parent' })}`;
    case 'child':
      return `${possessive} ${gendered(gender, { female: 'daughter', male: 'son', neutral: 'child' })}`;
    case 'spouse':
      return `${possessive} ${gendered(gender, { female: 'wife', male: 'husband', neutral: 'spouse' })}`;
  }
}
