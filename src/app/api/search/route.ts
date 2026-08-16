import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { searchPersons } from '@/lib/repo';
import { dbGraph } from '@/lib/graph-db';
import { describe, relationship } from '@/lib/relationships';

export async function GET(request: NextRequest) {
  return withUser((user) => {
    const query = request.nextUrl.searchParams.get('q') ?? '';
    const hits = searchPersons(query, 12, { userId: user.id, personId: user.personId });
    const graph = dbGraph();

    return {
      results: hits.map((hit) => ({
        ...hit,
        // "your first cousin" beside a search result answers the real question.
        relation:
          user.personId && user.personId !== hit.person.id
            ? describe(relationship(graph, user.personId, hit.person.id), hit.person.gender as any)
            : user.personId === hit.person.id
              ? 'You'
              : null,
      })),
    };
  });
}
