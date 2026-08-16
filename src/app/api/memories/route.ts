import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { createMemory } from '@/lib/repo';
import { isVisibility } from '@/lib/visibility';

export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const body = await request.json();
    if (!String(body.body ?? '').trim()) throw new Error('A memory needs something to remember.');
    const memoryId = createMemory(
      {
        title: String(body.title ?? '').trim() || 'A memory',
        body: String(body.body),
        dateText: body.dateText || undefined,
        provenance: body.provenance || undefined,
        personIds: (body.personIds ?? []).filter(Boolean),
        visibility: isVisibility(body.visibility) ? body.visibility : 'family',
      },
      actorOf(user),
    );
    return { memoryId };
  });
}
