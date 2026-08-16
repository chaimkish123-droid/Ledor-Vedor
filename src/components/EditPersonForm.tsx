'use client';

import { useId, useState } from 'react';
import type { PersonDetail } from '@/lib/person-detail';

/**
 * The one place a person's details are edited, used both by the panel over the
 * family canvas and by their full profile. Two forms that drift apart is how a
 * field ends up editable in one place and not the other.
 */
export default function EditPersonForm({
  detail,
  onCancel,
  onSaved,
}: {
  detail: PersonDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const person = detail.person!;
  const [form, setForm] = useState({
    name: person.preferredName,
    hebrewName: person.hebrewName ?? '',
    birth: detail.birthDisplay,
    death: detail.deathDisplay,
    birthPlace: person.birthPlace?.display ?? '',
    deathPlace: person.deathPlace?.display ?? '',
    biography: person.biography ?? '',
    living: person.living,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bioId = useId();

  const save = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/person/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    setSaving(false);
    if (data.error) setError(data.error);
    else onSaved();
  };

  return (
    <div className="space-y-3">
      <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <Field label="Hebrew name" value={form.hebrewName} onChange={(v) => setForm({ ...form, hebrewName: v })} hebrew />
      <Field label="Born" value={form.birth} onChange={(v) => setForm({ ...form, birth: v })} hint="1948, c. 1948, or May 14 1948" />
      <Field label="Birthplace" value={form.birthPlace} onChange={(v) => setForm({ ...form, birthPlace: v })} />

      <label className="flex items-center gap-2.5 py-1 text-[15px] text-ink">
        <input
          type="checkbox"
          checked={form.living}
          onChange={(event) => setForm({ ...form, living: event.target.checked })}
          className="h-5 w-5 accent-[color:var(--color-sage)]"
        />
        Living
      </label>

      {!form.living && (
        <>
          <Field label="Passed" value={form.death} onChange={(v) => setForm({ ...form, death: v })} />
          <Field label="Place of passing" value={form.deathPlace} onChange={(v) => setForm({ ...form, deathPlace: v })} />
        </>
      )}

      <div>
        <label htmlFor={bioId} className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">
          About them
        </label>
        <textarea
          id={bioId}
          value={form.biography}
          onChange={(event) => setForm({ ...form, biography: event.target.value })}
          rows={4}
          className="w-full rounded-lg border border-stone-line bg-parchment px-3 py-2 text-[15px] text-ink"
        />
      </div>

      {error && <p className="text-[14px] text-red-700">{error}</p>}

      <p className="text-[13px] text-ink-faint">
        Changes appear for everyone straight away. Nothing is lost — earlier values are kept in the history.
      </p>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-sage px-4 py-2.5 text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-line px-4 py-2.5 text-ink transition-colors hover:border-ink-faint"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}


export function Field({
  label,
  value,
  onChange,
  hint,
  hebrew,
  autoFocus,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  hebrew?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  // Every label is tied to its field: a screen reader must never have to guess.
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1 block text-[13px] uppercase tracking-wide text-ink-faint">
        {label}
      </label>
      <input
        id={fieldId}
        type="text"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border border-stone-line bg-parchment px-3 py-2.5 text-[16px] text-ink ${hebrew ? 'hebrew' : ''}`}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-[12px] text-ink-faint">
          {hint}
        </p>
      )}
    </div>
  );
}
