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
