# L'Dor VaDor — לדור ודור

*Our family. Our stories. Our legacy.*

A private family-tree and family-history application: one connected family graph
you can explore endlessly, and a place to keep the lives, stories and values
behind the names.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The database seeds itself on first open with a demonstration family of 44 people
across five generations, so nothing is ever an empty screen.

```
demo@ldorvador.family
family
```

Other commands:

```bash
npm test             # 35 unit tests: calendar, relationships, canvas geometry
npm run seed         # rebuild the demonstration family from scratch
npm run build        # production build
```

Data lives in `data/family.db` (SQLite). Delete it to start over.

---

## What is built

**The five screens**

1. **Welcome** — identity, mission, sign in / join.
2. **My Branch** — the family canvas: pan, zoom, focus, expand, search, relationship finder.
3. **Person Quick View** — a panel over the canvas; the tree stays visible behind it.
4. **Full Profile** — overview, legacy, facts, family, timeline, memories, history.
5. **Add Relative** — starts from an existing person, checks for duplicates, four fields.

**The family graph**

- One graph. No separate trees for mother's side, father's side, or a spouse's family — those are *views*.
- Marriage is its own entity, so remarriage, widowhood, divorce, children from
  different marriages, and a spouse who arrives with children are all ordinary cases.
- Children attach to the union they belong to, which is what makes
  `Spouse A — ● — David — ● — Spouse B` legible.
- Adoptive and step relationships are edge kinds, drawn as dashed descent lines.
- Person and User are separate concepts: 44 people, one account.

**Relationships are calculated, never typed**

`src/lib/relationships.ts` derives every extended relationship from parent/child
and union edges: grandparents, great-aunts, first cousins twice removed,
half-siblings, in-laws, step-relations. It finds multiple valid paths between two
people and reports the closest first. Wording lives in one function
(`describe`) so the terminology can be localised later without touching the maths.

Verified to 11th cousins across a 12-generation synthetic graph in under 100ms.

**Progressive expansion**

The canvas never loads the whole family. `neighborhood()` returns the slice
around the current focus plus counts of what lies just beyond, which is what
turns an edge into `Parents ↑` and `+ 3 more`. Sibling groups collapse after six.

**Dates**

Gregorian and Hebrew, both computed from the same stored value. The Hebrew
calendar converter (`src/lib/hebrew.ts`) implements all four postponement rules
and is tested against real anchors — Rosh Hashanah 5786, Pesach 5784, 5 Iyar 5708.
Dates may be exact, `c. 1928`, `1928 or 1929`, year-only, or unknown, and free
text is preserved verbatim when it cannot be parsed. Events after nightfall roll
to the next Hebrew day.

**Nothing is destroyed.** Every edit records who, when, what field, and the
previous value. Administrators can read the history from the profile.

---

## Shape of the code

```
src/lib/
  hebrew.ts          Hebrew calendar conversion and gematria
  dates.ts           flexible dates: approximate, partial, unknown
  schema.sql         the graph: person, union, parent_child, memory, legacy, revision
  repo.ts            reads, writes, neighbourhood slicing, duplicate detection
  relationships.ts   relationship calculation and path finding (no database, no React)
  graph-db.ts        graph access backed by SQLite, memoised per request
  person-detail.ts   assembles a person for the panel and the profile
src/components/canvas/
  layout.ts          pure geometry: graph slice in, coordinates out
  FamilyCanvas.tsx   pan, zoom, focus mode, animation, expansion
tests/               calendar, relationship, and layout geometry tests
scripts/flows.mts    end-to-end browser check of the paths that write data
```

`layout.ts` and `relationships.ts` are deliberately free of React and of the
database, because a family tree that silently overlaps two cards — or quietly
gets a cousin wrong — is one nobody trusts. Both are tested directly.

---

## Accessibility

Not an afterthought, per the brief: 15px minimum type, generous targets, visible
focus rings, full keyboard navigation of the canvas (arrows, `+`/`−`, `0` to
re-centre, `/` to search, `m` for me), labels tied to their fields, relationships
described in words for screen readers, deceased indicated by tone *and* text
rather than colour alone, and `prefers-reduced-motion` respected throughout.

---

## Not yet built

Stated plainly rather than implied:

- **Photographs.** The design deliberately works without them; upload is not built.
- **Places** are stored and normalised but there is no map or "who else lived here".
- **Search** covers names only so far — not yet years, places, or story text.
- **Expansion preferences** persist for the session, not to the account.
- **Per-field privacy.** V1 is private-to-the-family; the schema is arranged so
  finer controls can be added without redesigning it.
- **Sources and evidence.** Uncertainty is supported (`c. 1928`); academic
  citation is intentionally out of scope for V1.

---

## The rule the whole thing follows

Keep the underlying family graph comprehensive. Keep the visible experience
simple. When a decision is ambiguous, choose whatever makes the family easier to
understand.
