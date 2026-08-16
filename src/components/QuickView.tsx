'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { PersonDetail } from '@/lib/person-detail';
import type { PersonSummary } from '@/lib/types';

type Props = {
  personId: string;
  onClose: () => void;
  onFocus: (personId: string) => void;
  onSelect: (personId: string) => void;
  onAddRelative: (anchorId: string, relation: 'parent' | 'child' | 'sibling' | 'spouse', unionId?: string | null) => void;
  onChanged: () => void;
};

/**
 * Screen 3 — a panel over the canvas. The family tree stays visible behind it,
 * so choosing a relative here simply moves the tree rather than navigating away.
 */
export default function QuickView({ personId, onClose, onFocus, onSelect, onAddRelative, onChanged }: Props) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/person/${personId}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setDetail(data.error ? null : data);
          setLoading(false);
          setEditing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const person = detail?.person;

  return (
    <aside
      className="sheet-in soft-scroll fixed inset-x-0 bottom-0 z-30 max-h-[82dvh] overflow-y-auto rounded-t-2xl border-t border-stone-line bg-card panel-shadow md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[400px] md:rounded-none md:border-l md:border-t-0 lg:w-[440px]"
      role="dialog"
      aria-modal="false"
      aria-label={person ? `${person.preferredName}, quick view` : 'Person details'}
    >
      {/* Grab handle on phones. */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stone-line bg-card/95 px-5 py-4 backdrop-blur-sm">
        <div className="min-w-0">
          {loading && <div className="h-6 w-40 animate-pulse rounded bg-parchment-deep" />}
          {person && (
            <>
              <h2 className="serif text-[22px] leading-tight text-ink">{person.preferredName}</h2>
              <p className="mt-0.5 text-[13px] text-ink-faint">
                {detail!.viewerRelation && detail!.viewerRelation !== 'you' && (
                  <span className="text-sage">Your {detail!.viewerRelation}</span>
                )}
                {detail!.viewerRelation === 'you' && <span className="text-sage">This is you</span>}
                {person.living === false && detail!.viewerRelation && ' · '}
                {person.living === false && 'Of blessed memory'}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-parchment hover:text-ink"
        >
          ✕
        </button>
      </div>

      {person && detail && (
        <div className="px-5 pb-8 pt-5">
          {editing ? (
            <EditForm
              detail={detail}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                onChanged();
                fetch(`/api/person/${personId}`)
                  .then((r) => r.json())
                  .then(setDetail);
              }}
            />
          ) : (
            <>
              {/* Identity */}
              <dl className="space-y-2.5 text-[15px]">
                {person.hebrewName && (
                  <Row label="Hebrew name">
                    <span className="hebrew text-[17px]">{person.hebrewName}</span>
                  </Row>
                )}
                {detail.birthDisplay && <Row label="Born">{detail.birthDisplay}</Row>}
                {person.birthPlace && <Row label="Birthplace">{person.birthPlace.display}</Row>}
                {detail.deathDisplay && <Row label="Passed">{detail.deathDisplay}</Row>}
                {person.deathPlace && <Row label="Place of passing">{person.deathPlace.display}</Row>}
                {detail.age !== null && (
                  <Row label={person.living ? 'Age' : 'Lifespan'}>
                    {detail.age} years{person.living ? ' old' : ''}
                  </Row>
                )}
                {person.birthName && person.birthName !== person.preferredName && (
                  <Row label="Name at birth">{person.birthName}</Row>
                )}
              </dl>

              {person.biography && (
                <p className="mt-5 border-l-2 border-sage-soft pl-4 text-[15px] leading-relaxed text-ink-soft">
                  {person.biography}
                </p>
              )}

              {/* Relationships — the reason this panel exists. */}
              <div className="mt-7 space-y-6">
                {detail.parents.length > 0 && (
                  <RelationGroup title="Parents">
                    {detail.parents.map((parent) => (
                      <RelationRow
                        key={parent.id}
                        person={parent}
                        note={parent.edgeKind !== 'biological' ? parent.relationLabel : undefined}
                        onSelect={onSelect}
                        onFocus={onFocus}
                      />
                    ))}
                  </RelationGroup>
                )}

                {detail.families.map((family, index) => (
                  <RelationGroup
                    key={family.union?.id ?? `solo-${index}`}
                    title={family.partner ? family.partner.preferredName : 'Children'}
                    subtitle={family.detail ?? undefined}
                  >
                    {family.partner && (
                      <RelationRow person={family.partner} onSelect={onSelect} onFocus={onFocus} />
                    )}
                    {family.children.map((child) => (
                      <RelationRow key={child.id} person={child} indent onSelect={onSelect} onFocus={onFocus} />
                    ))}
                    <button
                      type="button"
                      onClick={() => onAddRelative(person.id, 'child', family.union?.id ?? null)}
                      className="ml-1 mt-1 text-[13px] text-sage transition-colors hover:text-sage-deep"
                    >
                      + Add a child to this family
                    </button>
                  </RelationGroup>
                ))}

                {detail.siblings.length > 0 && (
                  <RelationGroup title={detail.siblings.length === 1 ? 'Sibling' : 'Siblings'}>
                    {detail.siblings.map((sibling) => (
                      <RelationRow
                        key={sibling.id}
                        person={sibling}
                        note={sibling.relationLabel.startsWith('half') ? sibling.relationLabel : undefined}
                        onSelect={onSelect}
                        onFocus={onFocus}
                      />
                    ))}
                  </RelationGroup>
                )}
              </div>

              {(detail.memories.length > 0 || detail.legacy.length > 0) && (
                <div className="mt-7 rounded-xl bg-parchment px-4 py-3.5 text-[14px] text-ink-soft">
                  {detail.legacy.length > 0 && (
                    <p className="serif text-[15px] leading-snug text-ink">
                      &ldquo;{detail.legacy[0].body.length > 120 ? `${detail.legacy[0].body.slice(0, 120)}…` : detail.legacy[0].body}&rdquo;
                    </p>
                  )}
                  <p className={detail.legacy.length > 0 ? 'mt-2' : ''}>
                    {detail.memories.length > 0 && `${detail.memories.length} ${detail.memories.length === 1 ? 'memory' : 'memories'}`}
                    {detail.memories.length > 0 && detail.legacy.length > 0 && ' · '}
                    {detail.legacy.length > 0 && `${detail.legacy.length} in legacy`}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-7 grid grid-cols-2 gap-2">
                <Action onClick={() => onFocus(person.id)}>Centre on {person.preferredName.split(' ')[0]}</Action>
                <Action href={`/person/${person.id}`}>Full profile</Action>
                <Action onClick={() => onAddRelative(person.id, 'parent')}>Add parent</Action>
                <Action onClick={() => onAddRelative(person.id, 'child')}>Add child</Action>
                <Action onClick={() => onAddRelative(person.id, 'sibling')}>Add sibling</Action>
                <Action onClick={() => onAddRelative(person.id, 'spouse')}>Add spouse</Action>
                <Action onClick={() => setEditing(true)}>Edit details</Action>
              </div>
            </>
          )}
        </div>
      )}

      {!loading && !person && (
        <p className="px-5 py-8 text-ink-soft">We could not find that person.</p>
      )}
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-[13px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function RelationGroup({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1.5 text-[13px] uppercase tracking-wide text-ink-faint">{title}</h3>
      {subtitle && <p className="mb-2 text-[13px] text-ink-soft">{subtitle}</p>}
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function RelationRow({
  person,
  note,
  indent,
  onSelect,
  onFocus,
}: {
  person: PersonSummary;
  note?: string;
  indent?: boolean;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  return (
    <div className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-parchment ${indent ? 'ml-4' : ''}`}>
      <button
        type="button"
        onClick={() => onSelect(person.id)}
        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
      >
        <span className="truncate text-[15px] text-ink">{person.preferredName}</span>
        {person.lifespan && <span className="shrink-0 text-[13px] text-ink-faint tabular-nums">{person.lifespan}</span>}
        {note && <span className="shrink-0 text-[13px] text-ink-faint">{note}</span>}
      </button>
      <button
        type="button"
        onClick={() => onFocus(person.id)}
        title={`Move the tree to ${person.preferredName}`}
        aria-label={`Move the tree to ${person.preferredName}`}
        className="shrink-0 rounded px-1.5 text-[13px] text-transparent transition-colors group-hover:text-sage focus-visible:text-sage"
      >
        →
      </button>
    </div>
  );
}

function Action({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    'rounded-lg border border-stone-line px-3 py-2.5 text-center text-[14px] text-ink transition-colors hover:border-sage hover:text-sage-deep';
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function EditForm({
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
