import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { parseDateInput } from '@/lib/dates';
import {
  createPerson,
  createUnion,
  findSharedUnion,
  linkParentChild,
  parentIdsOf,
  spouseIdsOf,
  unionsOfPerson,
} from '@/lib/repo';

type Relation = 'parent' | 'child' | 'sibling' | 'spouse';

/**
 * Add a relative, always starting from someone already in the family.
 * The relationship is created with the person — never as a second step the
 * user has to remember.
 */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const body = await request.json();
    const actor = actorOf(user);

    const anchorId: string = body.anchorId;
    const relation: Relation = body.relation;
    if (!anchorId || !relation) throw new Error('Tell us who this person is related to.');

    // Linking an existing person (the duplicate-detection path) skips creation.
    const personId: string = body.existingPersonId
      ? body.existingPersonId
      : createPerson(
          {
            preferredName: String(body.name ?? '').trim(),
            givenName: String(body.name ?? '').trim().split(' ')[0] || null,
            familyName: String(body.name ?? '').trim().split(' ').slice(1).join(' ') || null,
            hebrewName: body.hebrewName || null,
            gender: body.gender || null,
            living: body.living ?? true,
            birth: body.birth ? parseDateInput(String(body.birth)) : undefined,
            death: body.death ? parseDateInput(String(body.death)) : undefined,
            birthPlace: body.birthPlace || null,
          },
          actor,
        );

    if (!body.existingPersonId && !String(body.name ?? '').trim()) {
      throw new Error('A name is needed to add someone.');
    }

    switch (relation) {
      case 'parent': {
        // Join the anchor's existing parental union where one exists.
        const existingParents = parentIdsOf(anchorId);
        let unionId: string | null = null;
        if (existingParents.length === 1) {
          unionId = createUnion([existingParents[0], personId], { status: 'married' }, actor);
        }
        linkParentChild(personId, anchorId, { unionId, kind: body.kind ?? 'biological' }, actor);
        break;
      }

      case 'child': {
        // A child belongs to a marriage, not to one parent. When the panel did
        // not say which marriage — the plain "Add child" action — and there is
        // only one it could mean, use it. Otherwise adding a child to a married
        // couple silently records only one parent, and the other has to notice
        // and fix it later, which nobody does.
        let unionId: string | null = body.unionId ?? null;
        if (!unionId) {
          const unions = unionsOfPerson(anchorId);
          if (unions.length === 1) unionId = unions[0].id;
        }
        linkParentChild(anchorId, personId, { unionId, kind: body.kind ?? 'biological' }, actor);
        if (unionId) {
          const union = unionsOfPerson(anchorId).find((u) => u.id === unionId);
          for (const partnerId of union?.partnerIds ?? []) {
            if (partnerId !== anchorId) linkParentChild(partnerId, personId, { unionId, kind: body.kind ?? 'biological' }, actor);
          }
        }
        break;
      }

      case 'sibling': {
        const parents = parentIdsOf(anchorId);
        if (parents.length === 0) throw new Error('Add a parent first, so we know which family this sibling belongs to.');
        const unionId = parents.length > 1 ? findSharedUnion(parents[0], parents[1]) : null;
        for (const parentId of parents) linkParentChild(parentId, personId, { unionId }, actor);
        break;
      }

      case 'spouse': {
        createUnion([anchorId, personId], {
          status: body.status ?? 'married',
          start: body.marriedOn ? parseDateInput(String(body.marriedOn)) : undefined,
          place: body.marriagePlace || null,
        }, actor);
        break;
      }
    }

    return { personId };
  });
}
