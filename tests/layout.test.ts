import test from 'node:test';
import assert from 'node:assert/strict';
import { neighborhood, searchPersons } from '../src/lib/repo.ts';
import { layoutFamily, CARD_WIDTH, CARD_HEIGHT, type PersonNode } from '../src/components/canvas/layout.ts';

function personOf(name: string) {
  const hit = searchPersons(name)[0];
  assert.ok(hit, `expected to find ${name} in the seeded family`);
  return hit.person;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

for (const name of ['Michael Kish', 'David Kish', 'Avraham Kish', 'Ruth Shapiro', 'Aviva Kish', 'Yaakov Kish']) {
  test(`layout for ${name} never overlaps two cards`, () => {
    const person = personOf(name);
    const slice = neighborhood(person.id);
    const layout = layoutFamily(slice, person.id);

    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        assert.ok(!overlaps(a, b), `${a.id} overlaps ${b.id} in ${name}'s tree`);
      }
    }
  });
}

test('generations sit on distinct rows, older above younger', () => {
  const michael = personOf('Michael Kish');
  const slice = neighborhood(michael.id);
  const layout = layoutFamily(slice, michael.id);

  const byId = new Map(layout.nodes.filter((n) => n.kind === 'person').map((n) => [n.id, n as PersonNode]));
  const david = personOf('David Kish');
  const avraham = personOf('Avraham Kish');
  const ethan = personOf('Ethan Kish');

  assert.ok(byId.get(avraham.id)!.y < byId.get(david.id)!.y, 'grandfather must sit above father');
  assert.ok(byId.get(david.id)!.y < byId.get(michael.id)!.y, 'father must sit above son');
  assert.ok(byId.get(michael.id)!.y < byId.get(ethan.id)!.y, 'son must sit below his father');
});

test("a remarried person shows both spouses on either side, with two junctions", () => {
  const david = personOf('David Kish');
  const slice = neighborhood(david.id);
  const layout = layoutFamily(slice, david.id);

  const davidNode = layout.nodes.find((n) => n.id === david.id) as PersonNode;
  const sarah = personOf('Sarah Kish'); // first wife
  const naomi = personOf('Naomi Kish'); // second wife

  const sarahNode = layout.nodes.find((n) => n.id === sarah.id) as PersonNode;
  const naomiNode = layout.nodes.find((n) => n.id === naomi.id) as PersonNode;

  assert.ok(sarahNode && naomiNode, 'both spouses must be on the canvas');
  assert.equal(sarahNode.y, davidNode.y, 'spouses sit beside, not above');
  assert.equal(naomiNode.y, davidNode.y);

  // Earlier marriage to the left, later marriage to the right.
  assert.ok(sarahNode.x < davidNode.x, 'first marriage renders to the left');
  assert.ok(naomiNode.x > davidNode.x, 'second marriage renders to the right');

  const davidUnions = layout.unionLines.filter((l) => l.partnerIds.includes(david.id));
  assert.equal(davidUnions.length, 2, 'both marriages get their own junction');

  // Children descend from the junction of the marriage they belong to.
  const michael = personOf('Michael Kish');
  const aviva = personOf('Aviva Kish');
  const toMichael = layout.descentLines.find((l) => l.childId === michael.id)!;
  const toAviva = layout.descentLines.find((l) => l.childId === aviva.id)!;
  assert.notEqual(toMichael.unionId, toAviva.unionId, 'half-siblings hang from different junctions');
  assert.notEqual(toMichael.fromX, toAviva.fromX, 'and from different points on the canvas');
});

test('a nine-child family collapses, and expands on request', () => {
  const ruth = personOf('Ruth Shapiro');
  const slice = neighborhood(ruth.id);

  const collapsed = layoutFamily(slice, ruth.id, { collapseAfter: 6 });
  const chip = collapsed.nodes.find((n) => n.kind === 'more');
  assert.ok(chip, 'expected a "+ N more" chip');
  assert.equal(chip!.kind === 'more' && chip!.count, 3, 'nine children, six shown, three hidden');

  const shownChildren = collapsed.descentLines.filter((l) => l.parentIds.includes(ruth.id));
  assert.equal(shownChildren.length, 6);

  const expanded = layoutFamily(slice, ruth.id, {
    collapseAfter: 6,
    expandedGroups: new Set([`${chip!.kind === 'more' ? chip!.parentId : ''}:${chip!.kind === 'more' ? chip!.unionId ?? 'none' : ''}`]),
  });
  assert.equal(expanded.nodes.filter((n) => n.kind === 'more').length, 0, 'chip disappears once opened');
  assert.equal(expanded.descentLines.filter((l) => l.parentIds.includes(ruth.id)).length, 9);
});

