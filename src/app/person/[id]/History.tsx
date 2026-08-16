'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Revision } from '@/lib/types';

/**
 * The record of what changed, and the means to put it back.
 * Nothing here destroys anything: a restore is simply the next change.
 */
export default function History({ revisions, canRevert }: { revisions: Revision[]; canRevert: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revert = async (revisionId: string) => {
    setBusy(revisionId);
    setError(null);
    const response = await fetch('/api/revisions/revert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId }),
    });
    const data = await response.json();
    setBusy(null);
    if (data.error) return setError(data.error);
    router.refresh();
  };

  return (
    <details className="rounded-2xl border border-stone-line bg-card px-5 py-4">
      <summary className="cursor-pointer text-[15px] text-ink-soft">
        {revisions.length} recorded {revisions.length === 1 ? 'change' : 'changes'}
      </summary>

      {error && <p className="mt-3 text-[14px] text-red-700">{error}</p>}

      <ul className="mt-4 space-y-3">
        {revisions.map((revision) => (
          <li key={revision.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] text-ink-soft">
            <span className="text-ink">{revision.summary ?? revision.field ?? 'Updated'}</span>

            {revision.field && revision.action === 'update' && !revision.summary && (
              <span>
                <span className="line-through opacity-70">{revision.oldValue || 'empty'}</span>
                {' → '}
                <span className="text-ink">{revision.newValue || 'empty'}</span>
              </span>
            )}

            <span className="text-ink-faint">
              · {revision.userName ?? 'Someone'} · {new Date(revision.createdAt).toLocaleDateString()}
            </span>

            {canRevert && revision.revertable && (
              <button
                type="button"
                onClick={() => revert(revision.id)}
                disabled={busy === revision.id}
                className="rounded-full border border-stone-line px-3 py-1 text-[13px] text-ink-soft transition-colors hover:border-sage hover:text-sage-deep disabled:opacity-50"
              >
                {busy === revision.id ? 'Restoring…' : 'Put this back'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {canRevert && (
        <p className="mt-4 text-[13px] text-ink-faint">
          Restoring an earlier value does not erase anything — it is recorded as a change of its own.
        </p>
      )}
    </details>
  );
}
