import test from 'node:test';
import assert from 'node:assert/strict';
import { findLikelyDuplicates, mergePeople, previewMerge } from '../src/lib/merge.ts';
import {
  createLegacy,
  createMemory,
  createPerson,
  createUnion,
  getPerson,
  getSummary,
  legacyFor,
  linkParentChild,
  memoriesFor,
  parentIdsOf,
  childIdsOf,
  personCount,
  revisionsFor,
  searchPersons,
  unionsOfPerson,
} from '../src/lib/repo.ts';
import { parseDateInput } from '../src/lib/dates.ts';
import { dbGraph } from '../src/lib/graph-db.ts';
import { describe as describeRel, relationship } from '../src/lib/relationships.ts';
import { portraitOf, setPortrait } from '../src/lib/photos.ts';
import { deflateSync } from 'node:zlib';

const actor = { id: null, name: 'Test' };

function png(size = 40): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, crcBuffer]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(
    Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x77)])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The situation this exists for: the same grandmother entered twice, each copy
 * holding half of what the family knows about her.
 */
function twoCopiesOfOneWoman() {
  const husband = createPerson({ preferredName: 'Aharon Blum', gender: 'male' }, actor);
  const daughter = createPerson({ preferredName: 'Rochel Blum', birth: parseDateInput('1951') }, actor);
  const son = createPerson({ preferredName: 'Naftali Blum', birth: parseDateInput('1954') }, actor);

  // The record everyone has been using: her married name, her marriage, one child.
  const keep = createPerson(
    { preferredName: 'Malka Blum', gender: 'female', birth: parseDateInput('1928'), birthPlace: 'Vienna, Austria' },
    actor,
  );
  const union = createUnion([husband, keep], { status: 'married', start: parseDateInput('1949') }, actor);
  linkParentChild(keep, daughter, { unionId: union }, actor);
  linkParentChild(husband, daughter, { unionId: union }, actor);

  // The one a cousin added later: her maiden name, her Hebrew name, the other child.
  const absorb = createPerson(
    {
      preferredName: 'Malka Grunwald',
      gender: 'female',
      hebrewName: 'מלכה בת אליעזר',
      birth: parseDateInput('1928'),
      biography: 'She kept the shop accounts in her head.',
    },
    actor,
  );
  linkParentChild(absorb, son, {}, actor);
  createMemory({ title: 'Her handwriting', body: 'Small and very straight.', personIds: [absorb] }, actor);
  createLegacy({ personId: absorb, kind: 'saying', body: 'Sit down, you have time.' }, actor);

  return { keep, absorb, husband, daughter, son };
}

test('a preview says what will move and changes nothing', () => {
  const { keep, absorb } = twoCopiesOfOneWoman();
  const before = personCount();

  const preview = previewMerge(keep, absorb);

  assert.equal(preview.keep.preferredName, 'Malka Blum');
  assert.equal(preview.absorb.preferredName, 'Malka Grunwald');
  assert.equal(preview.brings.children, 1);
  assert.equal(preview.brings.memories, 1);
  assert.equal(preview.brings.legacy, 1);
  assert.deepEqual(preview.blockers, []);

  const nameField = preview.fields.find((field) => field.key === 'preferredName')!;
  assert.equal(nameField.conflict, true, 'the two names disagree, so someone must choose');

  const hebrewField = preview.fields.find((field) => field.key === 'hebrewName')!;
  assert.equal(hebrewField.conflict, false, 'one side being blank is not a conflict');

  assert.equal(personCount(), before, 'a preview must not touch the archive');
});

