import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { neighborhood, recentlyViewed, recordView, getSummary } from '@/lib/repo';
import { dbGraph } from '@/lib/graph-db';
import { describe, relationship } from '@/lib/relationships';

/** The slice of family currently worth rendering, plus how each person relates to the viewer. */
export async function GET(request: NextRequest) {
  return withUser((user) => {
    const params = request.nextUrl.searchParams;
    const focusId = params.get('focus') || user.personId;
    if (!focusId) throw new Error('No starting point — find yourself in the family first.');

    const expanded = (params.get('expand') || '').split(',').filter(Boolean);
    const slice = neighborhood(focusId, {
      ancestorDepth: Number(params.get('up') ?? 2),
      descendantDepth: Number(params.get('down') ?? 2),
      expanded,
    });

    // How everyone on screen relates to the viewer — this is what turns a
    // diagram into "my family".
    const graph = dbGraph();
    const relations: Record<string, string> = {};
    if (user.personId) {
      for (const personId of Object.keys(slice.persons)) {
        relations[personId] =
          personId === user.personId
            ? 'You'
            : describe(relationship(graph, user.personId, personId), slice.persons[personId].gender as any);
      }
    }

    recordView(user.id, focusId);

    return {
      focusId,
      slice,
      relations,
      focus: getSummary(focusId),
      recent: recentlyViewed(user.id),
      viewerPersonId: user.personId,
    };
  });
}
