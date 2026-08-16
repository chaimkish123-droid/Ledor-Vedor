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
