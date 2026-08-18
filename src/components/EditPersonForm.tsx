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
  canRemove = false,
  onRemoved,
}: {
  detail: PersonDetail;
  onCancel: () => void;
  onSaved: () => void;
  /** Administrators only — see the note on RemovePerson below. */
  canRemove?: boolean;
  onRemoved?: () => void;
}) {
  const person = detail.person!;
  const [form, setForm] = useState({
    name: person.preferredName,
    birthName: person.birthName ?? '',
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
      <Field
        label="Name at birth"
        value={form.birthName}
        onChange={(v) => setForm({ ...form, birthName: v })}
        hint="Only if it changed — a maiden name, or a name changed on arriving somewhere."
      />
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

      {canRemove && <RemovePerson detail={detail} onRemoved={onRemoved} />}
    </div>
  );
}

/**
 * Removing somebody, kept deliberately quiet and slow.
 *
 * Correcting a name is one click because it should be. This is the opposite
 * case: it is rare, it cannot be undone from the interface, and the usual
 * reason for it — a person added twice — is better served by merging, which
 * keeps both sets of details. So it sits closed at the foot of the form, and
 * opening it fetches the real cost from the server rather than warning in the
 * abstract.
 */
function RemovePerson({ detail, onRemoved }: { detail: PersonDetail; onRemoved?: () => void }) {
  const person = detail.person!;
  const [preview, setPreview] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setOpen(true);
    setError(null);
    const response = await fetch(`/api/person/${person.id}?preview=1`, { method: 'DELETE' });
    const data = await response.json();
    if (data.error) setError(data.error);
    else setPreview(data);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/person/${person.id}`, { method: 'DELETE' });
    const data = await response.json();
    setBusy(false);
    if (data.error) setError(data.error);
    else onRemoved?.();
  };

  if (!open) {
    return (
      <div className="border-t border-stone-line pt-3">
        <button
          type="button"
          onClick={start}
          className="text-[13px] text-ink-faint underline underline-offset-2 transition-colors hover:text-red-700"
        >
          Remove {person.preferredName.split(' ')[0]} from the archive
        </button>
      </div>
    );
  }

  const losing = preview?.losing;
  const totals: string[] = [];
  if (losing) {
    const add = (n: number, one: string, many: string) => {
      if (n > 0) totals.push(`${n} ${n === 1 ? one : many}`);
    };
    add(losing.parents, 'recorded parent', 'recorded parents');
    add(losing.children, 'child', 'children');
    add(losing.marriages, 'marriage', 'marriages');
    add(losing.memories, 'memory', 'memories');
    add(losing.photos, 'photograph', 'photographs');
    add(losing.legacy, 'legacy entry', 'legacy entries');
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 px-4 py-3.5">
      <p className="mb-2 text-[15px] text-ink">
        Remove <strong>{person.preferredName}</strong>?
      </p>

      {preview?.blockers?.length ? (
        <p className="text-[14px] leading-relaxed text-red-800">{preview.blockers[0]}</p>
      ) : (
        <>
          <p className="mb-2 text-[14px] leading-relaxed text-ink-soft">
            {totals.length
              ? `This also removes ${totals.join(', ')}. Their relatives stay exactly as they are.`
              : 'They are not connected to anyone and hold nothing, so nothing else changes.'}
          </p>

          {preview?.strandedNames?.length > 0 && (
            <p className="mb-2 text-[14px] leading-relaxed text-red-800">
              {preview.strandedNames.join(' and ')}{' '}
              {preview.strandedNames.length === 1 ? 'is' : 'are'} connected to the family only
              through {person.preferredName.split(' ')[0]}, and will no longer appear in any tree.
            </p>
          )}

          <p className="mb-3 text-[13px] text-ink-faint">
            A backup is taken first, so this can be undone from the command line — but not from
            here. If this is the same person recorded twice, merging keeps both sets of details.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy || !preview}
              className="rounded-lg bg-red-700 px-4 py-2 text-[15px] text-white transition-colors hover:bg-red-800 disabled:opacity-60"
            >
              {busy ? 'Removing…' : 'Yes, remove them'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setPreview(null); setError(null); }}
              className="rounded-lg border border-stone-line px-4 py-2 text-[15px] text-ink"
            >
              Keep them
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-[14px] text-red-700">{error}</p>}
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
