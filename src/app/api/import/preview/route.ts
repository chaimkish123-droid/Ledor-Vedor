import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { previewImport } from '@/lib/import-gedcom';

const MAX_BYTES = 25 * 1024 * 1024;

/** Reads the file and reports what importing it would do. Writes nothing. */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can import a family tree.');

    const text = await request.text();
    if (text.length > MAX_BYTES) {
      throw new Error('That file is larger than 25 MB. Split the export, or ask for help with it.');
    }
    if (!text.trim()) throw new Error('That file appears to be empty.');

    return previewImport(text);
  });
}
