import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { applyImport } from '@/lib/import-gedcom';

export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can import a family tree.');

    const body = await request.json();
    const text = String(body?.text ?? '');
    if (!text.trim()) throw new Error('There is nothing to import.');

    return applyImport(text, actorOf(user), { linkTo: body?.linkTo ?? {} });
  });
}
