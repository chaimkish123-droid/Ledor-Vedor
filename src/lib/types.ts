import type { FlexibleDate } from './dates';

export type Person = {
  id: string;
  preferredName: string;
  givenName: string | null;
  familyName: string | null;
  birthName: string | null;
  hebrewName: string | null;
  gender: string | null;
  living: boolean;
  birth: FlexibleDate;
  death: FlexibleDate;
  birthPlace: Place | null;
  deathPlace: Place | null;
  biography: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Place = {
  id: string;
  display: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

export type UnionStatus = 'married' | 'partnered' | 'divorced' | 'widowed' | 'separated' | 'unknown';

export type Union = {
  id: string;
  status: UnionStatus;
  partnerIds: string[];
  childIds: string[];
  start: FlexibleDate;
  end: FlexibleDate;
  place: Place | null;
  note: string | null;
};

export type ParentEdgeKind = 'biological' | 'adoptive' | 'step' | 'foster' | 'guardian';

export type ParentEdge = {
  id: string;
  parentId: string;
  childId: string;
  unionId: string | null;
  kind: ParentEdgeKind;
};

/** The slice of the family graph currently on screen. */
export type GraphSlice = {
  persons: Record<string, PersonSummary>;
  unions: Record<string, Union>;
  parentEdges: ParentEdge[];
  /** Counts of family that exists just beyond the loaded slice, per person. */
  frontier: Record<string, Frontier>;
};

export type Frontier = {
  parents: number;
  children: number;
  siblings: number;
  spouses: number;
  /** True when at least one relative in that direction is not in the current slice. */
  moreUp: boolean;
  moreDown: boolean;
};

export type PersonSummary = {
  id: string;
  preferredName: string;
  hebrewName: string | null;
  gender: string | null;
  living: boolean;
  birth: FlexibleDate;
  death: FlexibleDate;
  lifespan: string;
  initials: string;
  birthPlace: string | null;
  /** The face on their card, when the family has given them one. */
  photoId?: string | null;
};

export type Memory = {
  id: string;
  title: string;
  body: string;
  dateText: string | null;
  provenance: string | null;
  contributorName: string | null;
  createdAt: string;
  personIds: string[];
  people: { id: string; name: string }[];
};

export type LegacyKind = 'value' | 'lesson' | 'saying' | 'teaching' | 'contribution' | 'story' | 'known_for';

export type LegacyEntry = {
  id: string;
  personId: string;
  kind: LegacyKind;
  title: string | null;
  body: string;
  contributorName: string | null;
  createdAt: string;
};

export type LifeEvent = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  date: FlexibleDate;
  place: Place | null;
  personIds: string[];
};

export type Revision = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  summary: string | null;
  userName: string | null;
  createdAt: string;
  columnName: string | null;
  /** Field edits can be put back; creations cannot be undone. */
  revertable: boolean;
};

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  personId: string | null;
  role: 'member' | 'admin';
  onboarded: boolean;
};
