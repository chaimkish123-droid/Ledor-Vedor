/**
 * The wording for who a memory is for.
 *
 * Deliberately separate from the rule that decides it: the rule reads the
 * family graph, and therefore the database, which has no business being sent to
 * a browser. Anything the interface needs lives here, where it is safe to
 * import from a client component.
 */

export type Visibility = 'family' | 'close' | 'private';

export const VISIBILITIES: Visibility[] = ['family', 'close', 'private'];

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === 'string' && (VISIBILITIES as string[]).includes(value);
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  family: 'Everyone in the family',
  close: 'Close family only',
  private: 'Just me for now',
};

export const VISIBILITY_NOTES: Record<Visibility, string> = {
  family: 'Anyone signed in can read this.',
  close: 'Their parents, children, grandparents, grandchildren, brothers and sisters, and their husband or wife.',
  private: 'Nobody else can read this until you change it.',
};

/** A short marker shown beside an entry that is not open to everyone. */
export function visibilityMarker(visibility: Visibility): string | null {
  if (visibility === 'family') return null;
  return visibility === 'private' ? 'Only you can see this' : 'Close family only';
}
