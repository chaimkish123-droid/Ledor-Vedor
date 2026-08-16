import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { getSummaries, getSummary } from '@/lib/repo';
import { dbGraph } from '@/lib/graph-db';
import { describeSentence, findPaths, relationship, stepLabel } from '@/lib/relationships';

/** Relationship Finder: two people in, plain language plus the exact route out. */
export async function GET(request: NextRequest) {
  return withUser((user) => {
    const params = request.nextUrl.searchParams;
    const fromId = params.get('from') || user.personId;
    const toId = params.get('to');
    if (!fromId || !toId) throw new Error('Choose two people to compare.');

    const graph = dbGraph();
    const from = getSummary(fromId);
    const to = getSummary(toId);
    if (!from || !to) throw new Error('Person not found.');

    const rel = relationship(graph, fromId, toId);
    const paths = findPaths(graph, fromId, toId, 3);

    return {
      from,
      to,
      relation: rel,
      sentence: describeSentence(rel, to.preferredName, to.gender as any, fromId === user.personId),
      paths: paths.map((path) => ({
        length: path.length,
        steps: path.steps.map((step, index) => {
          const previous = index > 0 ? path.steps[index - 1].personId : null;
          return {
            person: getSummary(step.personId),
            via: step.via,
            label: index === 0
              ? 'Start'
              : stepLabel(step, graph.genderOf(step.personId), previous ? graph.genderOf(previous) : null),
          };
        }),
      })),
    };
  });
}
