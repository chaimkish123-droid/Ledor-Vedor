'use client';

import { useEffect, useState } from 'react';
import { Field } from './QuickView';
import type { PersonSummary } from '@/lib/types';

type Relation = 'parent' | 'child' | 'sibling' | 'spouse';

type Candidate = {
  person: PersonSummary;
  reasons: string[];
  confidence: number;
};

const RELATION_WORDS: Record<Relation, string> = {
  parent: 'parent',
  child: 'child',
  sibling: 'sibling',
  spouse: 'spouse',
};

/**
 * Screen 5 — always starts from someone already in the family, asks only what
 * is needed to know who this is, and checks for an existing record first.
 */
export default function AddRelative({
  anchor,
  relation: initialRelation,
  unionId,
  onClose,
  onCreated,
}: {
  anchor: PersonSummary;
  relation: Relation;
  unionId?: string | null;
  onClose: () => void;
  onCreated: (personId: string) => void;
}) {
  const [relation, setRelation] = useState<Relation>(initialRelation);
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<string>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quietly look for someone we may already have, while they type.
  useEffect(() => {
    if (name.trim().length < 3) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ name });
      const year = birth.match(/\d{4}/)?.[0];
      if (year) params.set('birthYear', year);
      fetch(`/api/duplicates?${params}`)
        .then((response) => response.json())
        .then((data) => setCandidates(data.candidates ?? []));
    }, 350);
    return () => clearTimeout(timer);
  }, [name, birth]);

  const submit = async (existingPersonId?: string) => {
    setSaving(true);
    setError(null);
    const response = await fetch('/api/person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anchorId: anchor.id,
        relation,
        unionId: relation === 'child' ? unionId ?? null : undefined,
        existingPersonId,
        name,
        birth: birth || undefined,
        gender: gender || undefined,
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (data.error) setError(data.error);
    else onCreated(data.personId);
  };

  const showDuplicates = candidates.length > 0 && !dismissedDuplicates;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 p-0 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add a ${RELATION_WORDS[relation]}`}
        className="sheet-in soft-scroll max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-card px-5 py-6 panel-shadow sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="serif text-[21px] leading-tight text-ink">
              Add a {RELATION_WORDS[relation]}
            </h2>
            <p className="mt-0.5 text-[14px] text-ink-soft">
              {relation === 'parent' && `A parent of ${anchor.preferredName}`}
              {relation === 'child' && `A child of ${anchor.preferredName}`}
              {relation === 'sibling' && `A brother or sister of ${anchor.preferredName}`}
              {relation === 'spouse' && `Married to ${anchor.preferredName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-parchment hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Relationship can be changed here rather than starting over. */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(['parent', 'child', 'sibling', 'spouse'] as Relation[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRelation(option)}
              className={`rounded-full border px-4 py-2 text-[14px] capitalize transition-colors ${
                relation === option ? 'border-sage bg-sage-soft text-sage-deep' : 'border-stone-line text-ink-soft'
              }`}
            >
              {RELATION_WORDS[option]}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <Field label="Name" value={name} onChange={setName} autoFocus placeholder="Their full name" />
          <Field
            label="Born"
            value={birth}
            onChange={setBirth}
            hint="Optional — a year is plenty. &ldquo;c. 1935&rdquo; and &ldquo;1935 or 1936&rdquo; both work."
          />

          <fieldset>
            <legend className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">
              Recorded as
            </legend>
            <div className="flex gap-2">
              {[
                ['female', 'Female'],
                ['male', 'Male'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGender(gender === value ? '' : value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-[15px] transition-colors ${
                    gender === value ? 'border-sage bg-sage-soft text-sage-deep' : 'border-stone-line text-ink-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {showDuplicates && (
          <div className="mt-5 rounded-xl border border-stone-line bg-parchment px-4 py-3.5">
            <p className="text-[15px] text-ink">We may already have this person.</p>
            <ul className="mt-2.5 space-y-2">
              {candidates.map((candidate) => (
                <li key={candidate.person.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] text-ink">{candidate.person.preferredName}</span>
                    <span className="block text-[13px] text-ink-faint">
                      {[candidate.person.lifespan, ...candidate.reasons].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => submit(candidate.person.id)}
                    disabled={saving}
                    className="shrink-0 rounded-lg border border-sage px-3 py-1.5 text-[14px] text-sage-deep transition-colors hover:bg-sage-soft"
                  >
                    Same person
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setDismissedDuplicates(true)}
              className="mt-3 text-[14px] text-ink-soft underline underline-offset-2"
            >
              No, this is someone new
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-[14px] text-red-700">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => submit()}
            disabled={saving || !name.trim()}
            className="flex-1 rounded-lg bg-sage px-4 py-3 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-50"
          >
            {saving ? 'Adding…' : `Add ${name.trim().split(' ')[0] || 'them'} to the family`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-line px-4 py-3 text-ink transition-colors hover:border-ink-faint"
          >
            Cancel
          </button>
        </div>

        <p className="mt-3 text-[13px] text-ink-faint">
          You can add dates, places and stories afterwards — this is only to know who they are.
        </p>
      </div>
    </div>
  );
}
