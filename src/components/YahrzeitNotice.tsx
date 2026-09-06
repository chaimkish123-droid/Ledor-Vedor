'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { whenInWords, type Yahrzeit } from '@/lib/yahrzeit';
import type { PersonSummary } from '@/lib/types';

/**
 * A line above the family tree when a yahrzeit is close.
 *
 * This is the whole difference between an archive somebody built once and one
 * they open again: nobody visits a page called Yahrzeitn on the off-chance, but
 * everybody reads a line that says their grandmother's is on Thursday. It stays
 * quiet — one sentence, no colour, dismissed for the day with a press — because
 * something that shouts at you about your dead is not something you keep.
 */
export default function YahrzeitNotice() {
  const [soon, setSoon] = useState<
    { person: PersonSummary; yahrzeit: Yahrzeit; daysAway: number }[]
  >([]);
  const [relations, setRelations] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Dismissal lasts the day, not for ever: tomorrow it may be a different name.
    const today = new Date().toDateString();
    try {
      setDismissed(window.localStorage.getItem('ldor.yahrzeit.dismissed') === today);
    } catch {
      setDismissed(false);
    }

    fetch('/api/yahrzeits?days=8')
      .then((response) => response.json())
      .then((data) => {
        if (data.error) return;
        setSoon(data.upcoming ?? []);
        setRelations(data.relations ?? {});
      })
      .catch(() => undefined);
  }, []);

  if (dismissed || soon.length === 0) return null;

  const [first] = soon;
  const relation = relations[first.person.id];
  const others = soon.length - 1;

  const hide = () => {
    try {
      window.localStorage.setItem('ldor.yahrzeit.dismissed', new Date().toDateString());
    } catch {
      /* A browser that refuses to remember simply shows it again. */
    }
    setDismissed(true);
  };

  return (
    <div className="z-20 flex shrink-0 items-center gap-3 border-b border-stone-line bg-parchment px-3 py-2 sm:px-5">
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink-soft">
        <Link href="/yahrzeits" className="text-ink transition-colors hover:text-sage-deep">
          <span className="serif">{first.person.preferredName}</span>
          {relation ? <span className="text-ink-faint"> — {relation}</span> : null}
        </Link>
        <span className="text-ink-faint">
          {' '}
          — yahrzeit {whenInWords(first.daysAway)}
          {first.daysAway > 0 ? ', beginning the evening before' : ''}
          {others > 0 ? `, and ${others} more this week` : ''}.
        </span>
      </p>
      <button
        type="button"
        onClick={hide}
        aria-label="Hide until tomorrow"
        className="shrink-0 rounded-full px-2 py-1 text-[13px] text-ink-faint transition-colors hover:text-ink"
      >
        Hide
      </button>
    </div>
  );
}
