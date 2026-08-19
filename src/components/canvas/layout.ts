/**
 * Family canvas layout.
 *
 * A pure function: graph slice in, coordinates out. Keeping it free of React
 * and of the DOM means the geometry can be tested directly — a family tree
 * that silently overlaps two cards is a family tree nobody trusts.
 *
 * Shape of the result, per the product's visual grammar:
 *
 *     Spouse A — ● — David — ● — Spouse B
 *                │           │
 *            Children A   Children B
 */

import type { GraphSlice, Union } from '@/lib/types';
import { sortKey } from '@/lib/dates';

export const CARD_WIDTH = 210;
export const CARD_HEIGHT = 78;
export const CHIP_WIDTH = 104;
export const CHIP_HEIGHT = 34;

const COUPLE_GAP = 44; // space between two partners, where the junction sits
const UNIT_GAP = 34; // between neighbouring family units in a row
// Between one set of siblings and the next along a row. Wider than a card on
// purpose: at 120 the break was there but not obvious, and a reader scanning a
// row of twenty relatives needs the grouping to be unmistakable rather than
// merely present.
const FAMILY_GAP = 300;
const ROW_GAP = 168; // vertical distance between generations

export type PersonNode = {
  kind: 'person';
  id: string;
  personId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
};

export type ChipNode = {
  kind: 'more';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
  count: number;
  /** Expanding this chip loads the rest of this person's children. */
  parentId: string;
  unionId: string | null;
};

export type LayoutNode = PersonNode | ChipNode;

export type UnionLine = {
  unionId: string;
  status: string;
  /** Centres of the two partner cards (or a stub when only one partner is shown). */
  fromX: number;
  toX: number;
  y: number;
  junctionX: number;
  junctionY: number;
  partnerIds: string[];
  hasChildren: boolean;
};

export type DescentLine = {
  id: string;
  /** Junction (or single parent card) the line leaves from. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /**
   * The height this line turns sideways at.
   *
   * Every family used to bend at the same height, which put all their
   * horizontal runs on one straight line across the canvas — so a row of
   * relatives looked like one long sibling bar with everybody hanging off it,
   * cousins included. Each family now turns at its own height, and the combs
   * read as separate.
   */
  midY: number;
  childId: string;
  unionId: string | null;
  parentIds: string[];
  kind: string;
};

