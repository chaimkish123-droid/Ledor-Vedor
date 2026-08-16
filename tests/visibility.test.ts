import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLegacy,
  createMemory,
  createPerson,
  createUnion,
  deleteMemory,
  legacyFor,
  linkParentChild,
  memoriesFor,
  searchPersons,
  updateMemoryVisibility,
} from '../src/lib/repo.ts';
import { canSee, isCloseFamily, visibilityMarker } from '../src/lib/visibility.ts';
import { registerUser } from '../src/lib/auth.ts';

let accounts = 0;
/** A real account, since authorship is what these rules turn on. */
function anAccount(name: string) {
  accounts += 1;
  const id = registerUser({
    email: `person${accounts}@example.test`,
    password: 'a-good-password',
    displayName: name,
  });
  return { id, name };
}

/**
 * Three generations, so "close" can be tested against people who are genuinely
 * near and genuinely far.
 *
 *   Grandmother ══ Grandfather
 *         └── Mother ══ Father
 *               ├── Author
 *               └── Sister
 *   and, far away, a second cousin nobody in this story has met.
 */
function aFamily() {
  const author = anAccount('The author');
  const cousinUser = anAccount('A cousin');

  const grandmother = createPerson({ preferredName: 'Feige Adelman', gender: 'female' }, author);
  const grandfather = createPerson({ preferredName: 'Leib Adelman', gender: 'male' }, author);
  const mother = createPerson({ preferredName: 'Chaya Adelman', gender: 'female' }, author);
  const father = createPerson({ preferredName: 'Berel Adelman', gender: 'male' }, author);
  const me = createPerson({ preferredName: 'Yossi Adelman', gender: 'male' }, author);
  const sister = createPerson({ preferredName: 'Devora Adelman', gender: 'female' }, author);
  const child = createPerson({ preferredName: 'Ari Adelman', gender: 'male' }, author);

  const grandUnion = createUnion([grandfather, grandmother], { status: 'married' }, author);
  linkParentChild(grandmother, mother, { unionId: grandUnion }, author);
  linkParentChild(grandfather, mother, { unionId: grandUnion }, author);

  const parentUnion = createUnion([father, mother], { status: 'married' }, author);
  for (const kid of [me, sister]) {
    linkParentChild(mother, kid, { unionId: parentUnion }, author);
    linkParentChild(father, kid, { unionId: parentUnion }, author);
  }
  linkParentChild(me, child, {}, author);

  // A distant relative: the grandmother's sister's grandchild.
  const greatAunt = createPerson({ preferredName: 'Rivka Perlman', gender: 'female' }, author);
  const greatAuntParent = createPerson({ preferredName: 'Zalman Perlman', gender: 'male' }, author);
  linkParentChild(greatAuntParent, greatAunt, {}, author);
  linkParentChild(greatAuntParent, grandmother, {}, author);
  const cousinParent = createPerson({ preferredName: 'Miri Perlman', gender: 'female' }, author);
  linkParentChild(greatAunt, cousinParent, {}, author);
  const distantCousin = createPerson({ preferredName: 'Tzvi Perlman', gender: 'male' }, author);
  linkParentChild(cousinParent, distantCousin, {}, author);

  return { author, cousinUser, grandmother, mother, me, sister, child, distantCousin };
}

test('close family is calculated from the graph, not from a list', () => {
  const family = aFamily();

  assert.ok(isCloseFamily(family.me, family.me), 'themselves');
  assert.ok(isCloseFamily(family.me, family.mother), 'a parent');
  assert.ok(isCloseFamily(family.me, family.sister), 'a sister');
  assert.ok(isCloseFamily(family.me, family.child), 'a child');
  assert.ok(isCloseFamily(family.me, family.grandmother), 'a grandmother');

  assert.equal(isCloseFamily(family.me, family.distantCousin), false, 'a distant cousin is not close');
});

test('a memory for everyone is read by everyone', () => {
  const family = aFamily();
  createMemory(
    { title: 'The kitchen table', body: 'It had a scorch mark shaped like a leaf.', personIds: [family.mother] },
    family.author,
  );

  const stranger = { userId: family.cousinUser.id, personId: family.distantCousin };
  assert.equal(memoriesFor(family.mother, stranger).length, 1);
});

test('a memory for close family is kept from the rest of the family', () => {
  const family = aFamily();
  createMemory(
    {
      title: 'The year she was unwell',
      body: 'She did not want it spoken about outside the house.',
      personIds: [family.mother],
      visibility: 'close',
    },
    family.author,
  );

  const daughter = { userId: family.cousinUser.id, personId: family.sister };
  const distant = { userId: family.cousinUser.id, personId: family.distantCousin };

  assert.equal(memoriesFor(family.mother, daughter).length, 1, 'her daughter may read it');
  assert.equal(memoriesFor(family.mother, distant).length, 0, 'a distant cousin may not');

  // Somebody with no place in the family yet is not close to anyone.
  assert.equal(memoriesFor(family.mother, { userId: family.cousinUser.id, personId: null }).length, 0);
});

