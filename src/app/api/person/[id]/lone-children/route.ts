import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { getPerson, loneChildrenOf, unionsOfPerson } from '@/lib/repo';

/**
 * Who would be joined to a new husband or wife.
 *
 * Read by the add-a-spouse form so it can say, by name, which children it is
 * about to give a second parent — and let the person adding say no.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(() => ({
    children: loneChildrenOf(id)
      .map((childId) => getPerson(childId))
      .filter((child) => child)
      .map((child) => ({ id: child!.id, preferredName: child!.preferredName })),
    firstMarriage: unionsOfPerson(id).length === 0,
  }));
}