test('merging gathers one life back into one record', async () => {
  const { keep, absorb, husband, daughter, son } = twoCopiesOfOneWoman();
  const before = personCount();

  const outcome = await mergePeople(keep, absorb, {}, actor);

  assert.equal(personCount(), before - 1, 'there is one fewer person, not one more');
  assert.equal(getPerson(absorb), null, 'the duplicate record is gone');
  assert.ok(outcome.backup, 'a backup was taken first');

  // Both children now belong to her.
  const children = childIdsOf(keep);
  assert.ok(children.includes(daughter));
  assert.ok(children.includes(son), 'the child from the other record came across');

  // Her marriage survived, and so did what each copy knew about her.
  assert.equal(unionsOfPerson(keep).length, 1);
  assert.equal(getPerson(keep)!.hebrewName, 'מלכה בת אליעזר', 'a field only the duplicate had is kept');
  assert.match(getPerson(keep)!.biography ?? '', /shop accounts/);
  assert.equal(memoriesFor(keep).length, 1, 'her memory moved with her');
  assert.equal(legacyFor(keep).length, 1, 'and so did her legacy');

  // She is still findable under the name the other record used.
  assert.ok(
    searchPersons('Grunwald').some((hit) => hit.person.id === keep),
    'nobody should stop being findable by a name they had',
  );

  // And the relationship engine now sees one grandmother, not two.
  const graph = dbGraph();
  assert.equal(describeRel(relationship(graph, son, daughter), 'female'), 'sister');
  // Her husband is not recorded as the son's parent, and only one parent is
  // known — so the honest answer is what is actually recorded, not a guess in
  // either direction.
  assert.equal(describeRel(relationship(graph, son, husband), 'male'), "mother's husband");
});

test('the reader can choose which record is right', async () => {
  const { keep, absorb } = twoCopiesOfOneWoman();

  await mergePeople(keep, absorb, { preferredName: 'absorb' }, actor);

  assert.equal(getPerson(keep)!.preferredName, 'Malka Grunwald', 'the chosen name won');
  assert.ok(searchPersons('Malka Blum').some((hit) => hit.person.id === keep), 'the other name still finds her');
});

test('what was absorbed is kept in the history', async () => {
  const { keep, absorb } = twoCopiesOfOneWoman();
  await mergePeople(keep, absorb, {}, actor);

  const revisions = revisionsFor('person', keep);
  const mergeEntry = revisions.find((revision) => revision.summary?.startsWith('Merged in'))!;
  assert.ok(mergeEntry, 'the merge itself is recorded');

  // The absorbed record's own history is readable under the survivor.
  assert.ok(revisions.some((revision) => revision.summary?.includes('Malka Grunwald')));
});

test('a parent and child are never treated as one person', () => {
  const parent = createPerson({ preferredName: 'Dov Adler' }, actor);
  const child = createPerson({ preferredName: 'Dov Adler' }, actor);
  linkParentChild(parent, child, {}, actor);

  const preview = previewMerge(parent, child);
  assert.ok(preview.blockers.length > 0);
  assert.match(preview.blockers[0], /parent and child/);
});

test('a married couple are never treated as one person', () => {
  const husband = createPerson({ preferredName: 'Zev Klein' }, actor);
  const wife = createPerson({ preferredName: 'Zev Klein' }, actor);
  createUnion([husband, wife], { status: 'married' }, actor);

  const preview = previewMerge(husband, wife);
  assert.ok(preview.blockers.some((blocker) => /married/.test(blocker)));
});

test('one marriage recorded twice becomes one marriage', async () => {
  const wife = createPerson({ preferredName: 'Sima Roth' }, actor);
  const keep = createPerson({ preferredName: 'Elias Roth' }, actor);
  const absorb = createPerson({ preferredName: 'Elias Roth' }, actor);
  const child = createPerson({ preferredName: 'Tovah Roth' }, actor);

  // Both copies of him are recorded as married to her.
  const first = createUnion([keep, wife], { status: 'married' }, actor);
  const second = createUnion([absorb, wife], { status: 'married' }, actor);
  linkParentChild(absorb, child, { unionId: second }, actor);
  linkParentChild(wife, child, { unionId: second }, actor);

  await mergePeople(keep, absorb, {}, actor);

  const unions = unionsOfPerson(keep);
  assert.equal(unions.length, 1, 'he is married to her once, not twice');
  assert.equal(unions[0].id, first);
  assert.ok(unions[0].childIds.includes(child), 'and their child came with the surviving marriage');
  assert.deepEqual(parentIdsOf(child).sort(), [keep, wife].sort());
});

