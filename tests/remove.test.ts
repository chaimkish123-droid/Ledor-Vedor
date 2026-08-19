import test from 'node:test';
import assert from 'node:assert/strict';
import {
  childIdsOf,
  createMemory,
  createPerson,
  createUnion,
  linkParentChild,
  memoriesFor,
  parentIdsOf,
  personCount,
  unionsOfPerson,
} from '../src/lib/repo.ts';
import { previewRemoval, removePerson } from '../src/lib/remove.ts';
import { db, hashPassword, id as newId, now } from '../src/lib/db.ts';

const actor = { id: null, name: 'Test' };

const person = (name: string) => createPerson({ preferredName: name }, actor);

/** A married couple with one child between them. */
function household() {
  const father = person('Yaakov Stern');
  const mother = person('Rivka Stern');
  const unionId = createUnion([father, mother], { status: 'married' }, actor);
  const child = person('Miriam Stern');
  linkParentChild(father, child, { unionId }, actor);
  linkParentChild(mother, child, { unionId }, actor);
  return { father, mother, child, unionId };
}

test('a removal says what will be lost before anything is lost', () => {
  const { father, child } = household();
  const before = personCount();

  const preview = previewRemoval(father);

  assert.equal(preview.name, 'Yaakov Stern');
  assert.equal(preview.losing.children, 1);
  assert.equal(preview.losing.marriages, 1);
  assert.equal(personCount(), before, 'previewing must not remove anybody');
  assert.deepEqual(childIdsOf(father), [child]);
});

test('removing somebody leaves their relatives and their other ties intact', async () => {
  const { father, mother, child } = household();

  await removePerson(father, actor);

  assert.deepEqual(parentIdsOf(child), [mother], 'the other parent survives');
  assert.equal(childIdsOf(mother).length, 1, "the mother's child is untouched");
});

test('a marriage with nobody left in it does not linger', async () => {
  const { father, mother, unionId } = household();
  assert.equal(unionsOfPerson(mother).some((u) => u.id === unionId), true);

  await removePerson(father, actor);

  assert.equal(
    unionsOfPerson(mother).some((u) => u.id === unionId),
    false,
    'a one-sided marriage is not a marriage',
  );
});

test('a memory about nobody else goes with them', async () => {
  const alone = person('Shmuel Alone');
  const other = person('Devorah Both');
  createMemory({ title: 'Alone', personIds: [alone], body: 'Only about him.', visibility: 'everyone' }, actor);
  createMemory({ title: 'Both', personIds: [alone, other], body: 'About them both.', visibility: 'everyone' }, actor);

  await removePerson(alone, actor);

  const left = memoriesFor(other, { userId: null, personId: other, role: 'admin' } as any);
  assert.equal(left.length, 1, 'the shared memory stays');
  assert.match(left[0].body, /both/);
});

test('somebody with an account cannot be quietly removed', () => {
  const linked = person('Chana Account');
  db()
    .prepare(
      `INSERT INTO user (id, email, password_hash, display_name, person_id, role, onboarded, created_at)
       VALUES (?, ?, ?, ?, ?, 'member', 1, ?)`,
    )
    .run(newId(), 'chana@example.com', hashPassword('a-long-password'), 'Chana', linked, now());

  const preview = previewRemoval(linked);
  assert.equal(preview.blockers.length, 1);
  assert.match(preview.blockers[0], /account/i);

  return assert.rejects(() => removePerson(linked, actor), /account/i);
});

test('anyone left with no other connection is named in advance', () => {
  const bridge = person('Aharon Bridge');
  const onlyChild = person('Tzvi Only');
  linkParentChild(bridge, onlyChild, {}, actor);

  const preview = previewRemoval(bridge);

  assert.deepEqual(preview.strandedNames, ['Tzvi Only']);
});

test('the removal is written down, with the backup that preceded it', async () => {
  const doomed = person('Ephraim Gone');
  const outcome = await removePerson(doomed, actor);

  assert.equal(outcome.name, 'Ephraim Gone');
  assert.ok(outcome.backup, 'a backup is taken before anybody is removed');

  const revision = db()
    .prepare("SELECT * FROM revision WHERE entity_id = ? AND action = 'removed'")
    .get(doomed) as Record<string, any> | undefined;
  assert.ok(revision, 'the removal appears in the history');
  assert.match(revision!.summary, /Ephraim Gone/);
});

/* ------------------------------------------------------------------ *
 * A child belongs to a marriage, not to one parent.
 *
 * The API decides this, so the rule is asserted here against the same
 * repository calls the route makes: with exactly one marriage to mean, a
 * child added to either partner is a child of both.
 * ------------------------------------------------------------------ */

