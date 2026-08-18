'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { PersonDetail } from '@/lib/person-detail';
import type { PersonSummary } from '@/lib/types';
import PhotoUpload from './PhotoUpload';
import EditPersonForm from './EditPersonForm';

type Props = {
  personId: string;
  onClose: () => void;
  onFocus: (personId: string) => void;
  onSelect: (personId: string) => void;
  onAddRelative: (anchorId: string, relation: 'parent' | 'child' | 'sibling' | 'spouse', unionId?: string | null) => void;
  onChanged: () => void;
  isAdmin?: boolean;
};

/**
 * Screen 3 — a panel over the canvas. The family tree stays visible behind it,
 * so choosing a relative here simply moves the tree rather than navigating away.
 */
export default function QuickView({ personId, onClose, onFocus, onSelect, onAddRelative, onChanged, isAdmin }: Props) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const reload = () =>
    fetch(`/api/person/${personId}`)
      .then((response) => response.json())
      .then((data) => setDetail(data.error ? null : data));

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
          {/* Their portrait, if the family has given them one. The panel is
              complete without it, so nothing shifts when there is none. */}
          {!editing && detail.portrait && (
            <div className="mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${detail.portrait.id}`}
                alt={detail.portrait.caption ?? `A photograph of ${person.preferredName}`}
                className="max-h-64 w-full rounded-xl object-cover"
              />
              {(detail.portrait.caption || detail.portrait.takenText) && (
                <p className="mt-1.5 text-[13px] text-ink-faint">
                  {[detail.portrait.caption, detail.portrait.takenText].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          )}

          {editing ? (
            <EditPersonForm
              detail={detail}
              canRemove={isAdmin}
              onRemoved={() => {
                onChanged();
                onClose();
              }}
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
                <Action onClick={() => setAddingPhoto(true)}>
                  {detail.portrait ? 'Change photograph' : 'Add a photograph'}
                </Action>
              </div>
            </>
          )}
        </div>
      )}

      {!loading && !person && (
        <p className="px-5 py-8 text-ink-soft">We could not find that person.</p>
      )}

      {addingPhoto && person && detail && (
        <PhotoUpload
          personId={person.id}
          personName={person.preferredName}
          hasExisting={!!detail.portrait}
          onUploaded={() => {
            setAddingPhoto(false);
            reload();
            onChanged();
          }}
          onCancel={() => setAddingPhoto(false)}
        />
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
