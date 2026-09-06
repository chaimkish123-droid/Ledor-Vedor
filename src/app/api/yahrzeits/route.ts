import type { NextRequest } from 'next/server';
import { withUser } from '@/lib/api';
import { deathsForYahrzeit, getPref } from '@/lib/repo';
import { dbGraph } from '@/lib/graph-db';
import { describe, relationship } from '@/lib/relationships';
import { upcomingYahrzeits, type AdarCustom } from '@/lib/yahrzeit';

/**
 * The yahrzeitn coming up.
 *
 * Who each person was to the reader matters as much as the date: "your
 * great-grandmother Chana" is a reason to stop and read, where a bare name in a
 * list is not.
 */
export async function GET(request: NextRequest) {
  return withUser((user) => {
    const params = request.nextUrl.searchParams;
    const withinDays = Math.min(400, Math.max(1, Number(params.get('days') ?? 60)));
    const custom = ((getPref(user.id, 'adar') as AdarCustom) ?? 'first') as AdarCustom;

    const { known, dayUnknown } = deathsForYahrzeit();

    const upcoming = upcomingYahrzeits(
      known.map((person) => ({ subject: person, death: person.death })),
      { withinDays, custom },
    );

    const graph = dbGraph();
    const relations: Record<string, string> = {};
    if (user.personId) {
      for (const { subject } of upcoming) {
        relations[subject.id] = describe(
          relationship(graph, user.personId, subject.id),
          subject.gender as any,
        );
      }
    }

    return {
      custom,
      withinDays,
      upcoming: upcoming.map(({ subject, yahrzeit, daysAway }) => ({
        person: subject,
        yahrzeit,
        daysAway,
      })),
      relations,
      /** Said out loud rather than silently omitted — these are the ones to go and find out. */
      dayUnknown: dayUnknown.map((person) => ({
        id: person.id,
        preferredName: person.preferredName,
        lifespan: person.lifespan,
        initials: person.initials,
      })),
      counted: known.length,
    };
  });
}