import { spouseIdsOf } from '../src/lib/repo.ts';

/** What POST /api/person does for `relation: 'child'`, in miniature. */
function addChild(anchorId: string, name: string, explicitUnionId?: string | null) {
  const childId = person(name);
  let unionId: string | null = explicitUnionId ?? null;
  if (!unionId) {
    const unions = unionsOfPerson(anchorId);
    if (unions.length === 1) unionId = unions[0].id;
  }
  linkParentChild(anchorId, childId, { unionId }, actor);
  if (unionId) {
    const union = unionsOfPerson(anchorId).find((u) => u.id === unionId);
    for (const partnerId of union?.partnerIds ?? []) {
      if (partnerId !== anchorId) linkParentChild(partnerId, childId, { unionId }, actor);
    }
  }
  return childId;
}

test('a child added to one married parent belongs to both', () => {
  const father = person('Dov Pair');
  const mother = person('Leah Pair');
  createUnion([father, mother], { status: 'married' }, actor);

  const child = addChild(father, 'Yosef Pair');

  assert.deepEqual(
    parentIdsOf(child).sort(),
    [father, mother].sort(),
    'the mother should not have to be added a second time',
  );
});

test('with two marriages it does not guess which family a child belongs to', () => {
  const twice = person('Shimon Twice');
  const first = person('Bracha First');
  const second = person('Gittel Second');
  createUnion([twice, first], { status: 'widowed' }, actor);
  createUnion([twice, second], { status: 'married' }, actor);
  assert.equal(spouseIdsOf(twice).length, 2);

  const child = addChild(twice, 'Naftali Twice');

  assert.deepEqual(parentIdsOf(child), [twice], 'guessing a mother would be worse than asking');
});

/* ------------------------------------------------------------------ *
 * One line per child.
 * ------------------------------------------------------------------ */

import { adoptEdgeIntoUnion, alignParentEdgesToUnions } from '../src/lib/repo.ts';

/** What POST /api/person does for `relation: 'parent'`, in miniature. */
function addParent(childId: string, name: string, existingParents: string[]) {
  const parentId = person(name);
  let unionId: string | null = null;
  if (existingParents.length === 1) {
    unionId = createUnion([existingParents[0], parentId], { status: 'married' }, actor);
    adoptEdgeIntoUnion(existingParents[0], childId, unionId);
  }
  linkParentChild(parentId, childId, { unionId }, actor);
  return parentId;
}

const unionsOfChild = (childId: string): (string | null)[] =>
  (
    db()
      .prepare('SELECT union_id FROM parent_child WHERE child_id = ?')
      .all(childId) as { union_id: string | null }[]
  ).map((row) => row.union_id);

test('parents added one at a time end up in the same marriage', () => {
  const child = person('Shira One');
  const father = addParent(child, 'Avi One', []);
  addParent(child, 'Sara One', [father]);

  const unions = new Set(unionsOfChild(child));
  assert.equal(unions.size, 1, 'a child descending from two places is drawn twice');
  assert.equal([...unions][0] !== null, true, 'and that one place is the marriage');
});

test('links already stored outside their marriage are repaired', () => {
  const child = person('Shira Old');
  const father = person('Avi Old');
  const mother = person('Sara Old');
  // The old behaviour, reproduced exactly.
  linkParentChild(father, child, { unionId: null }, actor);
  const unionId = createUnion([father, mother], { status: 'married' }, actor);
  linkParentChild(mother, child, { unionId }, actor);
  assert.equal(new Set(unionsOfChild(child)).size, 2, 'precondition: the broken shape');

  const repaired = alignParentEdgesToUnions();

  assert.ok(repaired >= 1);
  assert.deepEqual(unionsOfChild(child), [unionId, unionId]);
});

test('a genuinely unknown other parent is left alone', () => {
  const child = person('Yitzchak Alone');
  const onlyParent = person('Rachel Alone');
  linkParentChild(onlyParent, child, { unionId: null }, actor);

  alignParentEdgesToUnions();

  assert.deepEqual(unionsOfChild(child), [null], 'no marriage should be invented');
});

/* ------------------------------------------------------------------ *
 * How many people descend from someone.
 * ------------------------------------------------------------------ */

import { descendantCounts } from '../src/lib/repo.ts';

