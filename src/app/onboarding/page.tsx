'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PersonSummary } from '@/lib/types';

type Step = 'find' | 'confirm' | 'add';

/**
 * Three short steps, all skippable. Finding an existing Person record is
 * always encouraged over creating a second one for the same human being.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('find');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ person: PersonSummary }[]>([]);
  const [claimed, setClaimed] = useState<PersonSummary | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((response) => response.json())
        .then((data) => setHits(data.results ?? []));
    }, 160);
    return () => clearTimeout(timer);
  }, [query]);

  const claim = async (personId: string | null, name?: string) => {
    setBusy(true);
    const response = await fetch('/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personId ? { personId } : { name }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return;

    const person = await fetch(`/api/person/${data.personId}`).then((r) => r.json());
    setDetail(person);
    setClaimed(person.person);
    setStep('confirm');
  };

  const finish = async () => {
    await fetch('/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip: true }),
    });
    router.push('/tree');
    router.refresh();
  };

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg fade-in">
        <p className="mb-8 text-center text-[13px] uppercase tracking-widest text-ink-faint">
          Step {step === 'find' ? 1 : step === 'confirm' ? 2 : 3} of 3
        </p>

        {step === 'find' && (
          <>
            <h1 className="serif mb-2 text-center text-3xl text-ink">Find yourself in the family</h1>
            <p className="mb-8 text-center text-[16px] leading-relaxed text-ink-soft">
              You may already be here. Search for your name so your account joins the person we
              already have, rather than creating a second one.
            </p>

            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type your name"
              autoFocus
              className="w-full rounded-full border border-stone-line bg-card px-5 py-3.5 text-[17px] text-ink"
            />

            {hits.length > 0 && (
              <ul className="mt-3 overflow-hidden rounded-xl border border-stone-line bg-card">
                {hits.map((hit) => (
                  <li key={hit.person.id} className="border-b border-stone-line last:border-0">
                    <button
                      type="button"
                      onClick={() => claim(hit.person.id)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-parchment"
                    >
                      <span
                        aria-hidden
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-soft text-[14px] text-sage-deep serif"
                      >
                        {hit.person.initials}
                      </span>
                      <span>
                        <span className="block text-[16px] text-ink">{hit.person.preferredName}</span>
                        <span className="block text-[13px] text-ink-faint">{hit.person.lifespan}</span>
                      </span>
                      <span className="ml-auto text-[14px] text-sage">This is me</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {query.trim().length >= 2 && hits.length === 0 && (
              <button
                type="button"
                onClick={() => claim(null, query.trim())}
                disabled={busy}
                className="mt-3 w-full rounded-xl border border-stone-line bg-card px-4 py-3.5 text-[15px] text-ink transition-colors hover:border-sage"
              >
                Not here yet — add <span className="text-sage-deep">{query.trim()}</span> to the family
              </button>
            )}

            <button type="button" onClick={finish} className="mt-8 block w-full text-center text-[15px] text-ink-faint underline underline-offset-2">
              Skip for now
            </button>
          </>
        )}

        {step === 'confirm' && claimed && (
          <>
            <h1 className="serif mb-2 text-center text-3xl text-ink">Check your family</h1>
            <p className="mb-8 text-center text-[16px] leading-relaxed text-ink-soft">
              Here is what we have for {claimed.preferredName}. Anything missing can be added at any time.
            </p>

            <div className="rounded-2xl border border-stone-line bg-card px-5 py-4">
              {detail?.parents?.length > 0 && (
                <Group title="Parents" people={detail.parents} />
              )}
              {detail?.families?.map((family: any, index: number) => (
                <div key={index}>
                  {family.partner && <Group title="Spouse" people={[family.partner]} />}
                  {family.children?.length > 0 && <Group title="Children" people={family.children} />}
                </div>
              ))}
              {detail?.siblings?.length > 0 && <Group title="Siblings" people={detail.siblings} />}
              {!detail?.parents?.length && !detail?.families?.length && !detail?.siblings?.length && (
                <p className="py-2 text-[15px] text-ink-soft">
                  No relatives recorded yet — the tree begins with you.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep('add')}
              className="mt-6 w-full rounded-full bg-sage px-6 py-3.5 text-[16px] text-white transition-colors hover:bg-sage-deep"
            >
              This looks right
            </button>
          </>
        )}

        {step === 'add' && (
          <>
            <h1 className="serif mb-2 text-center text-3xl text-ink">Add one thing</h1>
            <p className="mb-8 text-center text-[16px] leading-relaxed text-ink-soft">
              A missing relative, a date, or a memory. One small addition from each of us keeps the
              whole family whole.
            </p>

            <button
              type="button"
              onClick={finish}
              className="w-full rounded-full bg-sage px-6 py-3.5 text-[16px] text-white transition-colors hover:bg-sage-deep"
            >
              Go to my branch
            </button>
            <button type="button" onClick={finish} className="mt-4 block w-full text-center text-[15px] text-ink-faint underline underline-offset-2">
              I&rsquo;ll do it later
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function Group({ title, people }: { title: string; people: PersonSummary[] }) {
  return (
    <div className="border-b border-stone-line py-2.5 last:border-0">
      <p className="mb-1 text-[13px] uppercase tracking-wide text-ink-faint">{title}</p>
      <p className="text-[15px] text-ink">{people.map((person) => person.preferredName).join(', ')}</p>
    </div>
  );
}
