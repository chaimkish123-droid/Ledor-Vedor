/**
 * Every test file gets its own freshly seeded database in a temporary
 * directory. Tests write family data, and they must never touch anyone's real
 * archive — including the demonstration family in `data/`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'ldor-test-'));
process.env.LDOR_DATA_DIR = dir;

const { ensureSeeded } = await import('../src/lib/seed.ts');
ensureSeeded();

process.on('exit', () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});
