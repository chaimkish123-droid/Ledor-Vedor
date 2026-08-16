import { db } from './db';
import type { GraphAccess } from './relationships';

/**
 * A `GraphAccess` backed by SQLite, with a per-request memo cache.
 *
 * Relationship calculation walks the same edges repeatedly (ancestor maps,
 * path search, "how is everyone on screen related to me"), so caching each
 * person's edges once per request keeps a thousand-person family instant.
 */
export function dbGraph(): GraphAccess {
  const parentCache = new Map<string, string[]>();
  const childCache = new Map<string, string[]>();
  const spouseCache = new Map<string, string[]>();
  const personCache = new Map<string, { gender: string | null; name: string }>();

  const parentStmt = db().prepare('SELECT parent_id FROM parent_child WHERE child_id = ?');
  const childStmt = db().prepare('SELECT child_id FROM parent_child WHERE parent_id = ?');
  const spouseStmt = db().prepare(
    `SELECT other.person_id AS id FROM union_partner mine
     JOIN union_partner other ON other.union_id = mine.union_id
     WHERE mine.person_id = ? AND other.person_id != ?`,
  );
  const personStmt = db().prepare('SELECT gender, preferred_name FROM person WHERE id = ?');
  const unionStmt = db().prepare(
    'SELECT union_id FROM parent_child WHERE child_id = ? AND union_id IS NOT NULL LIMIT 1',
  );
  const unionOfChildCache = new Map<string, string | null>();

  return {
    parentsOf(personId) {
      let cached = parentCache.get(personId);
      if (!cached) {
        cached = (parentStmt.all(personId) as { parent_id: string }[]).map((r) => r.parent_id);
        parentCache.set(personId, cached);
      }
      return cached;
    },
    childrenOf(personId) {
      let cached = childCache.get(personId);
      if (!cached) {
        cached = (childStmt.all(personId) as { child_id: string }[]).map((r) => r.child_id);
        childCache.set(personId, cached);
      }
      return cached;
    },
    spousesOf(personId) {
      let cached = spouseCache.get(personId);
      if (!cached) {
        cached = [
          ...new Set((spouseStmt.all(personId, personId) as { id: string }[]).map((r) => r.id)),
        ];
        spouseCache.set(personId, cached);
      }
      return cached;
    },
    genderOf(personId) {
      return (load(personId).gender ?? null) as any;
    },
    nameOf(personId) {
      return load(personId).name;
    },
    unionOfChild(personId) {
      if (!unionOfChildCache.has(personId)) {
        const row = unionStmt.get(personId) as { union_id: string | null } | undefined;
        unionOfChildCache.set(personId, row?.union_id ?? null);
      }
      return unionOfChildCache.get(personId) ?? null;
    },
  };

  function load(personId: string) {
    let cached = personCache.get(personId);
    if (!cached) {
      const row = personStmt.get(personId) as { gender: string | null; preferred_name: string } | undefined;
      cached = { gender: row?.gender ?? null, name: row?.preferred_name ?? 'Unknown' };
      personCache.set(personId, cached);
    }
    return cached;
  }
}
