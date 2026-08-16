'use client';

import type { PersonSummary } from '@/lib/types';

type Props = {
  person: PersonSummary;
  relation?: string | null;
  isFocus?: boolean;
  isViewer?: boolean;
  isSelected?: boolean;
  /** Focus Mode: people outside the focused person's context recede. */
  dimmed?: boolean;
  onSelect: (personId: string) => void;
  onOpen?: (personId: string) => void;
};

/**
 * Name, years, a monogram. Nothing else.
 * A photograph is never required — the tree must look complete without one.
 */
export default function PersonCard({
  person,
  relation,
  isFocus,
  isViewer,
  isSelected,
  dimmed,
  onSelect,
  onOpen,
}: Props) {
  const deceased = !person.living;

  const description = [
    relation && relation !== 'You' ? relation : null,
    person.lifespan || null,
    deceased ? 'of blessed memory' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      onClick={() => onSelect(person.id)}
      onDoubleClick={() => onOpen?.(person.id)}
      aria-label={`${person.preferredName}${description ? `. ${description}` : ''}`}
      aria-current={isFocus ? 'true' : undefined}
      className={[
        'group relative flex h-full w-full items-center gap-3 rounded-[14px] border px-3 text-left transition-all duration-300',
        deceased ? 'bg-memorial border-memorial-line' : 'bg-card border-stone-line',
        isFocus ? 'border-sage ring-2 ring-sage/35 card-shadow' : 'hover:border-sage/60',
        isSelected && !isFocus ? 'border-sage/70 ring-1 ring-sage/25' : '',
        dimmed ? 'opacity-30' : 'opacity-100',
        'focus-visible:opacity-100',
      ].join(' ')}
    >
      {/* A face if the family has one, otherwise the monogram — which is a
          complete design in its own right, not a placeholder. */}
      {person.photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photos/${person.photoId}?size=thumb`}
          alt=""
          aria-hidden
          loading="lazy"
          className={[
            'h-11 w-11 shrink-0 rounded-full object-cover',
            deceased ? 'opacity-90 saturate-[0.85]' : '',
          ].join(' ')}
        />
      ) : (
        <span
          aria-hidden
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] tracking-wide serif',
            deceased ? 'bg-white/70 text-ink-faint' : 'bg-sage-soft text-sage-deep',
          ].join(' ')}
        >
          {person.initials}
        </span>
      )}

      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate serif text-[17px] leading-tight text-ink">
          {person.preferredName}
        </span>

        {/* One line, never wrapping: years first, then how they relate to you. */}
        <span className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap">
          {person.lifespan && (
            <span className="shrink-0 text-[13px] text-ink-faint tabular-nums">{person.lifespan}</span>
          )}
          {isViewer && <span className="shrink-0 text-[13px] text-sage">You</span>}
          {!isViewer && relation && relation !== 'You' && (
            <span className="truncate text-[13px] text-ink-faint">{relation}</span>
          )}
        </span>
      </span>

      {/* Deceased is marked by tone and by text, never by colour alone. */}
      {deceased && (
        <span
          aria-hidden
          className="absolute bottom-1.5 right-2.5 text-[11px] leading-none text-ink-faint/70"
          title="Of blessed memory"
        >
          ז״ל
        </span>
      )}
    </button>
  );
}
