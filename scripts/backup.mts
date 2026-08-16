/** Take a verified backup of the family archive. */
import { takeBackup, backupDirectory } from '../src/lib/backup';

const backup = await takeBackup(process.argv[2] ?? 'manual');
console.log(`Backed up to ${backup.path}`);
console.log(`${(backup.bytes / 1024).toFixed(0)} KB · verified · kept in ${backupDirectory()}`);
