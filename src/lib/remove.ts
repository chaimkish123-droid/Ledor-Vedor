import { db, id as newId, now } from './db';
import { getPerson, recordRevision, type Actor } from './repo';
import { takeBackup } from './backup';

/**
 * Removing somebody from the archive.
 *
 * Editing a fact is ordinary and reversible; removing a person is neither, so
 * this is deliberately a different shape of operation. It says first what will
 * be lost, refuses outright where the loss would be somebody else's, takes a
 * backup before touching anything, and writes down what it did.
 *
 * The common case is a typo two minutes old. The dangerous case is a real
 * relative somebody else has been adding memories to. Nothing in the interface
 * distinguishes those, so the preview has to.
 */

export type RemovalPreview = {
  personId: string;
  name: string;
  /** Reasons the removal cannot go ahead at all. */
  blockers: string[];
  /** What would go with them. */
  losing: {
    parents: number;
    children: number;
    marriages: number;
    memories: number;
    photos: number;
    legacy: number;
  };
  /** People who would be left with no remaining connection to anyone. */
  strandedNames: string[];
};

const count = (sql: string, ...params: unknown[]): number =>
  (db().prepare(sql).get(...params) as { n: number }).n;

export function previewRemoval(personId: string): RemovalPreview {
  const person = getPerson(personId);
  if (!person) throw new Error('That person is no longer in the archive.');

  const blockers: string[] = [];

  const account = db()
    .prepare('SELECT display_name FROM user WHERE person_id = ?')
    .get(personId) as { display_name: string } | undefined;
  if (account) {
    blockers.push(
      `${person.preferredName} is the person behind ${account.display_name}'s account. ` +
        'Removing them would leave that account attached to nobody. Ask them to link their ' +
        'account elsewhere first, or remove the account.',
    );
  }

  const losing = {
    parents: count('SELECT COUNT(*) AS n FROM parent_child WHERE child_id = ?', personId),
    children: count('SELECT COUNT(*) AS n FROM parent_child WHERE parent_id = ?', personId),
    marriages: count('SELECT COUNT(*) AS n FROM union_partner WHERE person_id = ?', personId),
    memories: count(
      'SELECT COUNT(*) AS n FROM memory_person WHERE person_id = ?',
      personId,
    ),
    photos: count('SELECT COUNT(*) AS n FROM photo WHERE person_id = ?', personId),
    legacy: count('SELECT COUNT(*) AS n FROM legacy_entry WHERE person_id = ?', personId),
  };

  // Anyone whose only tie to the family runs through this person becomes an
  // island: still in the archive, reachable by search, but absent from every
  // tree. Worth saying out loud before it happens rather than after.
  const neighbours = db()
    .prepare(
      `SELECT DISTINCT other FROM (
         SELECT parent_id AS other FROM parent_child WHERE child_id = ?
         UNION SELECT child_id  FROM parent_child WHERE parent_id = ?
         UNION SELECT up2.person_id FROM union_partner up1
               JOIN union_partner up2 ON up2.union_id = up1.union_id
               WHERE up1.person_id = ? AND up2.person_id != ?
       ) WHERE other IS NOT NULL`,
    )
    .all(personId, personId, personId, personId) as { other: string }[];

  const strandedNames: string[] = [];
  for (const { other } of neighbours) {
    const remaining = count(
      `SELECT (
         (SELECT COUNT(*) FROM parent_child WHERE (child_id = ? AND parent_id != ?)
                                               OR (parent_id = ? AND child_id != ?))
       + (SELECT COUNT(*) FROM union_partner up1
            JOIN union_partner up2 ON up2.union_id = up1.union_id
            WHERE up1.person_id = ? AND up2.person_id NOT IN (?, ?))
       ) AS n`,
      other, personId,
      other, personId,
      other, other, personId,
    );
    if (remaining === 0) {
      const row = db().prepare('SELECT preferred_name FROM person WHERE id = ?').get(other) as
        | { preferred_name: string }
        | undefined;
      if (row) strandedNames.push(row.preferred_name);
    }
  }

  return { personId, name: person.preferredName, blockers, losing, strandedNames };
}

export async function removePerson(
  personId: string,
  actor: Actor,
): Promise<{ name: string; backup: string }> {
  const preview = previewRemoval(personId);
  if (preview.blockers.length) throw new Error(preview.blockers[0]);

  let backupName: string;
  try {
    const backup = await takeBackup('before-removal');
    backupName = backup.name;
  } catch (error) {
    throw new Error(
      `The archive could not be backed up, so nobody was removed. (${
        error instanceof Error ? error.message : 'unknown error'
      })`,
    );
  }

  const database = db();
  const snapshot = database.prepare('SELECT * FROM person WHERE id = ?').get(personId);

  database.transaction(() => {
    // Marriages this person was half of. A union with one partner left is not
    // a marriage, it is a loose end, so it goes too — the surviving partner is
    // untouched, and any children of it keep their link to that partner.
    const unionIds = (
      database.prepare('SELECT union_id FROM union_partner WHERE person_id = ?').all(personId) as {
        union_id: string;
      }[]
    ).map((row) => row.union_id);

    database.prepare('DELETE FROM person WHERE id = ?').run(personId);

    for (const unionId of unionIds) {
      const left = count('SELECT COUNT(*) AS n FROM union_partner WHERE union_id = ?', unionId);
      if (left < 2) {
        database.prepare('UPDATE parent_child SET union_id = NULL WHERE union_id = ?').run(unionId);
        database.prepare('DELETE FROM union_partner WHERE union_id = ?').run(unionId);
        database.prepare('DELETE FROM union_rel WHERE id = ?').run(unionId);
      }
    }

    // A memory written about this person and nobody else has nothing left to
    // be about. The link rows went with the cascade; the memory itself would
    // otherwise linger, invisible and undeletable.
    database
      .prepare(
        `DELETE FROM memory WHERE id IN (
           SELECT m.id FROM memory m
           WHERE NOT EXISTS (SELECT 1 FROM memory_person mp WHERE mp.memory_id = m.id)
         )`,
      )
      .run();

    recordRevision({
      entityType: 'person',
      entityId: personId,
      action: 'removed',
      summary: `Removed ${preview.name} from the archive`,
      payload: { person: snapshot, backup: backupName },
      actor,
    });
  })();

  return { name: preview.name, backup: backupName };
}
