import { dbGraph } from './graph-db';
import { describe, relationship } from './relationships';
import {
  eventsFor,
  getAlternateNames,
  getPerson,
  getSummaries,
  getSummary,
  legacyFor,
  memoriesFor,
  parentEdgesOfChild,
  revisionsFor,
  siblingIdsOf,
  unionsOfPerson,
} from './repo';
import type { PersonSummary, Union } from './types';
import { portraitOf, type Portrait } from './photos';
import { ageBetween, ageToday, formatDate, sortKey, type CalendarPreference } from './dates';

export type RelatedPerson = PersonSummary & { relationLabel: string; edgeKind?: string };

export type FamilyGroup = {
  union: Union | null;
  partner: PersonSummary | null;
  children: PersonSummary[];
  /** "Married 1971 · Brooklyn, New York" — only when something is known. */
  detail: string | null;
};

export type PersonDetail = {
  person: ReturnType<typeof getPerson>;
  alternateNames: { kind: string; value: string }[];
  parents: RelatedPerson[];
  siblings: RelatedPerson[];
  children: PersonSummary[];
  families: FamilyGroup[];
  grandparents: PersonSummary[];
  grandchildren: PersonSummary[];
  portrait: Portrait | null;
  memories: ReturnType<typeof memoriesFor>;
  legacy: ReturnType<typeof legacyFor>;
  events: ReturnType<typeof eventsFor>;
  revisions: ReturnType<typeof revisionsFor>;
  age: number | null;
  /** How this person relates to the person viewing them. */
  viewerRelation: string | null;
  birthDisplay: string;
  deathDisplay: string;
};

const UNION_STATUS_WORDS: Record<string, string> = {
  married: 'Married',
  partnered: 'Together',
  divorced: 'Married',
  widowed: 'Married',
  separated: 'Married',
  unknown: 'Together',
};

export function personDetail(
  personId: string,
  options: {
    viewerPersonId?: string | null;
    /** The account reading this, which decides what of it they may see. */
    viewerUserId?: string | null;
    calendar?: CalendarPreference;
    includeHistory?: boolean;
  } = {},
): PersonDetail | null {
  const person = getPerson(personId);
  if (!person) return null;

  const calendar = options.calendar ?? 'gregorian';
  const graph = dbGraph();
  const viewer = { userId: options.viewerUserId ?? null, personId: options.viewerPersonId ?? null };

  const parentEdges = parentEdgesOfChild(personId);
  const parentSummaries = getSummaries(parentEdges.map((e) => e.parentId));
  const parents: RelatedPerson[] = parentSummaries.map((summary) => {
    const edge = parentEdges.find((e) => e.parentId === summary.id)!;
    const label = describe({ kind: 'parent' }, summary.gender as any);
    return {
      ...summary,
      relationLabel: edge.kind === 'biological' ? label : `${edge.kind === 'adoptive' ? 'Adoptive ' : 'Step-'}${label}`,
      edgeKind: edge.kind,
    };
  });

  const siblings: RelatedPerson[] = getSummaries(siblingIdsOf(personId))
    .sort((a, b) => sortKey(a.birth) - sortKey(b.birth))
    .map((summary) => ({
      ...summary,
      relationLabel: describe(
        { kind: 'sibling', ...(relationship(graph, personId, summary.id).half ? { kind: 'half-sibling' as const } : {}) },
        summary.gender as any,
      ),
    }));

  // Children grouped by the relationship they belong to — the heart of
  // keeping remarriage understandable.
  const unions = unionsOfPerson(personId);
  const families: FamilyGroup[] = unions.map((union) => {
    const partnerId = union.partnerIds.find((pid) => pid !== personId) ?? null;
    const partner = partnerId ? getSummary(partnerId) : null;
    const children = getSummaries(union.childIds).sort((a, b) => sortKey(a.birth) - sortKey(b.birth));

    const bits: string[] = [];
    const word = UNION_STATUS_WORDS[union.status] ?? 'Married';
    const startText = formatDate(union.start, calendar);
    if (startText) bits.push(`${word} ${startText}`);
    else if (partner) bits.push(word);
    if (union.place) bits.push(union.place.display);
    if (union.status === 'divorced') bits.push('later divorced');
    if (union.status === 'widowed' && union.end?.value) bits.push(`until ${formatDate(union.end, calendar)}`);

    return { union, partner, children, detail: bits.length ? bits.join(' · ') : null };
  });

  // Children whose union is unrecorded still belong to this person.
  const groupedChildIds = new Set(families.flatMap((f) => f.children.map((c) => c.id)));
  const allChildIds = graph.childrenOf(personId);
  const ungrouped = getSummaries(allChildIds.filter((cid) => !groupedChildIds.has(cid)));
  if (ungrouped.length) {
    families.push({ union: null, partner: null, children: ungrouped, detail: null });
  }

  const children = getSummaries(allChildIds).sort((a, b) => sortKey(a.birth) - sortKey(b.birth));

  const grandparentIds = [...new Set(parentEdges.flatMap((e) => graph.parentsOf(e.parentId)))];
  const grandchildIds = [...new Set(allChildIds.flatMap((cid) => graph.childrenOf(cid)))];

  const viewerRelation =
    options.viewerPersonId && options.viewerPersonId !== personId
      ? describe(relationship(graph, options.viewerPersonId, personId), person.gender as any)
      : options.viewerPersonId === personId
        ? 'you'
        : null;

  return {
    person,
    alternateNames: getAlternateNames(personId),
    parents,
    siblings,
    children,
    families,
    grandparents: getSummaries(grandparentIds),
    grandchildren: getSummaries(grandchildIds).sort((a, b) => sortKey(a.birth) - sortKey(b.birth)),
    portrait: portraitOf(personId),
    memories: memoriesFor(personId, viewer),
    legacy: legacyFor(personId, viewer),
    events: eventsFor(personId),
    revisions: options.includeHistory ? revisionsFor('person', personId) : [],
    age: person.living ? ageToday(person.birth) : ageBetween(person.birth, person.death),
    viewerRelation,
    birthDisplay: formatDate(person.birth, calendar),
    deathDisplay: formatDate(person.death, calendar),
  };
}
