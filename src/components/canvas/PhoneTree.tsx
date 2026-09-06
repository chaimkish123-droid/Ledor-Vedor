'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { GraphSlice, PersonSummary } from '@/lib/types';

/**
 * A tree that fits in a hand.
 *
 * The first attempt at a phone view stacked the family into labelled boxes —
 * parents, you, children — and it read as a list. The shape people recognise
 * as a family tree is lines: a marriage drawn as a bar between two people, a
 * child hanging from it, grandparents standing over the parents. So this
 * draws exactly that, three or four generations deep, sized to the width of
 * the screen it is on.
 *
 * Everything drawn is a real button: tap somebody and the tree re-centres on
 * them, so their own parents and children swing into view. Tap the person in
 * the middle and their panel opens. Where a place in the tree is empty — no
 * parents yet, no children — the gap is drawn too, as a dotted card offering
 * to fill it, because an empty slot invites a name in a way a missing one
 * never does.
 *
 * Lines are SVG; people are HTML on top. Lines need to be drawn, and people
 * need to be tappable, readable by a screen reader, and found by search — SVG
 * text is none of those things.
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

type Card = {
  key: string;
  personId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  small?: boolean;
  /** An empty place in the family, offering to be filled. */
  gap?: { label: string; relation: 'parent' | 'child' | 'spouse'; anchorId: string };
  /** Children past the fourth, folded into one card that opens the full list. */
  more?: number;
};

type Line = { d: string };

const GAP = 10;
const ROW = 96; // vertical distance between generations