test('generations are counted separately, and totalled', () => {
  const founder = person('Zaide Founder');
  const kids = ['A', 'B'].map((n) => person(`Child ${n}`));
  for (const kid of kids) linkParentChild(founder, kid, {}, actor);

  const grandkids = ['C', 'D', 'E'].map((n) => person(`Grandchild ${n}`));
  linkParentChild(kids[0], grandkids[0], {}, actor);
  linkParentChild(kids[0], grandkids[1], {}, actor);
  linkParentChild(kids[1], grandkids[2], {}, actor);

  const great = person('Great-grandchild F');
  linkParentChild(grandkids[0], great, {}, actor);

  const counts = descendantCounts(founder);

  assert.deepEqual(counts.generations, [2, 3, 1]);
  assert.equal(counts.total, 6);
});

test('somebody reachable two ways is counted once, at the nearer generation', () => {
  // Cousins who married: their child descends from the founder by two paths.
  const founder = person('Zaide Twice');
  const sonA = person('Son A');
  const sonB = person('Son B');
  linkParentChild(founder, sonA, {}, actor);
  linkParentChild(founder, sonB, {}, actor);

  const shared = person('Cousin Child');
  linkParentChild(sonA, shared, {}, actor);
  linkParentChild(sonB, shared, {}, actor);

  const counts = descendantCounts(founder);

  assert.deepEqual(counts.generations, [2, 1], 'the shared grandchild is one person, not two');
  assert.equal(counts.total, 3);
});

test('a person with no children has nothing to count', () => {
  const counts = descendantCounts(person('Nobody Descends'));
  assert.deepEqual(counts.generations, []);
  assert.equal(counts.total, 0);
});

test('the people who married in are counted, but kept apart from the bloodline', () => {
  const founder = person('Bubbe Root');
  const son = person('Son Root');
  const daughterInLaw = person('Wife Married-In');
  const grandchild = person('Grandchild Root');

  linkParentChild(founder, son, {}, actor);
  const marriage = createUnion([son, daughterInLaw], { status: 'married' }, actor);
  linkParentChild(son, grandchild, { unionId: marriage }, actor);
  linkParentChild(daughterInLaw, grandchild, { unionId: marriage }, actor);

  const counts = descendantCounts(founder);

  assert.deepEqual(counts.generations, [1, 1], 'one son, one grandchild');
  assert.equal(counts.total, 2, 'the daughter-in-law is not a descendant');
  assert.equal(counts.marriedIn, 1, 'but she is family, and counted');
});

test('a spouse who is also a descendant is not counted twice', () => {
  // Cousins who married: she descends from the founder and married in.
  const founder = person('Zaide Cousins');
  const sonA = person('Son Cousins A');
  const sonB = person('Son Cousins B');
  linkParentChild(founder, sonA, {}, actor);
  linkParentChild(founder, sonB, {}, actor);

  const cousinOne = person('Cousin One');
  const cousinTwo = person('Cousin Two');
  linkParentChild(sonA, cousinOne, {}, actor);
  linkParentChild(sonB, cousinTwo, {}, actor);
  createUnion([cousinOne, cousinTwo], { status: 'married' }, actor);

  const counts = descendantCounts(founder);

  assert.equal(counts.total, 4);
  assert.equal(counts.marriedIn, 0, 'they were already in the family');
});

/* ------------------------------------------------------------------ *
 * A married name, and the name she was born with.
 * ------------------------------------------------------------------ */

import { getPerson, searchPersons } from '../src/lib/repo.ts';

test('a woman marrying in is findable under both her names', () => {
  const husband = person('Yosef Kaufman');
  // What the add-a-spouse panel sends once the tick is left in place.
  const wife = createPerson(
    {
      preferredName: 'Sara Kaufman',
      givenName: 'Sara',
      familyName: 'Kaufman',
      birthName: 'Sara Goldberger',
      gender: 'female',
    },
    actor,
  );
  createUnion([husband, wife], { status: 'married' }, actor);

  const stored = getPerson(wife)!;
  assert.equal(stored.preferredName, 'Sara Kaufman', 'known by her married name');
  assert.equal(stored.birthName, 'Sara Goldberger', 'and the family she came from is kept');

  const byMarried = searchPersons('Sara Kaufman').map((hit) => hit.person.id);
  const byMaiden = searchPersons('Goldberger').map((hit) => hit.person.id);
  assert.ok(byMarried.includes(wife), 'a cousin looking for her married name finds her');
  assert.ok(byMaiden.includes(wife), 'and so does one who only ever knew her maiden name');
});

test('a name at birth is only kept when it differs', () => {
  const wife = createPerson(
    { preferredName: 'Rochel Stern', givenName: 'Rochel', familyName: 'Stern', gender: 'female' },
    actor,
  );
  assert.equal(getPerson(wife)!.birthName, null, 'nothing invented where nothing changed');
});
