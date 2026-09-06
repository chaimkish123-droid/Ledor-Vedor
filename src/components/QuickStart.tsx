'use client';

import { useId, useState } from 'react';

/**
 * Getting a family in, quickly.
 *
 * Adding relatives one at a time is fine for somebody who already cares. For a
 * cousin with ten minutes it is fatal: they add three people, see three cards,
 * and never come back. This asks for a whole generation at a time, in the order
 * a person actually remembers their family, and asks nothing it does not need —
 * no dates, no places, no photographs. Names now; the rest whenever.
 *
 * Sex comes from the question rather than a switch on every row. "Your brothers"
 * and "your sisters" as two lists is quicker to fill than one list with a toggle,
 * and it is how the relationship names are worked out afterwards.
 */

type Relation = 'parent' | 'child' | 'sibling' | 'spouse';

type Field = {
  label: string;
  gender: 'male' | 'female';
  relation: Relation;
  /** Whose relative this is: the person themselves, or somebody added earlier. */
  anchor: 'me' | 'father' | 'mother';
  /** Only one of these is ever wanted — a father, not a list of them. */
  single?: boolean;
};

type Step = {
  key: string;
  title: string;
  blurb: string;
  fields: Field[];
  /** Skipped when this returns false — siblings need a parent to belong to. */
  when?: (added: Added) => boolean;
};

type Added = Record<string, string>; // role -> personId

const STEPS: Step[] = [
  {
    key: 'parents',
    title: 'Your parents',
    blurb: 'Start here — almost everything else hangs off them.',
    fields: [
      { label: 'Your father', gender: 'male', relation: 'parent', anchor: 'me', single: true },
      { label: 'Your mother', gender: 'female', relation: 'parent', anchor: 'me', single: true },
    ],
  },
  {
    key: 'siblings',
    title: 'Your brothers and sisters',
    blurb: 'One name per line. Leave any blank you do not need.',
    when: (added) => Boolean(added.father || added.mother),
    fields: [
      { label: 'Brothers', gender: 'male', relation: 'sibling', anchor: 'me' },
      { label: 'Sisters', gender: 'female', relation: 'sibling', anchor: 'me' },
    ],
  },
  {
    key: 'own',
    title: 'Your own family',
    blurb: 'Your husband or wife, and your children.',
    fields: [
      { label: 'Wife', gender: 'female', relation: 'spouse', anchor: 'me', single: true },
      { label: 'Husband', gender: 'male', relation: 'spouse', anchor: 'me', single: true },
      { label: 'Sons', gender: 'male', relation: 'child', anchor: 'me' },
      { label: 'Daughters', gender: 'female', relation: 'child', anchor: 'me' },
    ],
  },
  {
    key: 'grandparents',
    title: 'Your grandparents',
    blurb: 'The generation most often lost. Even a first name is worth having.',
    when: (added) => Boolean(added.father || added.mother),
    fields: [
      { label: "Your father's father", gender: 'male', relation: 'parent', anchor: 'father', single: true },
      { label: "Your father's mother", gender: 'female', relation: 'parent', anchor: 'father', single: true },
      { label: "Your mother's father", gender: 'male', relation: 'parent', anchor: 'mother', single: true },
      { label: "Your mother's mother", gender: 'female', relation: 'parent', anchor: 'mother', single: true },
    ],
  },
];

export default function QuickStart({
  personId,
  onDone,
}: {
  personId: string;
  onDone: (added: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [added, setAdded] = useState<Added>({});
  const [count, setCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = STEPS.filter((step) => !step.when || step.when(added));
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const keyOf = (field: Field) => `${step.key}:${field.label}`;

  const linesOf = (field: Field): string[] => {
    const current = values[keyOf(field)] ?? [''];
    // A list always keeps one empty line to type the next name into.
    if (field.single) return current.slice(0, 1);
    return current[current.length - 1]?.trim() ? [...current, ''] : current;
  };

  const setLine = (field: Field, at: number, value: string) => {
    const key = keyOf(field);
    const lines = [...(values[key] ?? [''])];
    lines[at] = value;
    setValues({ ...values, [key]: lines });
  };

  const anchorFor = (field: Field): string | null => {
    if (field.anchor === 'me') return personId;
    return added[field.anchor] ?? null;
  };

  const saveStep = async () => {
    setSaving(true);
    setError(null);

    const gained: Added = {};
    let saved = 0;

    for (const field of step.fields) {
      const anchorId = anchorFor(field);
      if (!anchorId) continue;

      for (const raw of values[keyOf(field)] ?? []) {
        const name = raw.trim();
        if (!name) continue;

        const response = await fetch('/api/person', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anchorId,
            relation: field.relation,
            name,
            gender: field.gender,
          }),
        });
        const data = await response.json();

        if (data.error) {
          setSaving(false);
          setError(data.error);
          return;
        }

        saved += 1;
        // Remember the parents, so their own parents can hang off them.
        if (field.label === 'Your father') gained.father = data.personId;
        if (field.label === 'Your mother') gained.mother = data.personId;
      }
    }

    const nowAdded = { ...added, ...gained };
    setAdded(nowAdded);
    setCount(count + saved);
    setSaving(false);

    if (last) onDone(count + saved);
    else setIndex(index + 1);
  };

  const idBase = useId();

  return (
    <div>
      <p className="mb-1 text-center text-[13px] uppercase tracking-widest text-ink-faint">
        {Math.min(index + 1, steps.length)} of {steps.length}
      </p>
      <h1 className="serif mb-2 text-center text-3xl text-ink">{step.title}</h1>
      <p className="mb-7 text-center text-[16px] leading-relaxed text-ink-soft">{step.blurb}</p>

      <div className="space-y-5">
        {step.fields.map((field, fieldIndex) => {
          // The first line carries the visible label; the rest say what they are
          // for on their own, so a reader is never handed a nameless box.
          const firstId = `${idBase}-${fieldIndex}`;
          return (
            <div key={field.label}>
              <label
                htmlFor={firstId}
                className="mb-1.5 block text-[13px] uppercase tracking-wide text-ink-faint"
              >
                {field.label}
              </label>
              <div className="space-y-2">
                {linesOf(field).map((line, at) => (
                  <input
                    key={at}
                    id={at === 0 ? firstId : undefined}
                    aria-label={at === 0 ? undefined : `${field.label}, another`}
                    type="text"
                    value={line}
                    onChange={(event) => setLine(field, at, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.preventDefault();
                    }}
                    placeholder={at === 0 ? 'Name' : 'And another'}
                    autoComplete="off"
                    className="w-full rounded-lg border border-stone-line bg-parchment px-3.5 py-3 text-[16px] text-ink"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-4 text-[14px] text-red-700">{error}</p>}

      <button
        type="button"
        onClick={saveStep}
        disabled={saving}
        className="mt-7 w-full rounded-full bg-sage px-6 py-3.5 text-[16px] text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
      >
        {saving ? 'Adding…' : last ? 'Finish' : 'Next'}
      </button>

      <button
        type="button"
        onClick={() => (last ? onDone(count) : setIndex(index + 1))}
        className="mt-3 block w-full text-center text-[15px] text-ink-faint underline underline-offset-2"
      >
        {last ? 'Finish without these' : 'Skip this'}
      </button>

      {count > 0 && (
        <p className="mt-5 text-center text-[14px] text-ink-faint">
          {count} {count === 1 ? 'person' : 'people'} added so far.
        </p>
      )}
    </div>
  );
}
