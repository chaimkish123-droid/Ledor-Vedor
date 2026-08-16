/**
 * Backups.
 *
 * A family archive is not like other application data: if it is lost, the
 * stories are simply gone, and nobody can retype what a grandmother said.
 * So backups are part of the product rather than an operational afterthought.
 *
 * Uses SQLite's online backup API, which produces a consistent copy while the
 * application keeps running — never a file copy of a live database.
 */

import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { closeDb, db } from './db';

export type BackupFile = {
  name: string;
  path: string;
  bytes: number;
  takenAt: string;
};

export function backupDirectory(): string {
  return (
    process.env.LDOR_BACKUP_DIR ||
    path.join(process.env.LDOR_DATA_DIR || path.join(process.cwd(), 'data'), 'backups')
  );
}

/** How many backups to keep. Older ones are pruned oldest-first. */
function retention(): number {
  const configured = Number(process.env.LDOR_BACKUP_KEEP);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 14;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

/**
 * Take a backup, verify it opens and passes an integrity check, then prune old
 * ones. A backup nobody has verified is only a hope.
 */
export async function takeBackup(reason = 'manual'): Promise<BackupFile> {
  const directory = backupDirectory();
  mkdirSync(directory, { recursive: true });

  const name = `family-${stamp(new Date())}-${reason}.db`;
  const target = path.join(directory, name);

  await db().backup(target);

  const check = new Database(target, { readonly: true });
  try {
    const result = check.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`Backup failed its integrity check: ${result}`);
    const people = (check.prepare('SELECT COUNT(*) AS n FROM person').get() as { n: number }).n;
    if (people < 0) throw new Error('Backup is unreadable.');
  } finally {
    check.close();
  }

  prune();

  const info = statSync(target);
  return { name, path: target, bytes: info.size, takenAt: info.mtime.toISOString() };
}

export function listBackups(): BackupFile[] {
  const directory = backupDirectory();
  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const full = path.join(directory, name);
      const info = statSync(full);
      return { name, path: full, bytes: info.size, takenAt: info.mtime.toISOString() };
    })
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

function prune() {
  const keep = retention();
  const backups = listBackups();
  for (const old of backups.slice(keep)) {
    try {
      rmSync(old.path);
    } catch {
      // A backup we cannot delete is not a reason to fail the one we just took.
    }
  }
}

let timer: NodeJS.Timeout | null = null;

/**
 * Back up on a schedule inside the running process.
 *
 * A container with no cron is the normal case for a small deployment, so the
 * application takes care of itself. LDOR_BACKUP_HOURS=0 turns this off for
 * anyone who would rather drive it externally.
 */
export function startScheduledBackups() {
  if (timer) return;

  const hours = process.env.LDOR_BACKUP_HOURS === undefined ? 24 : Number(process.env.LDOR_BACKUP_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) return;

  const interval = hours * 60 * 60 * 1000;

  const run = () => {
    takeBackup('scheduled').catch((error) => {
      console.error('[ldor] scheduled backup failed:', error);
    });
  };

  // One shortly after start, so a fresh deployment is protected immediately.
  setTimeout(run, 60_000).unref?.();
  timer = setInterval(run, interval);
  timer.unref?.();
}

export function dataDirectory(): string {
  return process.env.LDOR_DATA_DIR || path.join(process.cwd(), 'data');
}

/** Read a backup without opening it as the live archive. */
export function inspectBackup(source: string): { people: number; ok: boolean } {
  const check = new Database(source, { readonly: true });
  try {
    const ok = check.pragma('integrity_check', { simple: true }) === 'ok';
    const people = (check.prepare('SELECT COUNT(*) AS n FROM person').get() as { n: number }).n;
    return { people, ok };
  } finally {
    check.close();
  }
}

/**
 * Put a backup back in place.
 *
 * SQLite runs in WAL mode, so the archive is `family.db` *plus* its `-wal` and
 * `-shm` sidecars. Replacing only the main file leaves the previous
 * write-ahead log behind, and SQLite will replay it straight over the restored
 * data — which is how a restore silently undoes itself. The sidecars go too.
 */
export async function restoreBackup(source: string): Promise<{ people: number; replacedCopy: string | null }> {
  const full = path.isAbsolute(source) ? source : path.join(backupDirectory(), source);
  if (!existsSync(full)) throw new Error(`No such backup: ${full}`);

  const { ok, people } = inspectBackup(full);
  if (!ok) throw new Error('That backup does not pass an integrity check.');

  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  mkdirSync(backupDirectory(), { recursive: true });
  const live = path.join(directory, 'family.db');

  // Keep whatever is being replaced, so a restore can never be the step that
  // loses something.
  let replacedCopy: string | null = null;
  if (existsSync(live)) {
    replacedCopy = path.join(
      backupDirectory(),
      `replaced-${stamp(new Date())}.db`,
    );
    await db().backup(replacedCopy);
  }

  closeDb();
  copyFileSync(full, live);
  for (const suffix of ['-wal', '-shm']) {
    try {
      rmSync(`${live}${suffix}`);
    } catch {
      // Absent is exactly what we want.
    }
  }

  return { people, replacedCopy };
}
