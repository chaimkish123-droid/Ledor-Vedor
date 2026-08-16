import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { createLegacy } from '@/lib/repo';

export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const body = await request.json();
    if (!String(body.body ?? '').trim()) throw new Error('Write something to remember them by.');
    const entryId = createLegacy(
      {
        personId: body.personId,
        kind: body.kind ?? 'value',
        title: body.title || undefined,
        body: String(body.body),
      },
      actorOf(user),
    );
    return { entryId };
  });
}
