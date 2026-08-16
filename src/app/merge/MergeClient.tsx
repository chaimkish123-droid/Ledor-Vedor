'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MergeChoices, MergeFieldKey, MergePreview } from '@/lib/merge';
import type { PersonSummary } from '@/lib/types';

type Candidate = { a: PersonSummary; b: PersonSummary; reasons: string[]; confidence: number };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Combining two records of one person.
 *
 * Shown side by side, because the decision is always "which of these two is
 * right" — and because it should be obvious at a glance when they are in fact
 * two different people, in which case the answer is to walk away.
 */
export default function MergeClient() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [choices, setChoices] = useState<MergeChoices>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; backup: string | null } | null>(null);

  const loadCandidates = () => {
    fetch('/api/merge')
      .then((response) => response.json())
      .then((data) => setCandidates(data.candidates ?? []));
  };

  useEffect(loadCandidates, []);

  const open = async (keep: string, absorb: string) => {
    setError(null);
    setBusy(true);
    const response = await fetch(`/api/merge?keep=${keep}&absorb=${absorb}`);
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    setPreview(data.preview);
    setChoices({});
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const response = await fetch('/api/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep: preview.keep.id, absorb: preview.absorb.id, choices }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);

    setDone({ name: data.name, backup: data.backup });
    setPreview(null);
    loadCandidates();
  };

  /* --- After a merge ------------------------------------------------ */

  if (done) {
    return (
      <div className="rounded-2xl border border-stone-line bg-card px-6 py-6">
        <h2 className="serif text-[21px] text-ink">{done.name} is one person again</h2>
        <p className="mt-2 text-[16px] text-ink-soft">
          Everything both records held is now on the one that remains, and the family tree has been
          recalculated around them.
        </p>
        {done.backup && (
          <p className="mt-3 text-[13px] text-ink-faint">
            The archive as it stood beforehand was saved as {done.backup}.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/tree"
            className="rounded-full bg-sage px-5 py-2.5 text-[15px] text-white transition-colors hover:bg-sage-deep"
          >
            Back to the family tree
          </Link>
          <button
            type="button"
            onClick={() => setDone(null)}
            className="rounded-full border border-stone-line px-5 py-2.5 text-[15px] text-ink transition-colors hover:border-ink-faint"
          >
            Look for more
          </button>
        </div>
      </div>
    );
  }

  /* --- Comparing one pair ------------------------------------------- */

  if (preview) {
    const blocked = preview.blockers.length > 0;
    const conflicts = preview.fields.filter((field) => field.conflict);

    return (
      <div>
        <button
          type="button"
          onClick={() => setPreview(null)}
          className="mb-5 text-[14px] text-ink-soft underline underline-offset-2"
        >
          ← Back to the list
        </button>

        {blocked && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            {preview.blockers.map((blocker) => (
              <p key={blocker} className="text-[15px] text-red-800">
                {blocker}
              </p>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {[preview.keep, preview.absorb].map((person, index) => (
            <div
              key={person.id}
              className={`rounded-2xl border px-5 py-4 ${
                index === 0 ? 'border-sage bg-sage-soft/40' : 'border-stone-line bg-card'
              }`}
            >
              <p className="text-[13px] uppercase tracking-wide text-ink-faint">
                {index === 0 ? 'This record stays' : 'This one is absorbed'}
              </p>
              <p className="serif mt-1 text-[19px] text-ink">{person.preferredName}</p>
              <p className="text-[14px] text-ink-faint">{person.lifespan}</p>
            </div>
          ))}
        </div>

        {/* Only genuine disagreements need a decision. */}
        {conflicts.length > 0 && (
          <section className="mt-8">
            <h2 className="serif text-[19px] text-ink">Where the two records disagree</h2>
            <p className="mt-1 text-[15px] text-ink-soft">
              Choose which is right. Everything else is taken from whichever record has it.
            </p>

            <ul className="mt-4 space-y-3">
              {conflicts.map((field) => (
                <li key={field.key} className="rounded-xl border border-stone-line bg-card px-4 py-3">
                  <p className="mb-2 text-[13px] uppercase tracking-wide text-ink-faint">{field.label}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['keep', 'absorb'] as const).map((side) => {
                      const value = side === 'keep' ? field.keepValue : field.absorbValue;
                      const chosen = (choices[field.key] ?? 'keep') === side;
                      return (
                        <button
                          key={side}
                          type="button"
                          onClick={() => setChoices((current) => ({ ...current, [field.key]: side }))}
                          className={`rounded-lg border px-3 py-2.5 text-left text-[15px] transition-colors ${
                            chosen ? 'border-sage bg-sage-soft text-ink' : 'border-stone-line text-ink-soft'
                          }`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="serif text-[19px] text-ink">What moves across</h2>
          <ul className="mt-2 space-y-1 text-[16px] text-ink-soft">
            {preview.brings.parents > 0 && <li>{plural(preview.brings.parents, 'parent', 'parents')}</li>}
            {preview.brings.children > 0 && <li>{plural(preview.brings.children, 'child', 'children')}</li>}
            {preview.brings.marriages > 0 && <li>{plural(preview.brings.marriages, 'marriage', 'marriages')}</li>}
            {preview.brings.memories > 0 && <li>{plural(preview.brings.memories, 'memory', 'memories')}</li>}
            {preview.brings.legacy > 0 && <li>{plural(preview.brings.legacy, 'legacy entry', 'legacy entries')}</li>}
            {preview.brings.events > 0 && <li>{plural(preview.brings.events, 'life event', 'life events')}</li>}
            {preview.brings.photograph && <li>a photograph</li>}
            {preview.brings.account && <li>a family member&rsquo;s account</li>}
            {Object.values(preview.brings).every((value) => !value) && (
              <li>nothing but the details above</li>
            )}
          </ul>
          <p className="mt-3 text-[15px] text-ink-soft">
            Both names stay searchable, so nobody stops being findable by a name they had.
          </p>
        </section>

        {error && <p className="mt-6 text-[15px] text-red-700">{error}</p>}

        <div className="mt-8 flex flex-wrap gap-2 border-t border-stone-line pt-6">
          <button
            type="button"
            onClick={apply}
            disabled={busy || blocked}
            className="rounded-full bg-sage px-6 py-3 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-50"
          >
            {busy ? 'Combining…' : 'Combine into one person'}
          </button>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="rounded-full border border-stone-line px-5 py-3 text-[15px] text-ink transition-colors hover:border-ink-faint"
          >
            These are two different people
          </button>
        </div>

        <p className="mt-3 text-[13px] text-ink-faint">
          The archive is backed up first, and what the absorbed record held is kept in the history.
        </p>
      </div>
    );
  }

  /* --- The list ------------------------------------------------------ */

  return (
    <div>
      {error && <p className="mb-4 text-[15px] text-red-700">{error}</p>}

      {candidates === null && <p className="text-[16px] text-ink-soft">Looking through the family…</p>}

      {candidates?.length === 0 && (
        <div className="rounded-2xl border border-stone-line bg-card px-6 py-8 text-center">
          <p className="serif text-[19px] text-ink">Nobody appears twice</p>
          <p className="mt-1 text-[15px] text-ink-soft">
            Nothing in the family looks like the same person entered more than once.
          </p>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <ul className="space-y-2">
          {candidates.map((pair) => (
            <li
              key={`${pair.a.id}-${pair.b.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-line bg-card px-4 py-3"
            >
              <span className="min-w-0">
                <span className="text-[16px] text-ink">
                  {pair.a.preferredName} <span className="text-ink-faint">{pair.a.lifespan}</span>
                </span>
                <span className="block text-[14px] text-ink-faint">
                  and {pair.b.preferredName} {pair.b.lifespan} — {pair.reasons.join(', ')}
                </span>
              </span>

              <button
                type="button"
                onClick={() => open(pair.a.id, pair.b.id)}
                disabled={busy}
                className="shrink-0 rounded-lg border border-stone-line px-4 py-2 text-[14px] text-ink transition-colors hover:border-sage disabled:opacity-50"
              >
                Compare
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
