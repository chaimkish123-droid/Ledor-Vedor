/**
 * Who a memory is for.
 *
 * Facts about a family are shared — dates, places, who married whom. What
 * somebody *remembers* is not always meant for every cousin and in-law: a note
 * about a living relative's illness, or a rift, or something still being
 * written. Three levels cover almost every real case without asking anyone to
 * manage a list of names:
 *
 *   family   everyone signed in — the default, and what a family archive is for
 *   close    the people closest to whoever the memory is about
 *   private  only the person who wrote it, for something not ready to share
 *
 * "Close" is calculated from the family graph rather than chosen by hand, which
 * is the one thing this application can do that a general note-keeping tool
 * cannot. It means the subject themselves, their parents and children, their
 * grandparents and grandchildren, their siblings and their spouse.
 *
 * Two rules that matter more than the levels themselves:
 *
 *   1. Filtering happens where the data is read, never in the interface. A
 *      memory nobody may see must not reach the browser at all.
 *   2. Search reads the text of memories. It is the likeliest place for a
 *      private one to leak, so it filters by the same rule.
 *
 * An administrator is not exempt. Privacy an administrator can look straight
 * through is not privacy — and someone who can reach the database file is a
 * different problem from someone using the application.
 *
 * This module reads the family graph, so it is server-only. The wording the
 * interface needs lives in `visibility-labels`, which a browser may load.
 */

import { dbGraph } from './graph-db';
import { relationship } from './relationships';
import type { Visibility } from './visibility-labels';

export type { Visibility } from './visibility-labels';
export {
  VISIBILITIES,
  VISIBILITY_LABELS,
  VISIBILITY_NOTES,
  isVisibility,
  visibilityMarker,
} from './visibility-labels';

export type Viewer = {
  userId: string | null;
  personId: string | null;
};

/** Within two generations either way, or beside them. */
export function isCloseFamily(viewerPersonId: string, subjectId: string): boolean {
  if (viewerPersonId === subjectId) return true;

  const rel = relationship(dbGraph(), viewerPersonId, subjectId);
  switch (rel.kind) {
    case 'self':
    case 'spouse':
    case 'sibling':
    case 'half-sibling':
      return true;
    case 'ancestor':
    case 'descendant':
      return (rel.generations ?? 1) <= 2;
    default:
      return false;
  }
}

export type ProtectedEntry = {
  visibility: Visibility;
  /** The account that wrote it, when there was one. */
  contributorId: string | null;
  /** The people the entry is about. */
  subjectIds: string[];
};

export function canSee(viewer: Viewer, entry: ProtectedEntry): boolean {
  if (entry.visibility === 'family') return true;

  // Whoever wrote it can always see it.
  if (entry.contributorId && viewer.userId && entry.contributorId === viewer.userId) return true;

  if (entry.visibility === 'private') return false;

  if (!viewer.personId) return false;
  return entry.subjectIds.some((subjectId) => isCloseFamily(viewer.personId!, subjectId));
}
