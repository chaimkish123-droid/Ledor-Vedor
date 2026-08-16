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
npm test             # 98 unit tests: calendar, relationships, geometry, GEDCOM, merging, accounts
npm run seed         # rebuild the demonstration family from scratch
npm run backup       # take a verified backup
npm run restore      # list backups; `npm run restore -- <name>` puts one back
npm run build        # production build
```

Data lives in `data/family.db` (SQLite). Delete it to start over.

---

## Deploying it for a real family

Three ways, depending on what you have:

- **[RUNNING-AT-HOME.md](RUNNING-AT-HOME.md)** — free, on a machine you already
  own, in three stages: your own desk today, a temporary address when you want
  to show somebody, a permanent one when the family starts using it.
- **[RUNNING-ON-ORACLE.md](RUNNING-ON-ORACLE.md)** — free indefinitely on a real
  server, always on, nothing depending on a laptop at home. Every command
  written out, including the two firewalls Oracle hides in different places.
- **[DEPLOYING.md](DEPLOYING.md)** — on a paid host, for about five a month,
  where somebody else keeps the machine alive.

Whichever you pick, moving later is copying one file.

In short:

The demonstration family exists only in development. A production instance
starts **empty**, and the first person to arrive creates the founding account at
`/setup` — after which that page is gone for good, and everyone else joins by
invitation.

### As a container

```bash
docker build -t ldor-vador .
docker volume create family-archive
docker run -d --name ldor-vador \
  -p 3000:3000 \
  -v family-archive:/data \
  ldor-vador
```

The image carries no data. Everything — the archive and its backups — lives on
the `/data` volume, so redeploying the application never touches the family's
history. The container runs as an unprivileged user and answers a health check
at `/api/health`.

This runs on anything that takes a container with a persistent disk: Fly.io
(`fly launch`, then `fly volumes create family_archive`), Railway, Render, or a
plain VPS. Put it behind HTTPS — session cookies are marked `secure` in
production and will not survive plain HTTP.

Serverless hosts such as Vercel are the one place this will **not** work as
built: SQLite needs a disk that persists between requests.

### Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `LDOR_DATA_DIR` | `./data` | Where the archive lives. |
| `LDOR_BACKUP_DIR` | `<data>/backups` | Where backups are written. |
| `LDOR_BACKUP_HOURS` | `24` | Hours between automatic backups; `0` turns them off. |
| `LDOR_BACKUP_KEEP` | `14` | How many backups to keep before pruning the oldest. |
| `LDOR_SEED_DEMO` | off in production | Set `true` to load the demonstration family deliberately. |

### Backups

The application backs itself up on a schedule, because a small deployment
usually has nowhere to put a cron job. Each backup is taken through SQLite's
online backup API — never a file copy of a live database — and is then opened
and integrity-checked before the old ones are pruned. An administrator can also
take one on demand before doing anything drastic.

Restoring keeps the archive it replaces, so a restore can never be the step that
loses something:

```bash
npm run restore                 # list what is available
npm run restore -- family-2026-08-16T05-12-48-263-scheduled.db
```

Copy the backup directory somewhere else regularly. A backup that lives on the
same disk as the original is only half a backup.

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

**Search that reaches past names**

A name, a Hebrew name, a maiden name or a nickname finds a person — and so does
a year, a place, a line of their biography, a phrase from a memory, or something
they used to say. Each result explains itself: *born in Kraków, Poland*,
*in a memory — the bookbinding tools came from…*.

**Nothing is destroyed.** Every edit records who, when, what field, and the
previous value. Administrators can read the history from a person's profile and
put any earlier value back — restoring is recorded as a change of its own rather
than erasing the mistake. A date is recorded and restored as one thing, so
putting back `April 2, 1953` returns the exact date rather than just the year.

**People are recorded as female or male**, or left unrecorded — in which case
relationships simply read as *child*, *sibling*, *parent* rather than guessing.

**Photographs — one each, and never required**

A person may have a portrait: a face on their card, in search results, in the
panel and at the top of their profile. There is deliberately no album. This is a
family tree, and the photograph is there so you recognise someone at a glance,
not so the application becomes a place to keep pictures. Adding a new one
replaces the old; removing it returns them to their monogram, which is a
finished design in its own right rather than a placeholder.

The browser resizes an image before it is sent, so a twelve megabyte phone
photograph never reaches the archive. The server checks the bytes really are an
image — a stated content type is a claim, not a fact — and reads the true
dimensions from the file header.

Images are stored **in** the database rather than beside it. Everything else
here is protected by copying one file, and photographs in a loose directory
would fall outside that promise; a family would find the gap at the worst
possible moment. A test asserts a portrait survives backup and restore byte for
byte.

**Bringing an existing tree in, and taking a copy out**

If the family already has a tree in Ancestry, MyHeritage, FamilySearch or Geni,
it comes in as a GEDCOM file rather than being retyped: names, maiden names,
nicknames, Hebrew names, vague dates, places, marriages, adoptions and life
events. Hebrew-calendar dates (`@#DHEBREW@ 3 KSL 5704`) are converted to the
right civil day on the way in.

Import is preview-then-confirm. The preview says what the file contains, which
program wrote it, what could not be brought across, and who looks like someone
already in the archive — tick *same person* and their relationships join the
record we already have instead of creating a second one. Applying takes a
verified backup first and runs in a single transaction: it either finishes
completely or does nothing.

