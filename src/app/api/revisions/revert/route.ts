import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { revertRevision } from '@/lib/repo';

/** Restoring an earlier value is a trusted action, and is itself recorded. */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (user.role !== 'admin') {
      throw new Error('Only a family administrator can restore an earlier value.');
    }
    const { revisionId } = await request.json();
    if (!revisionId) throw new Error('Which change should be undone?');
    return revertRevision(String(revisionId), actorOf(user));
  });
}
