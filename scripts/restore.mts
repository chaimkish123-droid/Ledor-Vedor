/** Restore the family archive from a backup. */
import path from 'node:path';
import { backupDirectory, listBackups, restoreBackup } from '../src/lib/backup';

const requested = process.argv[2];

if (!requested) {
  const backups = listBackups();
  if (backups.length === 0) {
    console.log(`No backups found in ${backupDirectory()}`);
  } else {
    console.log('Available backups, newest first:\n');
    for (const backup of backups) {
      console.log(`  ${backup.name}  ${(backup.bytes / 1024).toFixed(0)} KB  ${backup.takenAt}`);
    }
    console.log('\nRestore with:  npm run restore -- <name>');
  }
  process.exit(0);
}

const { people, replacedCopy } = await restoreBackup(requested);
if (replacedCopy) console.log(`Kept the archive being replaced at ${replacedCopy}`);
console.log(`Restored ${path.basename(requested)} — ${people} people. Restart the application to pick it up.`);