export type Layout = {
  nodes: LayoutNode[];
  unionLines: UnionLine[];
  descentLines: DescentLine[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Where the focus person ended up, so the canvas can centre on them. */
  focusPoint: { x: number; y: number };
};

export type LayoutOptions = {
  /** Children beyond this count collapse into a "+ N more" chip. */
  collapseAfter?: number;
  /** Groups the viewer opened, keyed `${parentId}:${unionId ?? 'none'}`. */
  expandedGroups?: Set<string>;
  /** Extra vertical breathing room. */
  spacious?: boolean;
};

/* ------------------------------------------------------------------ *
 * Units: one person, their spouses, and the junctions between them.
 * ------------------------------------------------------------------ */

type Unit = {
  /** The person this unit is built around. */
  primaryId: string;
  /** Left-to-right: person ids in display order. */
  memberIds: string[];
  /** Union id positioned between memberIds[i] and memberIds[i+1]. */
  unionsBetween: (string | null)[];
  generation: number;
  width: number;
  /** Centre offset of each member from the unit's left edge. */
  offsets: number[];
  x: number; // centre, filled in during placement
};

function birthOrder(slice: GraphSlice, a: string, b: string): number {
  const pa = slice.persons[a];
  const pb = slice.persons[b];
  if (!pa || !pb) return 0;
  const diff = sortKey(pa.birth) - sortKey(pb.birth);
  return diff !== 0 ? diff : pa.preferredName.localeCompare(pb.preferredName);
}

/** Generation relative to the focus person: positive is older. */
export function generations(slice: GraphSlice, focusId: string): Map<string, number> {
  const gen = new Map<string, number>([[focusId, 0]]);
  const queue = [focusId];

  const parentsOf = (id: string) => slice.parentEdges.filter((e) => e.childId === id).map((e) => e.parentId);
  const childrenOf = (id: string) => slice.parentEdges.filter((e) => e.parentId === id).map((e) => e.childId);
  const spousesOf = (id: string) =>
    Object.values(slice.unions)
      .filter((u) => u.partnerIds.includes(id))
      .flatMap((u) => u.partnerIds)
      .filter((pid) => pid !== id);

  while (queue.length) {
    const current = queue.shift()!;
    const level = gen.get(current)!;

    for (const parentId of parentsOf(current)) {
      if (!gen.has(parentId) && slice.persons[parentId]) {
        gen.set(parentId, level + 1);
        queue.push(parentId);
      }
    }
    for (const childId of childrenOf(current)) {
      if (!gen.has(childId) && slice.persons[childId]) {
        gen.set(childId, level - 1);
        queue.push(childId);
      }
    }
    for (const spouseId of spousesOf(current)) {
      if (!gen.has(spouseId) && slice.persons[spouseId]) {
        gen.set(spouseId, level);
        queue.push(spouseId);
      }
    }
  }

  // Anyone unreachable (rare, but data is data) sits on the focus row.
  for (const personId of Object.keys(slice.persons)) if (!gen.has(personId)) gen.set(personId, 0);

  return gen;
}

export function layoutFamily(slice: GraphSlice, focusId: string, options: LayoutOptions = {}): Layout {
  const collapseAfter = options.collapseAfter ?? 6;
  const expandedGroups = options.expandedGroups ?? new Set<string>();
  const rowGap = options.spacious ? ROW_GAP + 34 : ROW_GAP;

  const gen = generations(slice, focusId);
  const unionsOf = (personId: string) =>
    Object.values(slice.unions)
      .filter((u) => u.partnerIds.includes(personId))
      .sort((a, b) => sortKey(a.start) - sortKey(b.start));

  /* --- Build units ------------------------------------------------- */

  const claimed = new Set<string>();
  const units: Unit[] = [];
  const unitOfPerson = new Map<string, Unit>();

  // The focus person is built first so their marriages define the centre.
  const orderedPeople = [focusId, ...Object.keys(slice.persons).filter((p) => p !== focusId)];

  for (const personId of orderedPeople) {
    if (claimed.has(personId) || !slice.persons[personId]) continue;

    const unions = unionsOf(personId);
    const left: string[] = [];
    const right: string[] = [];
    const leftUnions: string[] = [];
    const rightUnions: string[] = [];

    unions.forEach((union, index) => {
      const partnerId = union.partnerIds.find((pid) => pid !== personId);
      // A union with no visible partner still matters (it holds children),
      // but it needs no card of its own.
      if (!partnerId || !slice.persons[partnerId] || claimed.has(partnerId)) {
        if (index === 0) leftUnions.length = leftUnions.length; // no-op, keeps ordering clear
        return;
      }
      // Earliest marriage to the left, later marriages to the right.
      if (index === 0 && unions.length > 1) {
        left.unshift(partnerId);
        leftUnions.unshift(union.id);
      } else {
        right.push(partnerId);
        rightUnions.push(union.id);
      }
      claimed.add(partnerId);
    });

    claimed.add(personId);

    const memberIds = [...left, personId, ...right];
    const unionsBetween: (string | null)[] = [...leftUnions, ...rightUnions];

    const offsets: number[] = [];
    let cursor = 0;
    memberIds.forEach((_, index) => {
      offsets.push(cursor + CARD_WIDTH / 2);
      cursor += CARD_WIDTH + (index < memberIds.length - 1 ? COUPLE_GAP : 0);
    });

    const unit: Unit = {
      primaryId: personId,
      memberIds,
      unionsBetween,
      generation: gen.get(personId) ?? 0,
      width: cursor,
      offsets,
      x: 0,
    };

    units.push(unit);
    for (const memberId of memberIds) unitOfPerson.set(memberId, unit);
  }

  /* --- Parent/child structure between units ------------------------ */

  const childEdges = slice.parentEdges;

  /** Children of a unit, grouped by the union they belong to. */
  const childGroups = (unit: Unit): { unionId: string | null; parentIds: string[]; childIds: string[] }[] => {
    const groups = new Map<string, { unionId: string | null; parentIds: string[]; childIds: string[] }>();

    for (const memberId of unit.memberIds) {
      for (const edge of childEdges.filter((e) => e.parentId === memberId)) {
        // Attribute the child to the union it belongs to when known.
        const key = edge.unionId ?? `solo:${memberId}`;
        const group = groups.get(key) ?? {
          unionId: edge.unionId,
          parentIds: [] as string[],
          childIds: [] as string[],
        };
        if (!group.parentIds.includes(memberId)) group.parentIds.push(memberId);
        if (!group.childIds.includes(edge.childId)) group.childIds.push(edge.childId);
        groups.set(key, group);
      }
    }

    return [...groups.values()].map((group) => ({
      ...group,
      childIds: group.childIds.sort((a, b) => birthOrder(slice, a, b)),
    }));
  };

  /** A child belongs to the unit where they are the primary person. */
  const childUnits = (unit: Unit): Unit[] => {
    const seen = new Set<string>();
    const result: Unit[] = [];
    for (const group of childGroups(unit)) {
      for (const childId of visibleChildren(unit, group)) {
        const childUnit = unitOfPerson.get(childId);
        if (childUnit && childUnit.primaryId === childId && !seen.has(childUnit.primaryId)) {
          seen.add(childUnit.primaryId);
          result.push(childUnit);
        }
      }
    }
    return result;
  };

  /** Collapsed groups keep the canvas calm; the rest stay one tap away. */
  const visibleChildren = (
    unit: Unit,
    group: { unionId: string | null; parentIds: string[]; childIds: string[] },
  ): string[] => {
    const key = `${group.parentIds[0]}:${group.unionId ?? 'none'}`;
    if (expandedGroups.has(key) || group.childIds.length <= collapseAfter) return group.childIds;
    return group.childIds.slice(0, collapseAfter);
  };

  const parentUnitOf = (unit: Unit): Unit | null => {
    const edge = childEdges.find((e) => e.childId === unit.primaryId && unitOfPerson.has(e.parentId));
    if (!edge) return null;
    const parentUnit = unitOfPerson.get(edge.parentId) ?? null;
    // Guard against a unit being its own ancestor in malformed data.
    return parentUnit && parentUnit !== unit ? parentUnit : null;
  };

  /* --- Placement: tidy tree, then a de-collision pass --------------- */

  const roots = units.filter((unit) => parentUnitOf(unit) === null);
  // Put the focus person's line first so it lands nearest the centre.
  const focusUnit = unitOfPerson.get(focusId)!;
  const focusRootId = rootOf(focusUnit)?.primaryId;
  roots.sort((a, b) => {
    if (a.primaryId === focusRootId) return -1;
    if (b.primaryId === focusRootId) return 1;
    return birthOrder(slice, a.primaryId, b.primaryId);
  });

  function rootOf(unit: Unit): Unit | null {
    let current: Unit | null = unit;
    const guard = new Set<string>();
    while (current) {
      if (guard.has(current.primaryId)) return current;
      guard.add(current.primaryId);
      const parent: Unit | null = parentUnitOf(current);
      if (!parent) return current;
      current = parent;
    }
    return null;
  }

  // The line of units running from the focus person up through their ancestors.
  // These are aligned over the focus person rather than over the midpoint of
  // all their children, so "my branch" reads as a column with the family
  // fanning out either side of it.
  const focusPath = new Set<string>();
  {
    let current: Unit | null = focusUnit;
    const guard = new Set<string>();
    while (current && !guard.has(current.primaryId)) {
      guard.add(current.primaryId);
      focusPath.add(current.primaryId);
      current = parentUnitOf(current);
    }
  }

  /** Offset from a unit's left edge to the point children of `childId` descend from. */
  const descentOffset = (unit: Unit, childId: string): number => {
    const edge = childEdges.find((e) => e.childId === childId && unit.memberIds.includes(e.parentId));
    if (!edge) return unit.width / 2;

    if (edge.unionId) {
      const index = unit.unionsBetween.indexOf(edge.unionId);
      if (index >= 0 && unit.offsets[index + 1] !== undefined) {
        return (unit.offsets[index] + unit.offsets[index + 1]) / 2;
      }
    }
    const memberIndex = unit.memberIds.indexOf(edge.parentId);
    return memberIndex >= 0 ? unit.offsets[memberIndex] : unit.width / 2;
  };

  const memberCentre = (unit: Unit, personId: string): number => {
    const index = unit.memberIds.indexOf(personId);
    return unit.x - unit.width / 2 + (index >= 0 ? unit.offsets[index] : unit.width / 2);
  };

  const rowCursor = new Map<number, number>();
  const rowLast = new Map<number, Unit>();
  const placed = new Set<string>();

  /*
   * Which set of siblings a unit belongs to.
   *
   * Cousins genuinely share a generation with your brothers and sisters, so
   * they belong on the same row — but drawn at even spacing the whole row reads
   * as one undifferentiated line of relatives, and only the small print under
   * each name says which are yours. Families that hang together should sit
   * together, with visible air between them.
   */
  const familyOf = (unit: Unit): string => {
    const edge = childEdges.find((e) => e.childId === unit.primaryId);
    if (!edge) return `root:${unit.primaryId}`;
    return edge.unionId ? `union:${edge.unionId}` : `parent:${edge.parentId}`;
  };

  const gapBefore = (unit: Unit, previous: Unit | undefined): number =>
    previous && familyOf(previous) !== familyOf(unit) ? FAMILY_GAP : UNIT_GAP;

  function shift(unit: Unit, dx: number) {
    unit.x += dx;
    for (const child of childUnits(unit)) if (placed.has(child.primaryId)) shift(child, dx);
  }

  function place(unit: Unit): number {
    if (placed.has(unit.primaryId)) return unit.x;
    placed.add(unit.primaryId);

    const children = childUnits(unit);
    const kidCentres = children.map((child) => place(child));

    let centre: number;
    const focusChild = focusPath.has(unit.primaryId)
      ? children.find((child) => focusPath.has(child.primaryId))
      : undefined;

    if (focusChild) {
      // Sit directly above the focus line: the junction these children descend
      // from lands over the focus-path child's own card.
      centre =
        memberCentre(focusChild, focusChild.primaryId) -
        (descentOffset(unit, focusChild.primaryId) - unit.width / 2);
    } else if (kidCentres.length) {
      centre = (Math.min(...kidCentres) + Math.max(...kidCentres)) / 2;
    } else {
      centre = (rowCursor.get(unit.generation) ?? 0) + unit.width / 2;
    }

    // Never overlap something already placed on this row.
    const gap = gapBefore(unit, rowLast.get(unit.generation));
    const edge = rowCursor.get(unit.generation);
    const minCentre = edge === undefined ? -Infinity : edge + gap + unit.width / 2;
    if (centre < minCentre) {
      const delta = minCentre - centre;
      centre = minCentre;
      // Keep the parent centred over its children by moving the children too.
      for (const child of children) shift(child, delta);
    }

    unit.x = centre;
    rowCursor.set(unit.generation, centre + unit.width / 2);
    rowLast.set(unit.generation, unit);
    return centre;
  }

  for (const root of roots) place(root);
  for (const unit of units) if (!placed.has(unit.primaryId)) place(unit);

  // Safety net: guarantee no two units on a row can ever overlap, whatever
  // shape the data took.
  const byRow = new Map<number, Unit[]>();
  for (const unit of units) {
    const list = byRow.get(unit.generation) ?? [];
    list.push(unit);
    byRow.set(unit.generation, list);
  }
  for (const [, row] of byRow) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const previous = row[i - 1];
      const current = row[i];
      const minX =
        previous.x + previous.width / 2 + gapBefore(current, previous) + current.width / 2;
      if (current.x < minX) shift(current, minX - current.x);
    }
  }

  /* --- Emit nodes and connectors ----------------------------------- */

  const rowY = (generation: number) => -generation * rowGap;

  const nodes: LayoutNode[] = [];
  const pendingChips: {
    id: string;
    desiredX: number;
    generation: number;
    count: number;
    parentId: string;
    unionId: string | null;
  }[] = [];
  const unionLines: UnionLine[] = [];
  const descentLines: DescentLine[] = [];
  const centreOf = new Map<string, { x: number; y: number }>();

  for (const unit of units) {
    const left = unit.x - unit.width / 2;
    const y = rowY(unit.generation);

    unit.memberIds.forEach((personId, index) => {
      const x = left + unit.offsets[index] - CARD_WIDTH / 2;
      nodes.push({
        kind: 'person',
        id: personId,
        personId,
        x,
        y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        generation: unit.generation,
      });
      centreOf.set(personId, { x: left + unit.offsets[index], y: y + CARD_HEIGHT / 2 });
    });

    // Junctions between adjacent partners.
    unit.unionsBetween.forEach((unionId, index) => {
      if (!unionId) return;
      const union = slice.unions[unionId];
      if (!union) return;
      const a = centreOf.get(unit.memberIds[index]);
      const b = centreOf.get(unit.memberIds[index + 1]);
      if (!a || !b) return;

      unionLines.push({
        unionId,
        status: union.status,
        fromX: a.x,
        toX: b.x,
        y: a.y,
        junctionX: (a.x + b.x) / 2,
        junctionY: a.y,
        partnerIds: union.partnerIds,
        hasChildren: union.childIds.length > 0,
      });
    });
  }

  const junctionFor = (unionId: string | null, parentIds: string[]): { x: number; y: number } | null => {
    if (unionId) {
      const line = unionLines.find((l) => l.unionId === unionId);
      if (line) return { x: line.junctionX, y: line.junctionY };
    }
    // Single known parent: descend from the card itself.
    const centre = centreOf.get(parentIds[0]);
    return centre ?? null;
  };

  // Each family gets its own bend height, cycling through a few so that
  // neighbouring families never turn at the same place.
  const BEND_FACTORS = [0.42, 0.58, 0.5, 0.66];
  const bendIndex = new Map<string, number>();
  const bendFactorFor = (key: string): number => {
    if (!bendIndex.has(key)) bendIndex.set(key, bendIndex.size);
    return BEND_FACTORS[bendIndex.get(key)! % BEND_FACTORS.length];
  };

  for (const unit of units) {
    for (const group of childGroups(unit)) {
      const from = junctionFor(group.unionId, group.parentIds);
      if (!from) continue;
      const bend = bendFactorFor(group.unionId ?? `solo:${group.parentIds[0]}`);

      const shown = visibleChildren(unit, group);
      for (const childId of shown) {
        const childCentre = centreOf.get(childId);
        if (!childCentre) continue;
        const edge = childEdges.find((e) => e.childId === childId && group.parentIds.includes(e.parentId));
        const fromY = from.y + (group.unionId ? 0 : CARD_HEIGHT / 2);
        const toY = childCentre.y - CARD_HEIGHT / 2;
        descentLines.push({
          id: `${group.unionId ?? group.parentIds[0]}->${childId}`,
          fromX: from.x,
          fromY,
          toX: childCentre.x,
          toY,
          midY: fromY + (toY - fromY) * bend,
          childId,
          unionId: group.unionId,
          parentIds: group.parentIds,
          kind: edge?.kind ?? 'biological',
        });
      }

      // "+ N more" chip, wanting to sit just past the last visible child.
      const hidden = group.childIds.length - shown.length;
      if (hidden > 0) {
        const lastShown = shown.length ? centreOf.get(shown[shown.length - 1]) : null;
        pendingChips.push({
          id: `more:${group.parentIds[0]}:${group.unionId ?? 'none'}`,
          desiredX: lastShown ? lastShown.x + CARD_WIDTH / 2 + UNIT_GAP : from.x - CHIP_WIDTH / 2,
          generation: unit.generation - 1,
          count: hidden,
          parentId: group.parentIds[0],
          unionId: group.unionId,
        });
      }
    }
  }

  // Chips are placed last, into whatever space the row actually has left.
  // Cards are the content; a chip must never sit on top of a person.
  const occupied = new Map<number, { start: number; end: number }[]>();
  for (const node of nodes) {
    const list = occupied.get(node.generation) ?? [];
    list.push({ start: node.x, end: node.x + node.width });
    occupied.set(node.generation, list);
  }

  for (const chip of pendingChips) {
    const row = (occupied.get(chip.generation) ?? []).slice().sort((a, b) => a.start - b.start);
    let x = chip.desiredX;

    // Slide right past anything already sitting there.
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 200) {
      moved = false;
      for (const span of row) {
        if (x < span.end + UNIT_GAP / 2 && x + CHIP_WIDTH > span.start - UNIT_GAP / 2) {
          x = span.end + UNIT_GAP / 2;
          moved = true;
        }
      }
    }

    nodes.push({
      kind: 'more',
      id: chip.id,
      x,
      y: rowY(chip.generation) + (CARD_HEIGHT - CHIP_HEIGHT) / 2,
      width: CHIP_WIDTH,
      height: CHIP_HEIGHT,
      generation: chip.generation,
      count: chip.count,
      parentId: chip.parentId,
      unionId: chip.unionId,
    });

    const list = occupied.get(chip.generation) ?? [];
    list.push({ start: x, end: x + CHIP_WIDTH });
    occupied.set(chip.generation, list);
  }

  const xs = nodes.flatMap((n) => [n.x, n.x + n.width]);
  const ys = nodes.flatMap((n) => [n.y, n.y + n.height]);
  const focusCentre = centreOf.get(focusId) ?? { x: 0, y: 0 };

  return {
    nodes,
    unionLines,
    descentLines: oneLinePerChild(descentLines),
    bounds: {
      minX: xs.length ? Math.min(...xs) : 0,
      maxX: xs.length ? Math.max(...xs) : 0,
      minY: ys.length ? Math.min(...ys) : 0,
      maxY: ys.length ? Math.max(...ys) : 0,
    },
    focusPoint: focusCentre,
  };
}