Any family member can download the whole archive as GEDCOM, readable by any
other genealogy program. Memories and legacy entries travel out as notes rather
than being left behind. This history belongs to the family, not to this
application.

**Who a memory is for**

Facts about a family are shared. What somebody *remembers* is not always meant
for every cousin and in-law — a note about a living relative's illness, a rift,
or something still being written. Memories and legacy entries carry one of three
levels:

- **Everyone in the family** — the default, and what an archive like this is for.
- **Close family only** — the subject's parents, children, grandparents,
  grandchildren, siblings and spouse, worked out from the family graph rather
  than from a list anyone has to maintain. This is the thing a general
  note-keeping tool cannot do.
- **Just me for now** — a draft, readable only by whoever wrote it.

Whoever wrote something can change that at any time, or withdraw it entirely.
Nobody else can, including an administrator: privacy an administrator can look
straight through is not privacy. An administrator can *remove* a memory the
family needs removed, which is a different power from reading it.

Two rules hold this up, and both are tested. Filtering happens where the data is
read, so a memory nobody may see never reaches the browser. And **search filters
by the same rule** — search reads the text of memories, which makes it the
likeliest place for a private one to leak.

**When someone is recorded twice**

Several people adding to one archive, and trees arriving from other programs,
eventually put the same human being in twice — with half their life on each
copy, and the relationship engine seeing two people where there is one. An
administrator can find likely duplicates (a shortened name counts: Ruth and
Ruthie, Ari and Arieh, though a shared surname alone never does) and combine
them.

Merging shows both records side by side, asks only about the fields that
actually disagree, and says what will move across. It refuses outright where the
two are recorded as parent and child, or as married to each other — those are
relationships to correct, not copies to fold together. Both names stay
searchable afterwards, so nobody stops being findable by a name they had, and
what the absorbed record held is kept in the history. It is the one action here
that removes a record, so it takes a verified backup first and runs in a single
transaction.

**Getting in, and keeping others out.** The first account is created at `/setup`
on a fresh installation; everyone after that arrives through a single-use
invitation link that expires after two weeks. Sign-in, joining and setup are all
rate limited. Pages are marked `noindex` and cannot be framed.

**And getting back in.** There is no password email — that would mean mail
credentials to keep and another thing to fail exactly when somebody needs it.
An administrator opens *Who has an account*, presses *They cannot sign in*, and
sends the link however they normally reach that relative. It works once, expires
after two days, and signs that account out everywhere when it is used, because a
forgotten password and a taken account look identical from here. Only the hash
of the link is stored, so a copy of the archive carries no live keys. Anyone
signed in can change their own password, which signs out their other devices.

---

## Shape of the code

```
src/lib/
  hebrew.ts          Hebrew calendar conversion and gematria
  photos.ts          portraits, stored in the archive so backups include them
  merge.ts           combining two records of one person, and finding them
  passwords.ts       reset links and password changes, without an email server
  visibility.ts      who may read a memory, worked out from the family graph
  visibility-labels.ts  the wording, safe to load in a browser
  gedcom.ts          reading GEDCOM, including Hebrew-calendar dates
  import-gedcom.ts   preview, then apply, behind a backup and a transaction
  export-gedcom.ts   writing GEDCOM, so leaving is always possible
  backup.ts          verified backups, scheduled and on demand
  rate-limit.ts      keeps password guessing slow without locking out a household
  dates.ts           flexible dates: approximate, partial, unknown
  schema.sql         the graph: person, union, parent_child, memory, legacy, revision
  repo.ts            reads, writes, neighbourhood slicing, duplicate detection
  relationships.ts   relationship calculation and path finding (no database, no React)
  graph-db.ts        graph access backed by SQLite, memoised per request
  person-detail.ts   assembles a person for the panel and the profile
src/components/canvas/
  layout.ts          pure geometry: graph slice in, coordinates out
  FamilyCanvas.tsx   pan, zoom, focus mode, animation, expansion
tests/               calendar, relationships, geometry, history, backups, GEDCOM
scripts/import-flow.mts  browser check of the import screen
scripts/photo-flow.mts   browser check of adding and removing a portrait
scripts/merge-flow.mts   browser check of finding and combining a duplicate
scripts/privacy-flow.mts browser check across two accounts in two browsers
scripts/recovery-flow.mts browser check of a locked-out relative getting back in
scripts/flows.mts    end-to-end browser check of the paths that write data
```

`layout.ts` and `relationships.ts` are deliberately free of React and of the
database, because a family tree that silently overlaps two cards — or quietly
gets a cousin wrong — is one nobody trusts. Both are tested directly.

Tests run against their own freshly seeded database in a temporary directory, so
running them never touches a real family archive.

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

- **Places** are stored and normalised, and are searchable, but there is no map
  or "who else lived here".
- **Per-field privacy on facts.** Dates and relationships are shared with the
  whole family; only memories and legacy entries carry visibility levels.
- **Sources and evidence.** Uncertainty is supported (`c. 1928`); academic
  citation is intentionally out of scope for V1.

---

## The rule the whole thing follows

Keep the underlying family graph comprehensive. Keep the visible experience
simple. When a decision is ambiguous, choose whatever makes the family easier to
understand.