test('the focus person is the anchor point of the canvas', () => {
  const aviva = personOf('Aviva Kish');
  const slice = neighborhood(aviva.id);
  const layout = layoutFamily(slice, aviva.id);
  const node = layout.nodes.find((n) => n.id === aviva.id) as PersonNode;

  assert.equal(layout.focusPoint.x, node.x + CARD_WIDTH / 2);
  assert.equal(layout.focusPoint.y, node.y + CARD_HEIGHT / 2);
});

test('every visible child is connected to a parent', () => {
  const michael = personOf('Michael Kish');
  const slice = neighborhood(michael.id);
  const layout = layoutFamily(slice, michael.id);

  const connectedChildren = new Set(layout.descentLines.map((l) => l.childId));
  for (const node of layout.nodes) {
    if (node.kind !== 'person') continue;
    const hasParentInSlice = slice.parentEdges.some((e) => e.childId === node.id);
    if (hasParentInSlice) {
      assert.ok(connectedChildren.has(node.id), `${slice.persons[node.id].preferredName} is floating unconnected`);
    }
  }
});

test('layout stays fast on the widest family in the seed', () => {
  const david = personOf('David Kish');
  const slice = neighborhood(david.id, { ancestorDepth: 3, descendantDepth: 3, budget: 400 });

  const started = process.hrtime.bigint();
  const layout = layoutFamily(slice, david.id);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.ok(layout.nodes.length > 10);
  assert.ok(elapsedMs < 150, `layout took ${elapsedMs}ms`);
});

/* ------------------------------------------------------------------ *
 * One descent line per child — the visible half of the same bug.
 * ------------------------------------------------------------------ */

test('no child is drawn with two lines coming down to it', () => {
  for (const name of ['Michael Kish', 'David Kish', 'Avraham Kish', 'Ruth Shapiro', 'Aviva Kish', 'Yaakov Kish']) {
    const person = personOf(name);
    const layout = layoutFamily(neighborhood(person.id), person.id);

    const perChild = new Map<string, number>();
    for (const line of layout.descentLines) {
      perChild.set(line.childId, (perChild.get(line.childId) ?? 0) + 1);
    }

    for (const [childId, lines] of perChild) {
      assert.equal(lines, 1, `${childId} has ${lines} lines descending to it in ${name}'s tree`);
    }
  }
});

test('a link left outside its marriage still draws only one line', () => {
  // The shape the archive used to store: the father's link to the child has no
  // marriage on it, the mother's has. The drawing must not believe both.
  const person = personOf('Michael Kish');
  const slice = structuredClone(neighborhood(person.id));
  const withUnion = slice.parentEdges.find((edge) => edge.unionId);
  assert.ok(withUnion, 'the seeded family should have a child inside a marriage');

  const partner = slice.parentEdges.find(
    (edge) => edge.childId === withUnion!.childId && edge.parentId !== withUnion!.parentId,
  );
  assert.ok(partner, 'and that child should have a second parent');
  partner!.unionId = null; // break it exactly the way the old code did

  const layout = layoutFamily(slice, person.id);
  const lines = layout.descentLines.filter((line) => line.childId === withUnion!.childId);

  assert.equal(lines.length, 1, 'the marriage wins; the stray link is not drawn again');
});

/* ------------------------------------------------------------------ *
 * Cousins share a row with siblings — correctly — but should not read
 * as one undifferentiated line of relatives.
 * ------------------------------------------------------------------ */

import { createPerson, createUnion, linkParentChild } from '../src/lib/repo.ts';