/** Elbow path from a parental junction down to a child card. */

/**
 * One line down to each child.
 *
 * A child can be claimed twice: by the marriage they belong to and, separately,
 * by a parent whose own link was recorded before that marriage existed — or by
 * two units, where the parents sit apart because one of them remarried. Drawn
 * literally, that is two lines arriving at the same card, which reads as a
 * mistake in the family rather than in the drawing.
 *
 * The line from a marriage is the truer one, so it wins; otherwise the first
 * found is kept, and the rest are dropped.
 */
function oneLinePerChild(lines: DescentLine[]): DescentLine[] {
  const best = new Map<string, DescentLine>();
  for (const line of lines) {
    const existing = best.get(line.childId);
    if (!existing || (!existing.unionId && line.unionId)) best.set(line.childId, line);
  }
  return lines.filter((line) => best.get(line.childId) === line);
}

export function descentPath(line: DescentLine): string {
  const midY = line.midY;
  if (Math.abs(line.fromX - line.toX) < 0.5) {
    return `M ${line.fromX} ${line.fromY} L ${line.toX} ${line.toY}`;
  }
  const radius = Math.min(14, Math.abs(line.toX - line.fromX) / 2, Math.abs(midY - line.fromY));
  const direction = line.toX > line.fromX ? 1 : -1;
  return [
    `M ${line.fromX} ${line.fromY}`,
    `L ${line.fromX} ${midY - radius}`,
    `Q ${line.fromX} ${midY} ${line.fromX + radius * direction} ${midY}`,
    `L ${line.toX - radius * direction} ${midY}`,
    `Q ${line.toX} ${midY} ${line.toX} ${midY + radius}`,
    `L ${line.toX} ${line.toY}`,
  ].join(' ');
}
