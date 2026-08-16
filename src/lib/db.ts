import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

let database: Database.Database | null = null;

export function db(): Database.Database {
  if (database) return database;

  const dir = process.env.LDOR_DATA_DIR || path.join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });

  database = new Database(path.join(dir, 'family.db'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  const schemaPath = path.join(process.cwd(), 'src', 'lib', 'schema.sql');
  database.exec(readFileSync(schemaPath, 'utf8'));

  return database;
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
