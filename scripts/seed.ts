/** Rebuild the demonstration family from scratch. */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { seedFamily } from '../src/lib/seed';
import { personCount } from '../src/lib/repo';

const dir = process.env.LDOR_DATA_DIR || path.join(process.cwd(), 'data');
for (const suffix of ['', '-wal', '-shm']) {
  try { rmSync(path.join(dir, `family.db${suffix}`)); } catch {}
}

seedFamily();
console.log(`Seeded ${personCount()} people.`);
