import { withUser } from '@/lib/api';
import { listBackups, takeBackup } from '@/lib/backup';

export async function GET() {
  return withUser((user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can see the backups.');
    return {
      backups: listBackups().map(({ name, bytes, takenAt }) => ({ name, bytes, takenAt })),
    };
  });
}

/** Take a backup now — before a large import, or simply for peace of mind. */
export async function POST() {
  return withUser(async (user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can take a backup.');
    const backup = await takeBackup('manual');
    return { name: backup.name, bytes: backup.bytes, takenAt: backup.takenAt };
  });
}
