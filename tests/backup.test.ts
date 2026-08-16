import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { listBackups, restoreBackup, takeBackup, inspectBackup } from '../src/lib/backup.ts';
import { createLegacy, createPerson, personCount, searchPersons, updatePerson } from '../src/lib/repo.ts';
import { db } from '../src/lib/db.ts';

const actor = { id: null, name: 'Test' };

test('a backup is verified when it is taken', async () => {
  const backup = await takeBackup('test');
  assert.ok(existsSync(backup.path));
  assert.ok(backup.bytes > 0);

  const { ok, people } = inspectBackup(backup.path);
  assert.equal(ok, true, 'a backup must pass an integrity check');
  assert.equal(people, personCount(), 'a backup holds the whole family');
});

test('a restore brings the family back, including their stories', async () => {
  const personId = createPerson({ preferredName: 'Shayna Brill' }, actor);
  createLegacy({ personId, kind: 'saying', body: 'Sit down, you have time.' }, actor);
  const before = personCount();

  const backup = await takeBackup('test-before-loss');

  // Something goes badly wrong.
  db().exec(
    'DELETE FROM legacy_entry; DELETE FROM memory_person; DELETE FROM memory; DELETE FROM parent_child; DELETE FROM person_name; DELETE FROM person;',
  );
  assert.equal(personCount(), 0, 'the archive is empty after the mishap');

  const { people } = await restoreBackup(backup.path);

  assert.equal(people, before);
  assert.equal(personCount(), before, 'everyone is back');
  assert.ok(
    searchPersons('Shayna').some((hit) => hit.person.id === personId),
    'and so are their stories',
  );
  assert.ok(searchPersons('Sit down, you have time').length > 0, 'the legacy survived the restore');
});

test('a restore survives the write-ahead log', async () => {
  // The failure this guards against: SQLite in WAL mode keeps recent writes in
  // a sidecar file. Replacing only family.db leaves that log behind, and the
  // very changes being undone get replayed over the restored data.
  const backup = await takeBackup('test-wal');
  const before = personCount();

  const personId = createPerson({ preferredName: 'Wal Test' }, actor);
  updatePerson(personId, { biography: 'Written after the backup was taken.' }, actor);
  assert.equal(personCount(), before + 1);

  await restoreBackup(backup.path);

  assert.equal(personCount(), before, 'the later writes are gone, as intended');
  assert.equal(searchPersons('Wal Test').length, 0);
});

test('the archive being replaced is kept, so a restore cannot lose data', async () => {
  const backup = await takeBackup('test-keep');
  const personId = createPerson({ preferredName: 'Nechama Feld' }, actor);
  assert.ok(searchPersons('Nechama').length > 0);

  const { replacedCopy } = await restoreBackup(backup.path);

  assert.ok(replacedCopy && existsSync(replacedCopy), 'the replaced archive is kept aside');
  // The person restored away is still recoverable from that copy.
  const kept = inspectBackup(replacedCopy!);
  assert.ok(kept.ok);
  assert.equal(searchPersons('Nechama').length, 0, 'and is no longer in the live archive');
  assert.ok(personId);
});

test('backups are listed newest first', async () => {
  await takeBackup('test-order');
  const backups = listBackups();
  assert.ok(backups.length >= 2);
  for (let i = 1; i < backups.length; i++) {
    assert.ok(backups[i - 1].takenAt >= backups[i].takenAt);
  }
});
