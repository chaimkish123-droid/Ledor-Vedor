import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { personDetail } from '@/lib/person-detail';
import { parseDateInput } from '@/lib/dates';
import { getPref, recordView, updatePerson } from '@/lib/repo';
import { previewRemoval, removePerson } from '@/lib/remove';
import type { CalendarPreference } from '@/lib/dates';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser((user) => {
    recordView(user.id, id);
    const detail = personDetail(id, {
      viewerPersonId: user.personId,
      viewerUserId: user.id,
      calendar: (getPref(user.id, 'calendar') as CalendarPreference) ?? 'gregorian',
      includeHistory: user.role === 'admin',
    });
    if (!detail) throw new Error('Person not found.');
    return detail;
  });
}

/** Ordinary edits apply immediately; the previous value lives on in revisions. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    const body = await request.json();
    updatePerson(
      id,
      {
        preferredName: body.name,
        birthName: body.birthName,
        hebrewName: body.hebrewName,
        gender: body.gender,
        living: body.living,
        birth: body.birth !== undefined ? parseDateInput(String(body.birth ?? '')) : undefined,
        death: body.death !== undefined ? parseDateInput(String(body.death ?? '')) : undefined,
        birthPlace: body.birthPlace,
        deathPlace: body.deathPlace,
        biography: body.biography,
      },
      actorOf(user),
    );
    return { ok: true };
  });
}

/**
 * Removing somebody. A preview first — `?preview=1` on the same address says
 * what would be lost without losing it — and the removal itself is for
 * administrators, because it is the one action in here that takes something
 * away from everybody rather than adding to it.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withUser(async (user) => {
    if (user.role !== 'admin') {
      throw new Error('Only an administrator can remove somebody from the archive.');
    }
    if (new URL(request.url).searchParams.get('preview')) return previewRemoval(id);
    return await removePerson(id, actorOf(user));
  });
}
