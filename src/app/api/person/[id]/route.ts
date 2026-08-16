import type { NextRequest } from 'next/server';
import { actorOf, withUser } from '@/lib/api';
import { personDetail } from '@/lib/person-detail';
import { parseDateInput } from '@/lib/dates';
import { getPref, recordView, updatePerson } from '@/lib/repo';
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