export default function PhoneTree(props: Props) {
  const { slice, focusId } = props;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, el.clientWidth));
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  const person = slice.persons[focusId];
  if (!person) return null;

  /* --- Who is where ------------------------------------------------- */

  const parentsOf = (id: string) =>
    slice.parentEdges
      .filter((e) => e.childId === id)
      .map((e) => e.parentId)
      .filter((p) => slice.persons[p]);

  const childrenOf = (id: string) => [
    ...new Set(
      slice.parentEdges.filter((e) => e.parentId === id).map((e) => e.childId),
    ),
  ].filter((c) => slice.persons[c]);

  const spousesOf = (id: string) =>
    Object.values(slice.unions)
      .filter((u) => u.partnerIds.includes(id))
      .flatMap((u) => u.partnerIds)
      .filter((p) => p !== id && slice.persons[p]);

  const parents = parentsOf(focusId);
  const father = parents.find((p) => slice.persons[p].gender === 'male') ?? parents[0];
  const mother = parents.find((p) => p !== father);

  const spouses = spousesOf(focusId);
  const spouse = spouses[0];

  const children = childrenOf(focusId);
  const siblings = [
    ...new Set(parents.flatMap((p) => childrenOf(p))),
  ].filter((s) => s !== focusId);

  const fathersParents = father ? parentsOf(father) : [];
  const mothersParents = mother ? parentsOf(mother) : [];
  const hasGrandparents = fathersParents.length + mothersParents.length > 0;

  /* --- Geometry ------------------------------------------------------- */

  const W = width;
  const edge = 8;
  const cardW = Math.min(150, Math.floor((W - edge * 2 - GAP) / 2));
  const cardH = 54;
  const smallW = Math.floor((W - edge * 2 - GAP * 3) / 4);
  const smallH = 44;

  const cards: Card[] = [];
  const lines: Line[] = [];
  let y = edge;

  // Row 1 — grandparents, as two small couples over the parent they belong to.
  const parentRowY = hasGrandparents ? y + ROW : y;
  const fatherX = edge;
  const motherX = W - edge - cardW;
  const fatherC = fatherX + cardW / 2;
  const motherC = motherX + cardW / 2;

  if (hasGrandparents) {
    const couple = (ids: string[], centre: number) => {
      const n = Math.min(2, ids.length);
      if (!n) return;
      const total = n * smallW + (n - 1) * GAP;
      let x = Math.round(centre - total / 2);
      x = Math.max(edge, Math.min(W - edge - total, x));
      const mid = x + total / 2;
      ids.slice(0, 2).forEach((id, i) => {
        cards.push({ key: id, personId: id, x: x + i * (smallW + GAP), y, w: smallW, h: smallH, small: true });
      });
      if (n === 2) {
        // Marriage bar between them, and a drop to the child below.
        const a = x + smallW;
        const b = x + smallW + GAP;
        lines.push({ d: `M ${a} ${y + smallH / 2} L ${b} ${y + smallH / 2}` });
      }
      lines.push({
        d: `M ${mid} ${n === 2 ? y + smallH / 2 : y + smallH} L ${mid} ${y + smallH + 12} L ${centre} ${y + smallH + 12} L ${centre} ${parentRowY}`,
      });
    };
    if (father) couple(fathersParents, fatherC);
    if (mother) couple(mothersParents, motherC);
  }

  // Row 2 — parents, joined by a marriage bar.
  y = parentRowY;
  const youRowY = y + ROW;
  const parentsJunctionX = (fatherC + motherC) / 2;
  const parentsJunctionY = y + cardH / 2;

  if (father) cards.push({ key: father, personId: father, x: fatherX, y, w: cardW, h: cardH });
  else cards.push({ key: 'gap-father', x: fatherX, y, w: cardW, h: cardH, gap: { label: 'Add a parent', relation: 'parent', anchorId: focusId } });

  if (mother) cards.push({ key: mother, personId: mother, x: motherX, y, w: cardW, h: cardH });
  else if (father) cards.push({ key: 'gap-mother', x: motherX, y, w: cardW, h: cardH, gap: { label: 'Add a parent', relation: 'parent', anchorId: focusId } });

  if (father || mother) {
    lines.push({ d: `M ${fatherX + cardW} ${parentsJunctionY} L ${motherX} ${parentsJunctionY}` });
  }

  // Row 3 — you, and your husband or wife.
  y = youRowY;
  // You on the left, your husband or wife (or the offer of one) on the right.
  const youX = edge + Math.round((W - edge * 2 - (cardW * 2 + GAP)) / 2);
  const spouseX = youX + cardW + GAP;
  const youC = youX + cardW / 2;
  const coupleJunctionX = youX + cardW + GAP / 2;
  const coupleJunctionY = y + cardH / 2;

  cards.push({ key: focusId, personId: focusId, x: youX, y, w: cardW, h: cardH });
  if (spouse) cards.push({ key: spouse, personId: spouse, x: spouseX, y, w: cardW, h: cardH });
  else cards.push({ key: 'gap-spouse', x: spouseX, y, w: cardW, h: cardH, gap: { label: 'Add husband or wife', relation: 'spouse', anchorId: focusId } });

  // Down from the parents' marriage to you.
  if (father || mother) {
    const midY = parentsJunctionY + (y - parentsJunctionY) / 2;
    lines.push({ d: `M ${parentsJunctionX} ${parentsJunctionY} L ${parentsJunctionX} ${midY} L ${youC} ${midY} L ${youC} ${y}` });
  }
  if (spouse) lines.push({ d: `M ${youX + cardW} ${coupleJunctionY} L ${spouseX} ${coupleJunctionY}` });

  // Row 4 — children, fanned beneath the marriage.
  y = y + ROW;
  const shown = children.slice(0, 4);
  const more = children.length - shown.length;
  const kidW = shown.length + (more ? 1 : 0) > 2 ? smallW : cardW;
  const kidH = kidW === smallW ? smallH : cardH;
  const slots = shown.length + (more ? 1 : 0);

  if (slots === 0) {
    const gx = Math.round(coupleJunctionX - cardW / 2);
    cards.push({ key: 'gap-child', x: gx, y, w: cardW, h: cardH, gap: { label: 'Add a child', relation: 'child', anchorId: focusId } });
    lines.push({ d: `M ${coupleJunctionX} ${spouse ? coupleJunctionY : youRowY + cardH} L ${coupleJunctionX} ${y}` });
  } else {
    const total = slots * kidW + (slots - 1) * GAP;
    const startX = Math.round(Math.max(edge, coupleJunctionX - total / 2));
    const from = spouse ? coupleJunctionY : youRowY + cardH;
    const fromX = spouse ? coupleJunctionX : youC;
    const busY = y - 18;
    lines.push({ d: `M ${fromX} ${from} L ${fromX} ${busY}` });
    if (slots > 1) {
      lines.push({ d: `M ${startX + kidW / 2} ${busY} L ${startX + total - kidW / 2} ${busY}` });
    }
    shown.forEach((id, i) => {
      const x = startX + i * (kidW + GAP);
      cards.push({ key: id, personId: id, x, y, w: kidW, h: kidH, small: kidW === smallW });
      lines.push({ d: `M ${x + kidW / 2} ${busY} L ${x + kidW / 2} ${y}` });
    });
    if (more) {
      const x = startX + shown.length * (kidW + GAP);
      cards.push({ key: 'more', x, y, w: kidW, h: kidH, small: kidW === smallW, more });
      lines.push({ d: `M ${x + kidW / 2} ${busY} L ${x + kidW / 2} ${y}` });
    }
  }

  const height = y + Math.max(cardH, kidH) + edge;

  /* --- Draw --------------------------------------------------------------- */

  return (
    <div className="soft-scroll h-full overflow-y-auto overscroll-contain pb-28">
      <div ref={box} className="relative mx-auto w-full max-w-md px-0" style={{ height }}>
        <svg
          aria-hidden
          className="absolute inset-0 text-stone-line"
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
        >
          {lines.map((line, i) => (
            <path key={i} d={line.d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
        </svg>

        {cards.map((card) =>
          card.more ? (
            <button
              key={card.key}
              type="button"
              onClick={() => props.onSelect(focusId)}
              aria-label={`${card.more} more children`}
              className="absolute flex items-center justify-center rounded-xl border border-stone-line bg-parchment px-2 text-center text-[12px] leading-tight text-ink-soft transition-colors hover:border-sage"
              style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
            >
              {card.more} more
            </button>
          ) : card.gap ? (
            <button
              key={card.key}
              type="button"
              onClick={() => props.onAddRelative(card.gap!.anchorId, card.gap!.relation)}
              className="absolute flex items-center justify-center rounded-xl border border-dashed border-stone-line bg-parchment/60 px-2 text-center text-[12px] leading-tight text-ink-faint transition-colors hover:border-sage hover:text-sage-deep"
              style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
            >
              + {card.gap.label}
            </button>
          ) : (
            <PersonCard
              key={card.key}
              card={card}
              person={slice.persons[card.personId!]}
              relation={card.personId === props.viewerPersonId ? 'You' : props.relations[card.personId!]}
              isFocus={card.personId === focusId}
              onTap={() => (card.personId === focusId ? props.onSelect(focusId) : props.onFocus(card.personId!))}
            />
          ),
        )}
      </div>

      {siblings.length > 0 && (
        <div className="mx-auto mt-2 max-w-md px-3">
          <p className="mb-1.5 text-[12px] uppercase tracking-wide text-ink-faint">
            {focusId === props.viewerPersonId ? 'Your brothers and sisters' : 'Brothers and sisters'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => props.onFocus(id)}
                className="rounded-full border border-stone-line bg-card px-3 py-1.5 text-[14px] text-ink transition-colors hover:border-sage"
              >
                {slice.persons[id].preferredName.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mx-auto mt-4 max-w-md px-3 text-center text-[12px] text-ink-faint">
        Tap anyone to put them in the middle. Tap the middle to open them.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** A name that fits a small card: the whole thing where it will go, else the first name. */
function fit(name: string, small: boolean): string {
  const limit = small ? 11 : 18;
  if (name.length <= limit) return name;
  const first = name.split(' ')[0];
  return first.length <= limit ? first : `${first.slice(0, limit - 1)}…`;
}

function PersonCard({
  card,
  person,
  relation,
  isFocus,
  onTap,
}: {
  card: Card;
  person: PersonSummary;
  relation?: string;
  isFocus: boolean;
  onTap: () => void;
}) {
  if (!person) return null;
  const deceased = !person.living;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${person.preferredName}${relation ? `, ${relation}` : ''}`}
      className={`absolute flex flex-col items-center justify-center rounded-xl border bg-card px-1.5 text-center transition-colors ${
        isFocus ? 'border-2 border-sage' : 'border-stone-line hover:border-sage'
      } ${deceased ? 'opacity-90' : ''}`}
      style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
    >
      <span
        className={`serif block w-full truncate leading-tight text-ink ${card.small ? 'text-[13px]' : 'text-[15px]'}`}
      >
        {fit(person.preferredName, Boolean(card.small))}
      </span>
      {relation && (
        <span className={`block w-full truncate leading-tight ${isFocus ? 'text-sage-deep' : 'text-ink-faint'} ${card.small ? 'text-[10px]' : 'text-[11px]'}`}>
          {relation}
        </span>
      )}
      {deceased && (
        <span aria-hidden className="absolute right-1 top-0.5 text-[9px] text-ink-faint/70">
          ז״ל
        </span>
      )}
    </button>
  );
}
