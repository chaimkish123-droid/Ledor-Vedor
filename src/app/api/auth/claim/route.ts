import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { linkUserToPerson, markOnboarded } from '@/lib/auth';
import { actorOf } from '@/lib/api';
import { createPerson, recordRevision } from '@/lib/repo';
import { parseDateInput } from '@/lib/dates';

/**
 * "Find yourself in the family" — linking an account to the Person record that
 * already exists is always preferable to creating a second one.
 */
export async function POST(request: NextRequest) {
  return withUser(async (user) => {
    const body = await request.json();

    if (body.skip) {
      markOnboarded(user.id);
      return { ok: true, personId: user.personId };
    }

    let personId: string | undefined = body.personId;
    if (!personId) {
      if (!String(body.name ?? '').trim()) throw new Error('Please choose yourself from the family, or tell us your name.');
      personId = createPerson(
        {
          preferredName: String(body.name).trim(),
          hebrewName: body.hebrewName || null,
          gender: body.gender || null,
          living: true,
          birth: body.birth ? parseDateInput(String(body.birth)) : undefined,
        },
        actorOf(user),
      );
    }

    linkUserToPerson(user.id, personId!);
    recordRevision({
      entityType: 'person',
      entityId: personId!,
      action: 'update',
      summary: `${user.displayName} claimed this person as themselves`,
      actor: actorOf(user),
    });

    return { ok: true, personId };
  });
}