test('a private memory is for its author alone', () => {
  const family = aFamily();
  createMemory(
    { title: 'Not ready', body: 'Still deciding whether to write this down.', personIds: [family.mother], visibility: 'private' },
    family.author,
  );

  assert.equal(memoriesFor(family.mother, { userId: family.author.id, personId: family.me }).length, 1);
  assert.equal(memoriesFor(family.mother, { userId: family.cousinUser.id, personId: family.sister }).length, 0);
  assert.equal(memoriesFor(family.mother, { userId: family.cousinUser.id, personId: family.distantCousin }).length, 0);
});

test('search does not leak what reading directly would not show', () => {
  const family = aFamily();
  createMemory(
    {
      title: 'A difficult winter',
      body: 'The word nobody used aloud was rheumatism.',
      personIds: [family.mother],
      visibility: 'close',
    },
    family.author,
  );
  createMemory(
    { title: 'Unfinished', body: 'A sentence about marzipan I have not finished.', personIds: [family.mother], visibility: 'private' },
    family.author,
  );

  const distant = { userId: family.cousinUser.id, personId: family.distantCousin };
  const sister = { userId: family.cousinUser.id, personId: family.sister };

  assert.equal(searchPersons('rheumatism', 20, distant).length, 0, 'a distant cousin finds nothing');
  assert.ok(searchPersons('rheumatism', 20, sister).length > 0, 'her daughter does');

  assert.equal(searchPersons('marzipan', 20, sister).length, 0, 'nobody else finds a private memory');
  assert.ok(
    searchPersons('marzipan', 20, { userId: family.author.id, personId: family.me }).length > 0,
    'its author does',
  );

  // And with nobody signed in, nothing behind a level is searchable at all.
  assert.equal(searchPersons('rheumatism').length, 0);
  assert.equal(searchPersons('marzipan').length, 0);
});

test('legacy entries follow the same rule', () => {
  const family = aFamily();
  createLegacy(
    { personId: family.grandmother, kind: 'saying', body: 'Never the last one to leave.', visibility: 'close' },
    family.author,
  );

  assert.equal(legacyFor(family.grandmother, { userId: family.cousinUser.id, personId: family.me }).length, 1);
  assert.equal(
    legacyFor(family.grandmother, { userId: family.cousinUser.id, personId: family.distantCousin }).length,
    0,
  );
});

test('an author can change their mind, and nobody else can', () => {
  const family = aFamily();
  const memoryId = createMemory(
    { title: 'On reflection', body: 'Perhaps this is for everyone after all.', personIds: [family.mother], visibility: 'private' },
    family.author,
  );

  assert.throws(
    () => updateMemoryVisibility(memoryId, 'family', family.cousinUser),
    /Only the person who wrote/,
  );

  updateMemoryVisibility(memoryId, 'family', family.author);
  assert.equal(
    memoriesFor(family.mother, { userId: family.cousinUser.id, personId: family.distantCousin }).length,
    1,
  );
});

test('an author can take a memory back', () => {
  const family = aFamily();
  const memoryId = createMemory(
    { title: 'Said in anger', body: 'I should not have written this down.', personIds: [family.mother] },
    family.author,
  );

  assert.throws(
    () => deleteMemory(memoryId, family.cousinUser),
    /Only the person who wrote/,
  );

  deleteMemory(memoryId, family.author);
  assert.equal(
    memoriesFor(family.mother, { userId: family.author.id, personId: family.me }).some(
      (memory) => memory.id === memoryId,
    ),
    false,
  );
});

test('an administrator can clear something up, but cannot read past a level', () => {
  const family = aFamily();
  const memoryId = createMemory(
    { title: 'Private note', body: 'For me.', personIds: [family.mother], visibility: 'private' },
    family.author,
  );

  // Being an administrator does not make somebody else's memory readable.
  const adminAccount = anAccount('An administrator');
  const admin = { userId: adminAccount.id, personId: family.sister };
  assert.equal(memoriesFor(family.mother, admin).length, 0);
  assert.equal(
    canSee(admin, { visibility: 'private', contributorId: family.author.id, subjectIds: [family.mother] }),
    false,
  );

  // They can still remove something the family needs removed.
  deleteMemory(memoryId, adminAccount, true);
  assert.equal(memoriesFor(family.mother, { userId: family.author.id, personId: family.me }).length, 0);
});

test('the interface has plain words for each level', () => {
  assert.equal(visibilityMarker('family'), null, 'the ordinary case needs no marker');
  assert.equal(visibilityMarker('close'), 'Close family only');
  assert.equal(visibilityMarker('private'), 'Only you can see this');
});
