import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { findLikelyDuplicates, mergePeople, previewMerge } from '@/lib/merge';

/** Pairs worth a look, or a close reading of one pair. */
export async function GET(request: NextRequest) {
  return withUser((user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can combine two records.');

    const keep = request.nextUrl.searchParams.get('keep');
    const absorb = request.nextUrl.searchParams.get('absorb');
    if (keep && absorb) return { preview: previewMerge(keep, absorb) };

    return { candidates: findLikelyDuplicates() };
  });
}

/**
 * Combine two records. Deliberately restricted: this is the one action here
 * that removes a record rather than adding to one.
 */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    if (user.role !== 'admin') throw new Error('Only a family administrator can combine two records.');

    const body = await request.json();
    if (!body?.keep || !body?.absorb) throw new Error('Two records are needed.');

    return mergePeople(String(body.keep), String(body.absorb), body.choices ?? {}, actorOf(user));
  });
}
