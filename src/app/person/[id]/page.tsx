import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { personDetail } from '@/lib/person-detail';
import { descendantCounts, getPref } from '@/lib/repo';
import { formatDate, formatGregorian, formatHebrew, type CalendarPreference } from '@/lib/dates';
import { visibilityMarker } from '@/lib/visibility';
import type { PersonSummary } from '@/lib/types';
import Contribute from './Contribute';
import History from './History';
import ProfileEdit from './ProfileEdit';
import MemoryCard from './MemoryCard';

export const dynamic = 'force-dynamic';

const LEGACY_TITLES: Record<string, string> = {
  value: 'What they stood for',
  lesson: 'What we learned',
  saying: 'What they always said',
  teaching: 'What they taught',
  contribution: 'What they gave',
  story: 'A story to keep',
  known_for: 'What they were known for',
};

const EVENT_ICONS: Record<string, string> = {
  birth: '·',
  marriage: '·',
  residence: '·',
  education: '·',
  occupation: '·',
  accomplishment: '·',
  immigration: '·',
  passing: '·',
};

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  ensureSeeded();
  const user = await currentUser();
  if (!user) redirect('/signin');

  const { id } = await params;
  const calendar = (getPref(user.id, 'calendar') as CalendarPreference) ?? 'gregorian';
  const detail = personDetail(id, {
    viewerPersonId: user.personId,
    viewerUserId: user.id,
    calendar,
    includeHistory: user.role === 'admin',
  });
  if (!detail?.person) notFound();

  const person = detail.person;
  const deceased = !person.living;
  const portrait = detail.portrait;

  // The timeline is assembled from facts, not typed twice by anyone.
  const timeline = [
    person.birth.precision !== 'unknown' && {
      key: 'birth',
      date: formatDate(person.birth, calendar),
      title: 'Born',
      detail: person.birthPlace?.display ?? null,
      sort: person.birth.value,
    },
    ...detail.families
      .filter((family) => family.union && family.union.start.precision !== 'unknown')
      .map((family) => ({
        key: `union-${family.union!.id}`,
        date: formatDate(family.union!.start, calendar),
        title: family.partner ? `Married ${family.partner.preferredName}` : 'Married',
        detail: family.union!.place?.display ?? null,
        sort: family.union!.start.value,
      })),
    ...detail.events.map((event) => ({
      key: event.id,
      date: formatDate(event.date, calendar),
      title: event.title,
      detail: [event.place?.display, event.description].filter(Boolean).join(' · ') || null,
      sort: event.date.value,
    })),
    ...detail.children.map((child) => ({
      key: `child-${child.id}`,
      date: child.birth.value ? formatDate(child.birth, calendar) : '',
      title: `${child.preferredName} born`,
      detail: null,
      sort: child.birth.value,
    })),
    deceased &&
      person.death.precision !== 'unknown' && {
        key: 'death',
        date: formatDate(person.death, calendar),
        title: 'Passed away',
        detail: person.deathPlace?.display ?? null,
        sort: person.death.value,
      },
  ]
    .filter(Boolean)
    .sort((a: any, b: any) => String(a.sort).localeCompare(String(b.sort))) as {
    key: string;
    date: string;
    title: string;
    detail: string | null;
  }[];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-stone-line bg-parchment/90 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href={`/tree?focus=${person.id}`}
            className="rounded-full border border-stone-line bg-card px-4 py-2 text-[14px] text-ink transition-colors hover:border-sage"
          >
            ← Family tree
          </Link>
          <span className="hebrew serif ml-auto text-[17px] text-ink-faint">לדור ודור</span>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-6">
        {/* Overview */}
        <section className="fade-in">
          <div className="flex items-start gap-5">
            {portrait ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/photos/${portrait.id}?size=thumb`}
                alt={`A photograph of ${person.preferredName}`}
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className={`serif flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl ${
                  deceased ? 'bg-memorial text-ink-faint' : 'bg-sage-soft text-sage-deep'
                }`}
              >
                {person.preferredName
                  .split(' ')
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="serif text-3xl leading-tight text-ink sm:text-4xl">{person.preferredName}</h1>
              {person.hebrewName && (
                <p className="hebrew mt-1 text-[19px] text-ink-soft">{person.hebrewName}</p>
              )}
              <p className="mt-2 text-[15px] text-ink-soft">
                {[
                  detail.birthDisplay && `Born ${detail.birthDisplay}`,
                  deceased && detail.deathDisplay && `Passed ${detail.deathDisplay}`,
                  detail.age !== null && (person.living ? `${detail.age} years old` : `${detail.age} years`),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {detail.viewerRelation && (
                <p className="mt-1 text-[15px] text-sage">
                  {detail.viewerRelation === 'you' ? 'This is you' : `Your ${detail.viewerRelation}`}
                </p>
              )}
            </div>
          </div>

          {person.biography && (
            <p className="serif mt-7 text-[19px] leading-relaxed text-ink">{person.biography}</p>
          )}

          <ProfileEdit detail={detail} isAdmin={user.role === 'admin'} />
        </section>

        {/* Legacy sits high on the page — it is the point of all this. */}
        {detail.legacy.length > 0 && (
          <Section title="Legacy">
            <div className="space-y-5">
              {detail.legacy.map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-card px-5 py-4 border border-stone-line">
                  <p className="text-[13px] uppercase tracking-wide text-ink-faint">
                    {entry.title || LEGACY_TITLES[entry.kind] || 'Legacy'}
                  </p>
                  <p
                    className={`mt-1.5 leading-relaxed text-ink ${
                      entry.kind === 'saying' ? 'serif text-[20px]' : 'text-[16px]'
                    }`}
                  >
                    {entry.body}
                  </p>
                  <p className="mt-2 text-[13px] text-ink-faint">
                    {[entry.contributorName && `Shared by ${entry.contributorName}`, visibilityMarker(entry.visibility)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* What they began */}
        <Descendants personId={person.id} name={person.preferredName} />

        {/* Facts */}
        <Section title="Facts">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Fact label="Born" value={formatGregorian(person.birth)} secondary={formatHebrew(person.birth)} />
            <Fact label="Birthplace" value={person.birthPlace?.display} />
            {deceased && (
              <>
                <Fact label="Passed" value={formatGregorian(person.death)} secondary={formatHebrew(person.death)} />
                <Fact label="Place of passing" value={person.deathPlace?.display} />
              </>
            )}
            <Fact label="Name at birth" value={person.birthName ?? undefined} />
            <Fact label="Hebrew name" value={person.hebrewName ?? undefined} hebrew />
            {detail.alternateNames
              .filter((name) => name.kind === 'nickname' || name.kind === 'alternate')
              .map((name) => (
                <Fact key={name.value} label={name.kind === 'nickname' ? 'Known as' : 'Also known as'} value={name.value} />
              ))}
          </dl>
        </Section>

        {/* Relationships */}
        <Section title="Family">
          <div className="space-y-6">
            {detail.parents.length > 0 && <People title="Parents" people={detail.parents} />}
            {detail.siblings.length > 0 && <People title="Siblings" people={detail.siblings} />}

            {detail.families.map((family, index) => (
              <div key={family.union?.id ?? index}>
                {family.partner && (
                  <People
                    title={family.detail ?? 'Married'}
                    people={[family.partner]}
                  />
                )}
                {family.children.length > 0 && (
                  <div className={family.partner ? 'mt-3 pl-4' : ''}>
                    <People title="Children" people={family.children} />
                  </div>
                )}
              </div>
            ))}

            {detail.grandparents.length > 0 && <People title="Grandparents" people={detail.grandparents} />}
            {detail.grandchildren.length > 0 && <People title="Grandchildren" people={detail.grandchildren} />}
          </div>
        </Section>

        {/* Timeline */}
        {timeline.length > 0 && (
          <Section title="Timeline">
            <ol className="relative border-l border-stone-line pl-6">
              {timeline.map((entry) => (
                <li key={entry.key} className="relative pb-6 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute -left-[1.6rem] top-2 h-2 w-2 rounded-full bg-stone-line"
                  />
                  <p className="text-[13px] uppercase tracking-wide text-ink-faint">{entry.date}</p>
                  <p className="mt-0.5 text-[17px] text-ink">{entry.title}</p>
                  {entry.detail && <p className="text-[15px] text-ink-soft">{entry.detail}</p>}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Memories */}
        <Section title="Memories &amp; stories">
          {detail.memories.length === 0 ? (
            <p className="text-[16px] text-ink-soft">
              No memories yet. If you remember something about {person.preferredName.split(' ')[0]}, it belongs here.
            </p>
          ) : (
            <div className="space-y-6">
              {detail.memories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  isAuthor={memory.contributorId === user.id}
                  isAdmin={user.role === 'admin'}
                />
              ))}
            </div>
          )}
        </Section>

        <Contribute personId={person.id} personName={person.preferredName} />

        {/* History, for those who look after the data. */}
        {detail.revisions.length > 0 && (
          <Section title="History">
            <History revisions={detail.revisions} canRevert={user.role === 'admin'} />
          </Section>
        )}

      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="serif mb-4 text-[13px] uppercase tracking-widest text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

/**
 * "Four children, eleven grandchildren, twenty-six great-grandchildren."
 *
 * On the page of somebody two or three generations back, this is the sentence
 * the family actually wants — the reason the archive is called what it is. It
 * says nothing at all for a person with no children, which is most people, so
 * it appears only where there is something to say.
 */
const GENERATION_WORDS = [
  ['child', 'children'],
  ['grandchild', 'grandchildren'],
  ['great-grandchild', 'great-grandchildren'],
  ['great-great-grandchild', 'great-great-grandchildren'],
] as const;

function generationLabel(depth: number, count: number): string {
  const known = GENERATION_WORDS[depth];
  if (known) return `${count} ${count === 1 ? known[0] : known[1]}`;
  const greats = 'great-'.repeat(depth - 1);
  return `${count} ${greats}grandchild${count === 1 ? '' : 'ren'}`;
}

function Descendants({ personId, name }: { personId: string; name: string }) {
  const { generations, total, marriedIn } = descendantCounts(personId);
  if (total === 0) return null;

  const parts = generations.map((count, depth) => generationLabel(depth, count));
  const firstName = name.split(' ')[0];

  return (
    <Section title="Their generations">
      <p className="text-[17px] leading-relaxed text-ink">
        {parts.join(', ')}.
      </p>
      {generations.length > 1 && (
        <p className="mt-1.5 text-[15px] text-ink-soft">
          {total} {total === 1 ? 'person' : 'people'} in the archive descend from {firstName}
          {marriedIn > 0 && (
            <>
              , and {marriedIn} more {marriedIn === 1 ? 'married' : 'married'} into the family —{' '}
              {total + marriedIn} in all
            </>
          )}
          .
        </p>
      )}
    </Section>
  );
}

function Fact({
  label,
  value,
  secondary,
  hebrew,
}: {
  label: string;
  value?: string | null;
  secondary?: string | null;
  hebrew?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[13px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-[16px] text-ink">
        {hebrew ? <span className="hebrew inline-block">{value}</span> : value}
        {secondary && <span className="block text-[14px] text-ink-faint">{secondary}</span>}
      </dd>
    </div>
  );
}

function People({ title, people }: { title: string; people: (PersonSummary & { relationLabel?: string })[] }) {
  return (
    <div>
      <p className="mb-2 text-[13px] uppercase tracking-wide text-ink-faint">{title}</p>
      <ul className="flex flex-wrap gap-2">
        {people.map((person) => (
          <li key={person.id}>
            <Link
              href={`/person/${person.id}`}
              className={`flex items-center gap-2.5 rounded-full border px-3.5 py-2 transition-colors hover:border-sage ${
                person.living ? 'border-stone-line bg-card' : 'border-memorial-line bg-memorial'
              }`}
            >
              <span className="text-[15px] text-ink">{person.preferredName}</span>
              {person.lifespan && <span className="text-[13px] text-ink-faint tabular-nums">{person.lifespan}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
