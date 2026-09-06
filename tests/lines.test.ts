import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachChildrenToUnion,
  createPerson,
  createUnion,
  findSharedUnion,
  linkParentChild,
  loneChildrenOf,
  parentIdsOf,
  unionsOfPerson,
} from '../src/lib/repo.ts';
import { closeDb, db } from '../src/lib/db.ts';

/**
 * One line from both parents.
 *
 * A child with a father and a mother is drawn from the marriage between them,
 * never from one of them alone. That depends on both parent links carrying the
 * same marriage — and there were several ways for records to end up otherwise.
 */

const actor = { id: null, name: 'Test' };
const person = (name: string) => createPerson({ preferredName: name }, actor);

const unionOfLink = (parentId: string, childId: string): string | null =>
  (db().prepare('SELECT union_id FROM parent_child WHERE parent_id = ? AND child_id = ?').get(parentId, childId) as
    | { union_id: string | null }
    | undefined)?.union_id ?? null;

/** Reopen the database, which runs the start-up repairs again. */
function restart() {
  closeDb();
  db();
}

test('children recorded before the marriage was join it on start-up', () => {
  const father = person('Moshe Weiss');
  const mother = person('Sara Weiss');
  const child = person('Dina Weiss');
  linkParentChild(father, child, {}, actor);
  linkParentChild(mother, child, {}, actor);
  const unionId = createUnion([father, mother], { status: 'married' }, actor);

  restart();

  assert.equal(unionOfLink(father, child), unionId);
  assert.equal(unionOfLink(mother, child), unionId);
});

test('two parents with no marriage recorded are given one, so the child hangs from both', () => {
  const father = person('Shimon Roth');
  const mother = person('Malka Roth');
  const child = person('Aharon Roth');
  const second = person('Bracha Roth');
  linkParentChild(father, child, {}, actor);
  linkParentChild(mother, child, {}, actor);
  linkParentChild(father, second, {}, actor);
  linkParentChild(mother, second, {}, actor);
  assert.equal(findSharedUnion(father, mother), null);

  restart();

  const unionId = findSharedUnion(father, mother);
  assert.ok(unionId, 'a marriage now exists between them');
  assert.equal(unionsOfPerson(father).length, 1, 'one marriage, not one per child');
  assert.equal(unionOfLink(father, child), unionId);
  assert.equal(unionOfLink(mother, child), unionId);
  assert.equal(unionOfLink(mother, second), unionId);
});

test('a parent with a partner genuinely unknown is left alone', () => {
  const mother = person('Chaya Alone');
  const child = person('Tova Alone');
  linkParentChild(mother, child, {}, actor);

  restart();

  assert.equal(unionOfLink(mother, child), null);
  assert.equal(unionsOfPerson(mother).length, 0);
});

test('a husband or wife added after the children can claim them', () => {
  const father = person('Yosef Klein');
  const son = person('Meir Klein');
  const daughter = person('Ruth Klein');
  linkParentChild(father, son, {}, actor);
  linkParentChild(father, daughter, {}, actor);
  assert.deepEqual(new Set(loneChildrenOf(father)), new Set([son, daughter]));

  const mother = person('Esther Klein');
  const unionId = createUnion([father, mother], { status: 'married' }, actor);
  attachChildrenToUnion(father, mother, unionId, loneChildrenOf(father), actor);

  assert.deepEqual(new Set(parentIdsOf(son)), new Set([father, mother]));
  assert.equal(unionOfLink(father, son), unionId);
  assert.equal(unionOfLink(mother, daughter), unionId);
  assert.deepEqual(loneChildrenOf(father), [], 'nobody is left hanging from one parent');
});

test('a child who already has both parents is never offered to a new spouse', () => {
  const father = person('Dov Baum');
  const mother = person('Leah Baum');
  const child = person('Zev Baum');
  const unionId = createUnion([father, mother], { status: 'married' }, actor);
  linkParentChild(father, child, { unionId }, actor);
  linkParentChild(mother, child, { unionId }, actor);

  assert.deepEqual(loneChildrenOf(father), []);
});

