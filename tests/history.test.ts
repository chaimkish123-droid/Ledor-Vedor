import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPerson,
  getPerson,
  revertRevision,
  revisionsFor,
  searchPersons,
  updatePerson,
  createMemory,
  createLegacy,
  upsertPlace,
} from '../src/lib/repo.ts';
import { parseDateInput } from '../src/lib/dates.ts';

const actor = { id: null, name: 'Test' };

test('an edit can be put back exactly, and nothing is erased', () => {
  const personId = createPerson(
    {
      preferredName: 'Zev Hartman',
      birth: parseDateInput('2 April 1953'),
      birthPlace: 'Vilnius, Lithuania',
    },
    actor,
  );

  updatePerson(personId, { preferredName: 'Zeev Hartman', birth: parseDateInput('1955') }, actor);

  const after = getPerson(personId)!;
  assert.equal(after.preferredName, 'Zeev Hartman');
  assert.equal(after.birth.value, '1955');
  assert.equal(after.birth.precision, 'year');

  const revisions = revisionsFor('person', personId);
  const dateChange = revisions.find((r) => r.field === 'Date of birth')!;
  const nameChange = revisions.find((r) => r.field === 'Name')!;

  assert.ok(dateChange.revertable, 'a field edit must be revertable');
  assert.equal(dateChange.oldValue, 'April 2, 1953', 'history reads in human terms');

  revertRevision(dateChange.id, actor);
  revertRevision(nameChange.id, actor);

  const restored = getPerson(personId)!;
  assert.equal(restored.preferredName, 'Zev Hartman');
  // The whole date comes back, not just the year that was displayed.
  assert.equal(restored.birth.value, '1953-04-02');
  assert.equal(restored.birth.precision, 'exact');

  // A restore is a change of its own; the mistake stays in the record.
  const afterRevert = revisionsFor('person', personId);
  assert.ok(afterRevert.length > revisions.length);
  assert.ok(afterRevert.some((r) => r.summary?.startsWith('Restored')));
});

test('restoring a name puts it back into search', () => {
  const personId = createPerson({ preferredName: 'Perel Nussbaum' }, actor);
  updatePerson(personId, { preferredName: 'Pearl Nussbaum' }, actor);

  assert.equal(searchPersons('Perel').length, 0, 'the old name is no longer current');

  const change = revisionsFor('person', personId).find((r) => r.field === 'Name')!;
  revertRevision(change.id, actor);

  assert.ok(
    searchPersons('Perel').some((hit) => hit.person.id === personId),
    'search follows the restored name',
  );
});

test('a creation cannot be undone by reverting', () => {
  const personId = createPerson({ preferredName: 'Feivel Adler' }, actor);
  const creation = revisionsFor('person', personId).find((r) => r.action === 'create')!;

  assert.equal(creation.revertable, false);
  assert.throws(() => revertRevision(creation.id, actor), /cannot be undone/);
});

test('search finds people by year, place, story and legacy', () => {
  const personId = createPerson(
    {
      preferredName: 'Golda Reiss',
      birth: parseDateInput('1911'),
      birthPlace: 'Salonica, Greece',
      biography: 'She ran a fabric stall by the harbour for forty years.',
    },
    actor,
  );

  createMemory(
    {
      title: 'The blue thread',
      body: 'She kept a spool of blue thread that had come with her from Salonica.',
      personIds: [personId],
    },
    actor,
  );
  createLegacy({ personId, kind: 'saying', body: 'Measure twice, she always said, and be kind once more.' }, actor);

  const byYear = searchPersons('1911');
  assert.ok(byYear.some((hit) => hit.person.id === personId), 'a year finds a person');
  assert.match(byYear.find((hit) => hit.person.id === personId)!.context ?? '', /born 1911/);

  const byPlace = searchPersons('Salonica');
  assert.ok(byPlace.some((hit) => hit.person.id === personId), 'a place finds a person');

  const byStory = searchPersons('fabric stall');
  assert.ok(byStory.some((hit) => hit.person.id === personId), 'a line of biography finds a person');

  const byMemory = searchPersons('blue thread');
  assert.ok(byMemory.some((hit) => hit.person.id === personId), 'a memory finds a person');

  const byLegacy = searchPersons('Measure twice');
  assert.ok(byLegacy.some((hit) => hit.person.id === personId), 'a saying finds a person');

  // A name still outranks a passing mention.
  const byName = searchPersons('Golda');
  assert.equal(byName[0].person.id, personId);
  assert.equal(byName[0].matchedKind, 'preferred');
});

test('places are reused rather than duplicated', () => {
  const first = upsertPlace('Brooklyn, New York');
  const again = upsertPlace('  brooklyn,   new york  ');
  assert.equal(first, again, 'the same place typed differently is the same place');
});