test('the surviving portrait is kept, and a lone one is inherited', async () => {
  const keepWithFace = createPerson({ preferredName: 'Bluma Stein' }, actor);
  const absorbNoFace = createPerson({ preferredName: 'Bluma Stein' }, actor);
  setPortrait({ personId: keepWithFace, image: png(), thumb: png(20) }, actor);
  const kept = portraitOf(keepWithFace)!.id;

  await mergePeople(keepWithFace, absorbNoFace, {}, actor);
  assert.equal(portraitOf(keepWithFace)!.id, kept, 'the surviving photograph stays');

  const plain = createPerson({ preferredName: 'Hinda Stein' }, actor);
  const withFace = createPerson({ preferredName: 'Hinda Stein' }, actor);
  setPortrait({ personId: withFace, image: png(), thumb: png(20) }, actor);

  await mergePeople(plain, withFace, {}, actor);
  assert.ok(portraitOf(plain), 'a person with no photograph inherits the one that was there');
  assert.equal(getSummary(plain)!.photoId, portraitOf(plain)!.id, 'and it shows on their card');
});

test('likely duplicates are found without flagging a namesake child', () => {
  const grandfather = createPerson({ preferredName: 'Shimon Perl', birth: parseDateInput('1900') }, actor);
  const grandson = createPerson({ preferredName: 'Shimon Perl', birth: parseDateInput('1960') }, actor);
  const father = createPerson({ preferredName: 'Yaakov Perl', birth: parseDateInput('1930') }, actor);
  linkParentChild(grandfather, father, {}, actor);
  linkParentChild(father, grandson, {}, actor);

  const twinA = createPerson({ preferredName: 'Nechama Perl', birth: parseDateInput('1935') }, actor);
  const twinB = createPerson({ preferredName: 'Nechama Perl', birth: parseDateInput('1935') }, actor);

  const found = findLikelyDuplicates();

  const flaggedNamesakes = found.some(
    (pair) =>
      (pair.a.id === grandfather && pair.b.id === grandson) || (pair.a.id === grandson && pair.b.id === grandfather),
  );
  assert.equal(flaggedNamesakes, false, 'a grandson named after his grandfather is tradition, not duplication');

  const flaggedRealPair = found.some(
    (pair) => (pair.a.id === twinA && pair.b.id === twinB) || (pair.a.id === twinB && pair.b.id === twinA),
  );
  assert.ok(flaggedRealPair, 'two records with the same name and birth year are worth a look');
});

test('a shortened name is recognised as the same name', async () => {
  const { nameSimilarity } = await import('../src/lib/repo.ts');

  // The way families actually write names down.
  assert.ok(nameSimilarity('Ruth Shapiro', 'Ruthie Shapiro') >= 0.6, 'Ruth and Ruthie');
  assert.ok(nameSimilarity('Ari Blum', 'Arieh Blum') >= 0.6, 'Ari and Arieh');
  assert.equal(nameSimilarity('Malka Blum', 'Malka Blum'), 1);

  // But a shared surname alone is not a resemblance — most of a family shares one.
  assert.ok(nameSimilarity('Rochel Blum', 'Naftali Blum') < 0.6, 'siblings are not duplicates');
  assert.ok(nameSimilarity('David Kish', 'Sarah Weiss') < 0.3);
});

test('a shared surname and the very same birthday is worth flagging', () => {
  const sameDay = parseDateInput('30 November 1950');
  const a = createPerson({ preferredName: 'Ruth Sondheim', birth: sameDay }, actor);
  const b = createPerson({ preferredName: 'Ruthie Sondheim', birth: sameDay }, actor);

  const found = findLikelyDuplicates();
  const pair = found.find(
    (candidate) =>
      (candidate.a.id === a && candidate.b.id === b) || (candidate.a.id === b && candidate.b.id === a),
  );

  assert.ok(pair, 'the same person under a shortened name should surface');
  assert.ok(pair!.reasons.includes('Born the same day'));
});
