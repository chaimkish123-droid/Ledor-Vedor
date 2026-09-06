'use client';

import type { GraphSlice, PersonSummary } from '@/lib/types';

/**
 * The family on a telephone.
 *
 * The canvas is the right answer on a desk and the wrong one in a hand: at the
 * width of a phone it holds a card and a half, so reading the family means
 * pinching and dragging around a picture too big to see. Shrinking it does not
 * help — the problem is the shape, not the size.
 *
 * So this is not the canvas made small. It is one person at a time, with their
 * family arranged around them the way anybody would draw it on paper: parents
 * above, husband or wife beside, children below, brothers and sisters to hand.
 * Every name is a tap, and a tap moves you to them. You walk the family rather
 * than survey it, which is what a phone is good at.
 */

type Props = {
  slice: GraphSlice;
  focusId: string;
  viewerPersonId: string | null;
  relations: Record<string, string>;
  onSelect: (personId: string) => void;
  onFocus: (personId: string) => void;
  onAddRelative: (
    anchorId: string,
    relation: 'parent' | 'child' | 'sibling' | 'spouse',
    unionId?: string | null,
  ) => void;
};

export default function MobileTree({
  slice,
  focusId,
  viewerPersonId,
  relations,
  onSelect,
  onFocus,
  onAddRelative,
}: Props) {
  const person = slice.persons[focusId];
  if (!person) return null;

  const parentIds = slice.parentEdges
    .filter((edge) => edge.childId === focusId)
    .map((edge) => edge.parentId)
    .filter((id) => slice.persons[id]);

  const unions = Object.values(slice.unions).filter((union) => union.partnerIds.includes(focusId));

  const spouseIds = unions
    .flatMap((union) => union.partnerIds)
    .filter((id) => id !== focusId && slice.persons[id]);

  const childIds = [
    ...new Set(
      slice.parentEdges.filter((edge) => edge.parentId === focusId).map((edge) => edge.childId),
    ),
  ].filter((id) => slice.persons[id]);

  const siblingIds = [
    ...new Set(
      slice.parentEdges
        .filter((edge) => parentIds.includes(edge.parentId))
        .map((edge) => edge.childId),
    ),
  ].filter((id) => id !== focusId && slice.persons[id]);

  const frontier = slice.frontier[focusId];

  return (
    <div className="soft-scroll h-full overflow-y-auto overscroll-contain px-4 pb-28 pt-4">
      <div className="mx-auto flex max-w-md flex-col gap-3">
        {/* Parents, above, as they would be drawn. */}
        <Row
          label="Parents"
          ids={parentIds}
          slice={slice}
          relations={relations}
          viewerPersonId={viewerPersonId}
          onSelect={onSelect}
          onFocus={onFocus}
          empty="No parents recorded"
          onAdd={() => onAddRelative(focusId, 'parent')}
          addLabel="Add a parent"
        />

        <Stem />

        {/* The person themselves, and whoever they married. */}
        <div className="rounded-2xl border-2 border-sage bg-card px-4 py-4">
          <p className="text-[13px] uppercase tracking-wide text-sage-deep">
            {focusId === viewerPersonId ? 'You' : relations[focusId] || 'This person'}
          </p>
          <button
            type="button"
            onClick={() => onSelect(focusId)}
            className="mt-1 block w-full text-left"
          >
            <span className="serif block text-[24px] leading-tight text-ink">
              {person.preferredName}
            </span>
            {person.lifespan && (
              <span className="mt-0.5 block text-[14px] text-ink-faint">{person.lifespan}</span>
            )}
          </button>

          {spouseIds.length > 0 && (
            <div className="mt-3 border-t border-stone-line pt-3">
              <p className="mb-1.5 text-[13px] uppercase tracking-wide text-ink-faint">
                {spouseIds.length > 1 ? 'Married' : 'Married to'}
              </p>
              <div className="flex flex-col gap-2">
                {spouseIds.map((id) => (
                  <PersonRow
                    key={id}
                    person={slice.persons[id]}
                    relation={relations[id]}
                    onSelect={onSelect}
                    onFocus={onFocus}
                  />
                ))}
              </div>
            </div>
          )}

          {spouseIds.length === 0 && (
            <button
              type="button"
              onClick={() => onAddRelative(focusId, 'spouse')}
              className="mt-3 w-full rounded-lg border border-dashed border-stone-line px-3 py-2 text-[14px] text-ink-soft transition-colors hover:border-sage hover:text-sage-deep"
            >
              Add a husband or wife
            </button>
          )}
        </div>

        <Stem />

        <Row
          label={childIds.length === 1 ? 'Child' : 'Children'}
          ids={childIds}
          slice={slice}
          relations={relations}
          viewerPersonId={viewerPersonId}
          onSelect={onSelect}
          onFocus={onFocus}
          empty="No children recorded"
          onAdd={() => onAddRelative(focusId, 'child')}
          addLabel="Add a child"
        />

        {(siblingIds.length > 0 || parentIds.length > 0) && (
          <div className="mt-2">
            <Row
              label="Brothers and sisters"
              ids={siblingIds}
              slice={slice}
              relations={relations}
              viewerPersonId={viewerPersonId}
              onSelect={onSelect}
              onFocus={onFocus}
              empty="None recorded"
              onAdd={() => onAddRelative(focusId, 'sibling')}
              addLabel="Add a brother or sister"
            />
          </div>
        )}

        {frontier && (frontier.parents > 0 || frontier.children > 0) && (
          <p className="mt-1 text-center text-[13px] text-ink-faint">
            Tap a name to move to them and see their family.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stem() {
  return <div aria-hidden className="mx-auto h-4 w-px bg-stone-line" />;
}

function Row({
  label,
  ids,
  slice,
  relations,
  viewerPersonId,
  onSelect,
  onFocus,
  empty,
  onAdd,
  addLabel,
}: {
  label: string;
  ids: string[];
  slice: GraphSlice;
  relations: Record<string, string>;
  viewerPersonId: string | null;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  empty: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-line bg-card px-4 py-3.5">
      <p className="mb-2 text-[13px] uppercase tracking-wide text-ink-faint">{label}</p>

      {ids.length === 0 ? (
        <p className="mb-2 text-[15px] text-ink-faint">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {ids.map((id) => (
            <PersonRow
              key={id}
              person={slice.persons[id]}
              relation={id === viewerPersonId ? 'You' : relations[id]}
              onSelect={onSelect}
              onFocus={onFocus}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="mt-2.5 text-[14px] text-sage transition-colors hover:text-sage-deep"
      >
        + {addLabel}
      </button>
    </div>
  );
}

function PersonRow({
  person,
  relation,
  onSelect,
  onFocus,
}: {
  person: PersonSummary;
  relation?: string;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  if (!person) return null;
  const deceased = !person.living;

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={() => onSelect(person.id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-stone-line bg-parchment px-3 py-2.5 text-left transition-colors hover:border-sage"
      >
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] serif ${
            deceased ? 'bg-white/70 text-ink-faint' : 'bg-sage-soft text-sage-deep'
          }`}
        >
          {person.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="serif block truncate text-[17px] leading-tight text-ink">
            {person.preferredName}
          </span>
          <span className="block truncate text-[13px] text-ink-faint">
            {[relation, person.lifespan].filter(Boolean).join(' · ')}
          </span>
        </span>
        {deceased && (
          <span aria-hidden className="shrink-0 text-[11px] text-ink-faint/70">
            ז״ל
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onFocus(person.id)}
        aria-label={`Move to ${person.preferredName}`}
        className="shrink-0 rounded-xl border border-stone-line px-3 text-ink-faint transition-colors hover:border-sage hover:text-sage-deep"
      >
        →
      </button>
    </div>
  );
}