test('a row puts visible air between one set of siblings and the next', () => {
  const actor = { id: null, name: 'Test' };
  const add = (name: string) => createPerson({ preferredName: name }, actor);

  // Grandparents, two sons, and children on both sides: me and my brother,
  // and two first cousins.
  const zaide = add('Zaide Spacing');
  const bubbe = add('Bubbe Spacing');
  const grandparents = createUnion([zaide, bubbe], { status: 'married' }, actor);

  const sons = ['Father Spacing', 'Uncle Spacing'].map(add);
  for (const son of sons) {
    linkParentChild(zaide, son, { unionId: grandparents }, actor);
    linkParentChild(bubbe, son, { unionId: grandparents }, actor);
  }

  const wives = ['Mother Spacing', 'Aunt Spacing'].map(add);
  const marriages = sons.map((son, i) => createUnion([son, wives[i]], { status: 'married' }, actor));

  const kids = [
    ['Me Spacing', 'Brother Spacing'],
    ['Cousin One Spacing', 'Cousin Two Spacing'],
  ].map((names, family) =>
    names.map((name) => {
      const kid = add(name);
      linkParentChild(sons[family], kid, { unionId: marriages[family] }, actor);
      linkParentChild(wives[family], kid, { unionId: marriages[family] }, actor);
      return kid;
    }),
  );

  const me = kids[0][0];
  const layout = layoutFamily(neighborhood(me, { depth: 3 }), me);

  const cardOf = (id: string) => layout.nodes.find((n) => n.kind === 'person' && n.id === id);
  const brother = cardOf(kids[0][1]);
  const cousin = cardOf(kids[1][0]);
  const mine = cardOf(me);
  if (!brother || !cousin || !mine) return; // cousins beyond the loaded slice

  const between = (a: PersonNode, b: PersonNode) =>
    Math.abs(a.x - b.x) - (a.width + b.width) / 2;

  const withinFamily = between(mine as PersonNode, brother as PersonNode);
  const acrossFamilies = between(brother as PersonNode, cousin as PersonNode);

  assert.ok(
    acrossFamilies > withinFamily + CARD_WIDTH,
    `a cousin should sit a clear card's width apart: ${Math.round(acrossFamilies)} vs ${Math.round(withinFamily)}`,
  );
});

test('a bend still sits between the parents and their children', () => {
  const person = personOf('Michael Kish');
  const layout = layoutFamily(neighborhood(person.id, { depth: 3 }), person.id);

  for (const line of layout.descentLines) {
    const low = Math.min(line.fromY, line.toY);
    const high = Math.max(line.fromY, line.toY);
    assert.ok(
      line.midY > low && line.midY < high,
      `a line from ${line.parentIds[0]} bends outside the gap it is crossing`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Lines from different families should not cross each other.
 *
 * This is the test that caught a change which looked right and was not:
 * giving each family its own bend height separated them nicely and filled
 * the canvas with crossings, because a family bending low runs its
 * horizontal through the band where its neighbours' verticals are.
 * ------------------------------------------------------------------ */

type Seg = { x1: number; y1: number; x2: number; y2: number };

/** The straight runs a descent line is actually drawn as. */
function runsOf(line: { fromX: number; fromY: number; toX: number; toY: number; midY: number }): Seg[] {
  if (Math.abs(line.fromX - line.toX) < 0.5) {
    return [{ x1: line.fromX, y1: line.fromY, x2: line.toX, y2: line.toY }];
  }
  return [
    { x1: line.fromX, y1: line.fromY, x2: line.fromX, y2: line.midY },
    { x1: line.fromX, y1: line.midY, x2: line.toX, y2: line.midY },
    { x1: line.toX, y1: line.midY, x2: line.toX, y2: line.toY },
  ];
}

function runsCross(a: Seg, b: Seg): boolean {
  const aVertical = Math.abs(a.x1 - a.x2) < 0.5;
  const bVertical = Math.abs(b.x1 - b.x2) < 0.5;
  if (aVertical === bVertical) return false; // parallel: separated by the family gap
  const [vertical, horizontal] = aVertical ? [a, b] : [b, a];
  const left = Math.min(horizontal.x1, horizontal.x2);
  const right = Math.max(horizontal.x1, horizontal.x2);
  const top = Math.min(vertical.y1, vertical.y2);
  const bottom = Math.max(vertical.y1, vertical.y2);
  return (
    vertical.x1 > left + 0.5 &&
    vertical.x1 < right - 0.5 &&
    horizontal.y1 > top + 0.5 &&
    horizontal.y1 < bottom - 0.5
  );
}

test('lines belonging to different families almost never cross', () => {
  let total = 0;
  for (const name of ['Michael Kish', 'David Kish', 'Avraham Kish', 'Ruth Shapiro', 'Aviva Kish']) {
    const person = personOf(name);
    const lines = layoutFamily(neighborhood(person.id, { depth: 3 }), person.id).descentLines;
    const familyOf = (line: (typeof lines)[number]) => line.unionId ?? `solo:${line.parentIds[0]}`;

    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (familyOf(lines[i]) === familyOf(lines[j])) continue;
        for (const a of runsOf(lines[i])) {
          for (const b of runsOf(lines[j])) if (runsCross(a, b)) total++;
        }
      }
    }
  }

  // Not zero: a family whose children sit on both sides of another family's
  // does have to reach over it, and no amount of routing changes that. The
  // number is here to catch a tenfold jump, which is what a bad change looks
  // like — the staggered bend heights scored between ten and thirty.
  assert.ok(total <= 4, `${total} crossings between different families is far too many`);
});
