'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { VISIBILITIES, VISIBILITY_LABELS, visibilityMarker, type Visibility } from '@/lib/visibility-labels';
import type { Memory } from '@/lib/types';

/**
 * One memory.
 *
 * A memory that is not open to the whole family says so plainly, so nobody has
 * to wonder who is reading over their shoulder. Whoever wrote it can change
 * their mind about that, or take it back entirely — which matters more for
 * something remembered than for a date of birth.
 */
export default function MemoryCard({
  memory,
  isAuthor,
  isAdmin,
}: {
  memory: Memory;
  isAuthor: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marker = visibilityMarker(memory.visibility);

  const change = async (visibility: Visibility) => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/memories/${memory.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    router.refresh();
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/memories/${memory.id}`, { method: 'DELETE' });
    const data = await response.json();
    setBusy(false);
    if (data.error) return setError(data.error);
    router.refresh();
  };

  return (
    <article className="rounded-2xl border border-stone-line bg-card px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="serif text-[19px] text-ink">{memory.title}</h3>
        {marker && (
          <span className="rounded-full bg-parchment px-2.5 py-1 text-[12px] text-ink-soft">{marker}</span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed text-ink-soft">{memory.body}</p>

      <p className="mt-3 text-[13px] text-ink-faint">
        {[
          memory.contributorName && `Shared by ${memory.contributorName}`,
          memory.dateText,
          memory.provenance,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {memory.people.length > 1 && (
        <p className="mt-2 text-[13px] text-ink-faint">
          About{' '}
          {memory.people.map((person, index) => (
            <span key={person.id}>
              {index > 0 && ', '}
              <Link href={`/person/${person.id}`} className="text-sage underline underline-offset-2">
                {person.name}
              </Link>
            </span>
          ))}
        </p>
      )}

      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}

      {(isAuthor || isAdmin) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-stone-line pt-3">
          {isAuthor && (
            <>
              <span className="text-[13px] text-ink-faint">Who it is for:</span>
              {VISIBILITIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busy}
                  onClick={() => change(option)}
                  className={`rounded-full border px-3 py-1 text-[13px] transition-colors disabled:opacity-50 ${
                    memory.visibility === option
                      ? 'border-sage bg-sage-soft text-sage-deep'
                      : 'border-stone-line text-ink-soft hover:border-sage'
                  }`}
                >
                  {VISIBILITY_LABELS[option]}
                </button>
              ))}
            </>
          )}

          {confirming ? (
            <span className="ml-auto flex items-center gap-2 text-[13px]">
              <span className="text-ink-soft">Take this memory back?</span>
              <button
                type="button"
                disabled={busy}
                onClick={withdraw}
                className="rounded-full border border-stone-line px-3 py-1 text-ink transition-colors hover:border-sage disabled:opacity-50"
              >
                Yes, remove it
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-ink-faint underline underline-offset-2"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ml-auto text-[13px] text-ink-faint underline underline-offset-2 hover:text-ink"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </article>
  );
}
