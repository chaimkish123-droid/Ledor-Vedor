'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatHebrewDate, formatHebrewDateHe } from '@/lib/hebrew';
import { whenInWords, type Yahrzeit } from '@/lib/yahrzeit';
import type { PersonSummary } from '@/lib/types';

type Upcoming = { person: PersonSummary; yahrzeit: Yahrzeit; daysAway: number };

type Payload = {
  upcoming: Upcoming[];
  relations: Record<string, string>;
  dayUnknown: { id: string; preferredName: string; lifespan: string; initials: string }[];
  counted: number;
  withinDays: number;
};

const CIVIL = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const EVENING = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const asDate = (d: { year: number; month: number; day: number }) =>
  new Date(d.year, d.month - 1, d.day);

const ordinalWord = (n: number) => {
  if (n === 1) return 'first';
  if (n === 2) return 'second';
  if (n === 3) return 'third';
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

export default function YahrzeitList() {
  const [data, setData] = useState<Payload | null>(null);
  const [months, setMonths] = useState(2);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/yahrzeits?days=${months * 30}`)
      .then((response) => response.json())
      .then((payload) => setData(payload.error ? null : payload))
      .finally(() => setLoading(false));
  }, [months]);

  if (loading && !data) {
    return <p className="text-[15px] text-ink-faint">Looking through the family…</p>;
  }

  if (!data) {
    return <p className="text-[15px] text-ink-faint">The family could not be read just now.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 2, 6, 12].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMonths(option)}
            aria-pressed={months === option}
            className={`rounded-full border px-3.5 py-1.5 text-[14px] transition-colors ${
              months === option
                ? 'border-sage bg-sage-soft text-sage-deep'
                : 'border-stone-line text-ink-soft hover:border-sage'
            }`}
          >
            {option === 12 ? 'The year ahead' : `${option} month${option > 1 ? 's' : ''}`}
          </button>
        ))}
      </div>

      {data.upcoming.length === 0 ? (
        <p className="rounded-xl border border-stone-line bg-card px-5 py-6 text-[16px] leading-relaxed text-ink-soft">
          {data.counted === 0
            ? 'No yahrzeitn yet. They appear here once the archive holds someone who has passed away, with the day of their passing.'
            : `Nothing in the next ${months === 12 ? 'year' : `${months} month${months > 1 ? 's' : ''}`}.`}
        </p>
      ) : (
        <ol className="space-y-3">
          {data.upcoming.map(({ person, yahrzeit, daysAway }) => {
            const relation = data.relations[person.id];
            const imminent = daysAway <= 7;

            return (
              <li
                key={person.id}
                className={`rounded-xl border bg-card px-5 py-4 ${
                  imminent ? 'border-sage' : 'border-stone-line'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="serif text-[19px] leading-tight text-ink">
                    <Link href={`/person/${person.id}`} className="transition-colors hover:text-sage-deep">
                      {person.preferredName}
                    </Link>
                  </p>
                  <span
                    className={`shrink-0 text-[13px] ${imminent ? 'text-sage-deep' : 'text-ink-faint'}`}
                  >
                    {whenInWords(daysAway)}
                  </span>
                </div>

                {(relation || person.lifespan) && (
                  <p className="mt-0.5 text-[14px] text-ink-faint">
                    {[relation, person.lifespan].filter(Boolean).join(' · ')}
                  </p>
                )}

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-[15px] sm:grid-cols-[auto_1fr]">
                  <dt className="text-[13px] uppercase tracking-wide text-ink-faint">Hebrew date</dt>
                  <dd className="text-ink">
                    {formatHebrewDate(yahrzeit.hebrew)}
                    <span className="hebrew ml-2 text-ink-soft">
                      {formatHebrewDateHe(yahrzeit.hebrew)}
                    </span>
                  </dd>

                  <dt className="text-[13px] uppercase tracking-wide text-ink-faint">Begins</dt>
                  <dd className="text-ink">
                    {EVENING.format(asDate(yahrzeit.beginsEvening))} at nightfall
                  </dd>

                  <dt className="text-[13px] uppercase tracking-wide text-ink-faint">The day</dt>
                  <dd className="text-ink">{CIVIL.format(asDate(yahrzeit.gregorian))}</dd>
                </dl>

                {yahrzeit.ordinal > 0 && (
                  <p className="mt-2 text-[14px] text-ink-soft">
                    Their {ordinalWord(yahrzeit.ordinal)} yahrzeit.
                  </p>
                )}

                {yahrzeit.notes.map((note) => (
                  <p
                    key={note}
                    className="mt-2 border-l-2 border-stone-line pl-3 text-[14px] leading-relaxed text-ink-soft"
                  >
                    {note}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      )}

      {data.dayUnknown.length > 0 && (
        <section className="rounded-xl border border-stone-line bg-parchment px-5 py-4">
          <h2 className="text-[15px] text-ink">
            {data.dayUnknown.length === 1
              ? 'One person here has no day recorded'
              : `${data.dayUnknown.length} people here have no day recorded`}
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
            A yahrzeit needs the day, not only the year — so these are left out rather than
            guessed at. If somebody in the family knows, adding it brings them into this list.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.dayUnknown.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/person/${person.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-line bg-card px-3 py-1.5 text-[14px] text-ink transition-colors hover:border-sage"
                >
                  <span aria-hidden className="text-[12px] text-ink-faint">
                    {person.initials}
                  </span>
                  {person.preferredName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
