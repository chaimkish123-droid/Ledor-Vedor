import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema';
import { randomUUID, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

let database: Database.Database | null = null;

export function db(): Database.Database {
  if (database) return database;

  const dir = process.env.LDOR_DATA_DIR || path.join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });

  database = new Database(path.join(dir, 'family.db'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.exec(SCHEMA);
  migrate(database);

  return database;
}

/**
 * Additive migrations. A family archive is meant to outlive its schema, so
 * columns are added in place rather than by rebuilding anyone's database.
 */
function migrate(database: Database.Database) {
  const columnsOf = (table: string) =>
    (database.pragma(`table_info(${table})`) as { name: string }[]).map((column) => column.name);

  const addColumn = (table: string, column: string, definition: string) => {
    if (!columnsOf(table).includes(column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  // Enough detail on each revision to put a value back exactly as it was.
  addColumn('revision', 'column_name', 'TEXT');
  addColumn('revision', 'payload', 'TEXT');

  // An invitation left in an old email should not open the family archive
  // years later.
  addColumn('invitation', 'expires_at', 'TEXT');

  // The face shown on a person's card, when the family has given them one.
  addColumn('person', 'primary_photo_id', 'TEXT');

  /*
   * Who a memory is for.
   *
   * Facts about a family are shared; what someone remembers is not always
   * meant for every cousin and in-law. Existing entries stay visible to
   * everyone, which is what they were written under.
   */
  addColumn('memory', 'visibility', "TEXT NOT NULL DEFAULT 'family'");
  addColumn('legacy_entry', 'visibility', "TEXT NOT NULL DEFAULT 'family'");

  /*
   * Getting back in after forgetting a password.
   *
   * Only the hash of a reset code is kept. A code sitting in plain text would
   * mean a copy of the archive — a backup on somebody's laptop, say — carried
   * live keys to family accounts with it.
   */
  database.exec(`
    CREATE TABLE IF NOT EXISTS password_reset (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      code_hash   TEXT NOT NULL,
      created_by  TEXT REFERENCES user(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset(user_id);
  `);

  /*
   * A person may have one photograph: their portrait, shown on their card and
   * at the top of their profile. There is deliberately no album — this is a
   * family tree, and the face is there to help you recognise someone, not to
   * become a photo library.
   *
   * The image is stored in the database rather than as a loose file, because
   * everything else about this archive is protected by copying one file.
   * Photographs sitting in a directory beside it would fall outside that
   * promise, and a family would find the gap at the worst possible moment.
   */
  database.exec(`
    CREATE TABLE IF NOT EXISTS photo (
      id            TEXT PRIMARY KEY,
      person_id     TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
      caption       TEXT,
      taken_text    TEXT,
      mime          TEXT NOT NULL,
      bytes         INTEGER NOT NULL,
      width         INTEGER,
      height        INTEGER,
      image         BLOB NOT NULL,
      thumb         BLOB NOT NULL,
      contributor_id TEXT REFERENCES user(id) ON DELETE SET NULL,
      contributor_name TEXT,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_photo_person ON photo(person_id);
  `);

  /*
   * Parents are added one at a time, and until recently the first one's link
   * to the child stayed outside the marriage created for the second. The child
   * then descended from two places at once and the canvas drew a line from
   * each. Newly added parents no longer do this; these are the ones already
   * recorded that way.
   *
   * Deliberately narrow: a link with no marriage is perfectly legitimate where
   * the other parent is genuinely unknown, and those are left alone.
   */
  database.exec(`
    UPDATE parent_child AS pc
       SET union_id = (
         SELECT sibling.union_id
           FROM parent_child sibling
           JOIN union_partner up
             ON up.union_id = sibling.union_id AND up.person_id = pc.parent_id
          WHERE sibling.child_id = pc.child_id AND sibling.union_id IS NOT NULL
          LIMIT 1
       )
     WHERE pc.union_id IS NULL
       AND EXISTS (
         SELECT 1
           FROM parent_child sibling
           JOIN union_partner up
             ON up.union_id = sibling.union_id AND up.person_id = pc.parent_id
          WHERE sibling.child_id = pc.child_id AND sibling.union_id IS NOT NULL
       );
  `);

  /*
   * Two parents, one line.
   *
   * A child with a father and a mother recorded is drawn hanging from the two
   * of them together — from the marriage line between them — never from one
   * parent alone. Wherever the records say otherwise, the records are wrong
   * about the drawing, not about the family:
   *
   *   - both links were made before anybody recorded the marriage, so neither
   *     knows about it, though the marriage is there;
   *   - or no marriage was ever recorded between them at all, in which case
   *     two parents of the same child are as married as this archive needs.
   */
  database.exec(`
    UPDATE parent_child AS pc
       SET union_id = (
         SELECT a.union_id
           FROM parent_child other
           JOIN union_partner a ON a.person_id = pc.parent_id
           JOIN union_partner b ON b.union_id = a.union_id AND b.person_id = other.parent_id
          WHERE other.child_id = pc.child_id AND other.parent_id <> pc.parent_id
          LIMIT 1
       )
     WHERE pc.union_id IS NULL
       AND EXISTS (
         SELECT 1
           FROM parent_child other
           JOIN union_partner a ON a.person_id = pc.parent_id
           JOIN union_partner b ON b.union_id = a.union_id AND b.person_id = other.parent_id
          WHERE other.child_id = pc.child_id AND other.parent_id <> pc.parent_id
       );
  `);

  const unmarried = database
    .prepare(
      `SELECT childId, a, b FROM (
         SELECT child_id AS childId, MIN(parent_id) AS a, MAX(parent_id) AS b
           FROM parent_child
          WHERE union_id IS NULL
          GROUP BY child_id
         HAVING COUNT(DISTINCT parent_id) = 2
       )
       WHERE NOT EXISTS (
         SELECT 1 FROM union_partner x
         JOIN union_partner y ON y.union_id = x.union_id
         WHERE x.person_id = a AND y.person_id = b
       )`,
    )
    .all() as { childId: string; a: string; b: string }[];

  const marry = database.prepare(
    `INSERT INTO union_rel (id, status, start_value, start_precision, start_qualifier, end_value, end_precision, end_qualifier, place_id, note, created_at, created_by)
     VALUES (?, 'married', '', 'unknown', 'none', '', 'unknown', 'none', NULL, NULL, ?, NULL)`,
  );
  const partner = database.prepare(
    'INSERT OR IGNORE INTO union_partner (union_id, person_id, position) VALUES (?, ?, ?)',
  );
  const attach = database.prepare(
    'UPDATE parent_child SET union_id = ? WHERE child_id = ? AND parent_id IN (?, ?) AND union_id IS NULL',
  );
  const made = new Map<string, string>();
  for (const { childId, a, b } of unmarried) {
    const key = `${a}:${b}`;
    let unionId = made.get(key);
    if (!unionId) {
      unionId = id();
      marry.run(unionId, now());
      partner.run(unionId, a, 0);
      partner.run(unionId, b, 1);
      made.set(key, unionId);
    }
    attach.run(unionId, childId, a, b);
  }
}

/**
 * Release the connection. Needed before the database file is replaced from a
 * backup: the next call to db() reopens it cleanly.
 */
export function closeDb() {
  if (!database) return;
  try {
    database.close();
  } finally {
    database = null;
  }
}

export function id(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

/** Fold case, strip punctuation and diacritics so "Rivka" matches "rivkah" loosely. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
