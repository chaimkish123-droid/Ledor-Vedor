-- L'Dor VaDor — one connected family graph.
--
-- Design rules encoded here:
--   * No relatives are hard-coded into person columns. Every relationship is an edge.
--   * Marriages/partnerships are first-class entities so children attach to the
--     correct parental union, and remarriage is ordinary rather than exceptional.
--   * Nothing is destroyed on edit; revisions keep the previous value forever.
--   * Person and User are separate: thousands of people, a handful of accounts.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS person (
  id                TEXT PRIMARY KEY,
  preferred_name    TEXT NOT NULL,
  given_name        TEXT,
  family_name       TEXT,
  birth_name        TEXT,           -- name at birth, when different
  hebrew_name       TEXT,
  gender            TEXT,           -- 'female' | 'male' | 'other' | NULL (display only, never structural)
  living            INTEGER NOT NULL DEFAULT 1,

  birth_value       TEXT DEFAULT '',
  birth_precision   TEXT DEFAULT 'unknown',
  birth_qualifier   TEXT DEFAULT 'none',
  birth_end_value   TEXT,
  birth_after_sunset INTEGER DEFAULT 0,
  birth_text        TEXT,
  birth_place_id    TEXT REFERENCES place(id) ON DELETE SET NULL,

  death_value       TEXT DEFAULT '',
  death_precision   TEXT DEFAULT 'unknown',
  death_qualifier   TEXT DEFAULT 'none',
  death_end_value   TEXT,
  death_after_sunset INTEGER DEFAULT 0,
  death_text        TEXT,
  death_place_id    TEXT REFERENCES place(id) ON DELETE SET NULL,

  biography         TEXT,
  created_at        TEXT NOT NULL,
  created_by        TEXT REFERENCES user(id) ON DELETE SET NULL,
  updated_at        TEXT NOT NULL,
  updated_by        TEXT REFERENCES user(id) ON DELETE SET NULL
);

-- Every name a person is known by. Search matches any of them; the tree shows one.
CREATE TABLE IF NOT EXISTS person_name (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,  -- 'preferred'|'given'|'family'|'birth'|'hebrew'|'nickname'|'alternate'|'spelling'
  value       TEXT NOT NULL,
  normalized  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_person_name_norm ON person_name(normalized);
CREATE INDEX IF NOT EXISTS idx_person_name_person ON person_name(person_id);

-- Marriage / partnership as its own entity.
CREATE TABLE IF NOT EXISTS union_rel (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'married', -- married|partnered|divorced|widowed|separated|unknown
  start_value   TEXT DEFAULT '',
  start_precision TEXT DEFAULT 'unknown',
  start_qualifier TEXT DEFAULT 'none',
  end_value     TEXT DEFAULT '',
  end_precision TEXT DEFAULT 'unknown',
  end_qualifier TEXT DEFAULT 'none',
  place_id      TEXT REFERENCES place(id) ON DELETE SET NULL,
  note          TEXT,
  created_at    TEXT NOT NULL,
  created_by    TEXT REFERENCES user(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS union_partner (
  union_id   TEXT NOT NULL REFERENCES union_rel(id) ON DELETE CASCADE,
  person_id  TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  /** Ordering only, so the couple renders left/right consistently. */
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (union_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_union_partner_person ON union_partner(person_id);

-- Parent → child edge. `union_id` records which relationship the child belongs to.
CREATE TABLE IF NOT EXISTS parent_child (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  child_id   TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  union_id   TEXT REFERENCES union_rel(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'biological', -- biological|adoptive|step|foster|guardian
  note       TEXT,
  UNIQUE (parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_parent ON parent_child(parent_id);
CREATE INDEX IF NOT EXISTS idx_pc_child ON parent_child(child_id);
CREATE INDEX IF NOT EXISTS idx_pc_union ON parent_child(union_id);

CREATE TABLE IF NOT EXISTS place (
  id           TEXT PRIMARY KEY,
  display      TEXT NOT NULL,      -- exactly what a family member typed
  normalized   TEXT NOT NULL,      -- for matching "Brooklyn, NY" to "Brooklyn, New York"
  city         TEXT,
  region       TEXT,
  country      TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_place_norm ON place(normalized);

CREATE TABLE IF NOT EXISTS event (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL, -- birth|marriage|residence|education|occupation|accomplishment|family|immigration|military|passing|custom
  title       TEXT NOT NULL,
  description TEXT,
  date_value  TEXT DEFAULT '',
  date_precision TEXT DEFAULT 'unknown',
  date_qualifier TEXT DEFAULT 'none',
  date_end_value TEXT,
  place_id    TEXT REFERENCES place(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  created_by  TEXT REFERENCES user(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_person (
  event_id  TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'subject',
  PRIMARY KEY (event_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_event_person_person ON event_person(person_id);

-- Stories are kept deliberately separate from genealogical fact.
CREATE TABLE IF NOT EXISTS memory (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  date_text     TEXT,             -- "Summer 1972", "when I was nine"
  provenance    TEXT,             -- "As told to David by his mother"
  contributor_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  contributor_name TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_person (
  memory_id TEXT NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_person_person ON memory_person(person_id);

CREATE TABLE IF NOT EXISTS legacy_entry (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL, -- value|lesson|saying|teaching|contribution|story|known_for
  title         TEXT,
  body          TEXT NOT NULL,
  contributor_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  contributor_name TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legacy_person ON legacy_entry(person_id);

CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  person_id     TEXT REFERENCES person(id) ON DELETE SET NULL,
  role          TEXT NOT NULL DEFAULT 'member', -- member|admin
  onboarded     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitation (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  note        TEXT,
  person_id   TEXT REFERENCES person(id) ON DELETE SET NULL, -- suggested place in the family
  created_by  TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  used_by     TEXT REFERENCES user(id) ON DELETE SET NULL,
  used_at     TEXT
);

-- Viewing preferences belong to the viewer, never to the family data.
CREATE TABLE IF NOT EXISTS user_pref (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS recently_viewed (
  user_id   TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, person_id)
);

-- Nothing is ever lost.
CREATE TABLE IF NOT EXISTS revision (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,  -- person|union|parent_child|memory|legacy|event
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,  -- create|update|delete
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  summary     TEXT,
  user_id     TEXT REFERENCES user(id) ON DELETE SET NULL,
  user_name   TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revision_entity ON revision(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_revision_created ON revision(created_at);
