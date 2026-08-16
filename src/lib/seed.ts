/**
 * A demonstration family, so the app is never an empty database on first open.
 *
 * It is deliberately awkward in the ways real families are: a remarriage after
 * widowhood, half-siblings, a stepson, an adopted child, a nine-child sibling
 * group, cousins several times removed, and dates that are only half known.
 */

import { db } from './db';
import { parseDateInput, UNKNOWN_DATE } from './dates';
import {
  createEvent,
  createLegacy,
  createMemory,
  createPerson,
  createUnion,
  linkParentChild,
  personCount,
  type Actor,
} from './repo';
import { registerUser, linkUserToPerson } from './auth';

const SYSTEM: Actor = { id: null, name: 'Family archive' };

type Seed = {
  key: string;
  name: string;
  hebrew?: string;
  gender: 'male' | 'female';
  birth?: string;
  death?: string;
  birthPlace?: string;
  deathPlace?: string;
  birthName?: string;
  bio?: string;
  nicknames?: string[];
};

const PEOPLE: Seed[] = [
  // ── Generation 1 — Kraków ─────────────────────────────────────────────
  { key: 'yaakov', name: 'Yaakov Kish', hebrew: 'יעקב בן שלמה', gender: 'male', birth: '1888', death: '1943',
    birthPlace: 'Kraków, Poland', deathPlace: 'Kraków, Poland',
    bio: 'A bookbinder on Miodowa Street who kept the ledgers for half the neighbourhood. He taught his children that a promise written down is a promise kept.' },
  { key: 'rivka', name: 'Rivka Kish', hebrew: 'רבקה בת מנחם', gender: 'female', birth: 'c. 1891', death: '1943',
    birthName: 'Rivka Lieberman', birthPlace: 'Kraków, Poland',
    bio: 'Remembered for a voice that carried across the courtyard and for feeding anyone who appeared at her door on a Friday afternoon.' },

  // ── Generation 2 ──────────────────────────────────────────────────────
  { key: 'avraham', name: 'Avraham Kish', hebrew: 'אברהם בן יעקב', gender: 'male', birth: '1915-03-11', death: '1998-11-02',
    birthPlace: 'Kraków, Poland', deathPlace: 'Brooklyn, New York',
    bio: 'Arrived in New York in 1946 with a single suitcase and his father\'s bookbinding tools. Opened a small print shop on Flatbush Avenue that stayed in the family for forty years.',
    nicknames: ['Abe'] },
  { key: 'chana', name: 'Chana Kish', hebrew: 'חנה בת דוד', gender: 'female', birth: '1922-08-04', death: '2005-01-19',
    birthName: 'Chana Bernstein', birthPlace: 'Łódź, Poland', deathPlace: 'Brooklyn, New York',
    bio: 'Kept the print shop\'s books and the family\'s stories. She wrote down every name she could remember from Kraków so that they would not be lost.' },
  { key: 'miriam', name: 'Miriam Feldman', hebrew: 'מרים בת יעקב', gender: 'female', birth: '1918', death: '2001',
    birthName: 'Miriam Kish', birthPlace: 'Kraków, Poland' },
  { key: 'nathan', name: 'Nathan Feldman', gender: 'male', birth: '1916', death: '1989', birthPlace: 'Warsaw, Poland' },
  { key: 'shmuel', name: 'Shmuel Kish', hebrew: 'שמואל בן יעקב', gender: 'male', birth: '1920', death: '1944',
    birthPlace: 'Kraków, Poland',
    bio: 'The youngest of Yaakov and Rivka\'s children. No photograph of him is known to survive.' },

  // ── Generation 3 ──────────────────────────────────────────────────────
  { key: 'david', name: 'David Kish', hebrew: 'דוד בן אברהם', gender: 'male', birth: '1948-05-14',
    birthPlace: 'Brooklyn, New York',
    bio: 'Took over the print shop in 1979 and ran it until it closed. Widowed in 1994 and remarried in 1998.' },
  { key: 'sarahg', name: 'Sarah Kish', gender: 'female', birth: '1950-02-20', death: '1994-06-30',
    birthName: 'Sarah Goldman', birthPlace: 'Brooklyn, New York', deathPlace: 'Brooklyn, New York',
    bio: 'A school librarian for twenty-two years. Generations of children in the neighbourhood learned to read at her table.' },
  { key: 'naomi', name: 'Naomi Kish', gender: 'female', birth: '1955-09-08', birthName: 'Naomi Roth',
    birthPlace: 'Chicago, Illinois' },
  { key: 'ruth', name: 'Ruth Shapiro', gender: 'female', birth: '1950-11-30', birthName: 'Ruth Kish',
    birthPlace: 'Brooklyn, New York' },
  { key: 'aaron', name: 'Aaron Shapiro', gender: 'male', birth: '1947', birthPlace: 'Brooklyn, New York' },
  { key: 'yosef', name: 'Yosef Kish', hebrew: 'יוסף בן אברהם', gender: 'male', birth: '1953-04-02', death: '2019-03-15',
    birthPlace: 'Brooklyn, New York', deathPlace: 'Jerusalem',
    bio: 'Moved to Jerusalem in 1978 and taught mathematics there for thirty-five years.' },
  { key: 'beth', name: 'Beth Kish', gender: 'female', birth: '1957', birthName: 'Beth Ackerman' },
  { key: 'esther', name: 'Esther Weiss', gender: 'female', birth: '1956-07-22', birthName: 'Esther Kish',
    birthPlace: 'Brooklyn, New York' },
  { key: 'mark', name: 'Mark Weiss', gender: 'male', birth: '1954' },
  { key: 'leah', name: 'Leah Feldman', gender: 'female', birth: '1947', birthPlace: 'Brooklyn, New York' },
  { key: 'sol', name: 'Sol Feldman', gender: 'male', birth: '1949', death: '2016' },

  // ── Generation 4 ──────────────────────────────────────────────────────
  { key: 'michael', name: 'Michael Kish', hebrew: 'מיכאל בן דוד', gender: 'male', birth: '1973-06-18',
    birthPlace: 'Brooklyn, New York' },
  { key: 'lisa', name: 'Lisa Kish', gender: 'female', birth: '1975', birthName: 'Lisa Moreno' },
  { key: 'rachel', name: 'Rachel Bergman', gender: 'female', birth: '1976-12-01', birthName: 'Rachel Kish',
    birthPlace: 'Brooklyn, New York' },
  { key: 'tom', name: 'Tom Bergman', gender: 'male', birth: '1974' },
  { key: 'daniel', name: 'Daniel Kish', gender: 'male', birth: '1979-08-30', birthPlace: 'Brooklyn, New York' },
  { key: 'ilana', name: 'Ilana Kish', gender: 'female', birth: '1981', birthName: 'Ilana Katz' },
  { key: 'aviva', name: 'Aviva Kish', hebrew: 'אביבה בת דוד', gender: 'female', birth: '2000-03-12',
    birthPlace: 'Brooklyn, New York' },
  { key: 'jonathan', name: 'Jonathan Roth', gender: 'male', birth: '1985', birthPlace: 'Chicago, Illinois' },
  { key: 'adam', name: 'Adam Kish', gender: 'male', birth: '1985', birthPlace: 'Jerusalem' },
  { key: 'talia', name: 'Talia Kish', gender: 'female', birth: '1988', birthPlace: 'Jerusalem' },
  { key: 'sarahw', name: 'Sarah Weiss', gender: 'female', birth: '1982-10-05', birthPlace: 'Teaneck, New Jersey' },
  { key: 'ben', name: 'Ben Weiss', gender: 'male', birth: '1985' },

  // ── Generation 5 ──────────────────────────────────────────────────────
  { key: 'ethan', name: 'Ethan Kish', gender: 'male', birth: '2004-01-22' },
  { key: 'maya', name: 'Maya Kish', gender: 'female', birth: '2007-05-16' },
  { key: 'noa', name: 'Noa Bergman', gender: 'female', birth: '2008-09-03' },
  { key: 'eli', name: 'Eli Kish', gender: 'male', birth: '2012-04-11' },
  { key: 'jonah', name: 'Jonah Stern', gender: 'male', birth: '2015-02-27' },
];

// Ruth and Aaron's nine children — the group that must never render all at once.
const SHAPIRO_CHILDREN: Seed[] = [
  ['tzipporah', 'Tzipporah Shapiro', 'female', '1972'],
  ['yitzchak', 'Yitzchak Shapiro', 'male', '1974'],
  ['baruch', 'Baruch Shapiro', 'male', '1976'],
  ['devorah', 'Devorah Shapiro', 'female', '1978'],
  ['menachem', 'Menachem Shapiro', 'male', '1980'],
  ['shoshana', 'Shoshana Shapiro', 'female', '1982'],
  ['eliyahu', 'Eliyahu Shapiro', 'male', '1984'],
  ['malka', 'Malka Shapiro', 'female', '1987'],
  ['reuven', 'Reuven Shapiro', 'male', '1990'],
].map(([key, name, gender, birth]) => ({
  key: key as string,
  name: name as string,
  gender: gender as 'male' | 'female',
  birth: birth as string,
  birthPlace: 'Brooklyn, New York',
}));

export function seedFamily(): void {
  const ids = new Map<string, string>();

  const add = (seed: Seed) => {
    const personId = createPerson(
      {
        preferredName: seed.name,
        givenName: seed.name.split(' ')[0],
        familyName: seed.name.split(' ').slice(1).join(' ') || null,
        birthName: seed.birthName ?? null,
        hebrewName: seed.hebrew ?? null,
        gender: seed.gender,
        living: !seed.death,
        birth: seed.birth ? parseDateInput(seed.birth) : UNKNOWN_DATE,
        death: seed.death ? parseDateInput(seed.death) : UNKNOWN_DATE,
        birthPlace: seed.birthPlace ?? null,
        deathPlace: seed.deathPlace ?? null,
        biography: seed.bio ?? null,
        nicknames: seed.nicknames ?? [],
      },
      SYSTEM,
    );
    ids.set(seed.key, personId);
    return personId;
  };

  [...PEOPLE, ...SHAPIRO_CHILDREN].forEach(add);
  const ref = (key: string) => ids.get(key)!;

  const marry = (
    a: string,
    b: string,
    children: string[],
    options: { status?: string; start?: string; end?: string; place?: string; note?: string } = {},
  ) => {
    const unionId = createUnion(
      [ref(a), ref(b)],
      {
        status: options.status ?? 'married',
        start: options.start ? parseDateInput(options.start) : UNKNOWN_DATE,
        end: options.end ? parseDateInput(options.end) : UNKNOWN_DATE,
        place: options.place ?? null,
        note: options.note ?? null,
      },
      SYSTEM,
    );
    for (const childKey of children) {
      linkParentChild(ref(a), ref(childKey), { unionId }, SYSTEM);
      linkParentChild(ref(b), ref(childKey), { unionId }, SYSTEM);
    }
    return unionId;
  };

  marry('yaakov', 'rivka', ['avraham', 'miriam', 'shmuel'], { start: '1913', place: 'Kraków, Poland' });
  marry('avraham', 'chana', ['david', 'ruth', 'yosef', 'esther'], { start: '1946-09-01', place: 'Brooklyn, New York' });
  marry('miriam', 'nathan', ['leah', 'sol'], { start: '1945' });

  // David's two marriages. Neither is privileged in the data.
  marry('david', 'sarahg', ['michael', 'rachel', 'daniel'], {
    start: '1971-06-20',
    end: '1994-06-30',
    status: 'widowed',
    place: 'Brooklyn, New York',
  });
  marry('david', 'naomi', ['aviva'], { start: '1998-05-24', place: 'Brooklyn, New York' });

  // Naomi's son from an earlier marriage — David's stepson, Aviva's half-brother.
  const naomiFirst = createUnion(
    [ref('naomi')],
    { status: 'divorced', start: parseDateInput('1983'), end: parseDateInput('1991') },
    SYSTEM,
  );
  linkParentChild(ref('naomi'), ref('jonathan'), { unionId: naomiFirst }, SYSTEM);

  marry('ruth', 'aaron', SHAPIRO_CHILDREN.map((c) => c.key), { start: '1971' });
  marry('yosef', 'beth', ['adam', 'talia'], { start: '1983', place: 'Jerusalem' });
  marry('esther', 'mark', ['sarahw', 'ben'], { start: '1980' });

  marry('michael', 'lisa', ['ethan', 'maya'], { start: '2001-08-19' });
  marry('rachel', 'tom', ['noa'], { start: '2005' });

  // Daniel and Ilana's son joined the family by adoption in 2013.
  const danielUnion = marry('daniel', 'ilana', [], { start: '2009' });
  linkParentChild(ref('daniel'), ref('eli'), { unionId: danielUnion, kind: 'adoptive' }, SYSTEM);
  linkParentChild(ref('ilana'), ref('eli'), { unionId: danielUnion, kind: 'adoptive' }, SYSTEM);

  linkParentChild(ref('sarahw'), ref('jonah'), {}, SYSTEM);

  /* ── Life events ─────────────────────────────────────────────────── */

  const event = (
    kind: string,
    title: string,
    people: string[],
    date?: string,
    place?: string,
    description?: string,
  ) =>
    createEvent(
      {
        kind,
        title,
        description,
        date: date ? parseDateInput(date) : UNKNOWN_DATE,
        place: place ?? null,
        personIds: people.map(ref),
      },
      SYSTEM,
    );

  event('immigration', 'Arrived in New York aboard the SS Marine Flasher', ['avraham'], '1946-05-20', 'New York, New York',
    'He carried his father\'s bookbinding tools, which are still in the family.');
  event('occupation', 'Opened Kish Printing on Flatbush Avenue', ['avraham', 'chana'], '1951', 'Brooklyn, New York');
  event('residence', 'The apartment on Ocean Parkway', ['avraham', 'chana'], '1953', 'Brooklyn, New York',
    'Two bedrooms, and somehow room for everyone on a Friday night.');
  event('accomplishment', 'Named teacher of the year', ['sarahg'], '1988', 'Brooklyn, New York');
  event('immigration', 'Made aliyah', ['yosef'], '1978', 'Jerusalem');
  event('education', 'Doctorate in mathematics, Hebrew University', ['yosef'], '1982', 'Jerusalem');
  event('family', 'Kish family reunion — seventy-one people', ['david', 'ruth', 'esther'], '2018-07-04', 'Brooklyn, New York');

  /* ── Memories ────────────────────────────────────────────────────── */

  createMemory(
    {
      title: 'The apartment on Ocean Parkway',
      body:
        'Every Friday the table grew another leaf. Grandma Chana cooked for whoever might come, which was never the number who said they would. ' +
        'Grandpa Avraham sat at the end with the radio on low until the candles were lit, and then the radio went off and stayed off.',
      dateText: 'The 1970s',
      provenance: 'As told by David to his children',
      personIds: [ref('avraham'), ref('chana'), ref('david')],
    },
    { id: null, name: 'David Kish' },
  );

  createMemory(
    {
      title: 'She knew every child by name',
      body:
        'Mom could walk into the school library and greet forty children by name, and she knew which book each of them had given up on. ' +
        'She used to say a child who thinks they hate reading has only met the wrong book so far.',
      dateText: 'c. 1985',
      personIds: [ref('sarahg'), ref('michael'), ref('rachel')],
    },
    { id: null, name: 'Rachel Bergman' },
  );

  createMemory(
    {
      title: 'The tools that crossed the ocean',
      body:
        'The bookbinding tools came from Kraków in a canvas roll. Grandpa Avraham used them until his hands could not manage it, ' +
        'and then he showed my father how to hold them, and my father showed me.',
      dateText: '1946 onward',
      provenance: 'As told to Michael by his father',
      personIds: [ref('yaakov'), ref('avraham'), ref('david'), ref('michael')],
    },
    { id: null, name: 'Michael Kish' },
  );

  /* ── Legacy ──────────────────────────────────────────────────────── */

  const legacy = (personKey: string, kind: string, title: string, body: string, contributor: string) =>
    createLegacy({ personId: ref(personKey), kind, title, body }, { id: null, name: contributor });

  legacy('avraham', 'saying', 'What he always said',
    '"A promise written down is a promise kept." He said it about business and he meant it about everything else.', 'David Kish');
  legacy('avraham', 'value', 'Work you can put your name on',
    'He would not let a job leave the shop with a crooked spine on it, even when the customer would never have noticed.', 'David Kish');
  legacy('chana', 'contribution', 'She wrote the names down',
    'After the war she sat with a notebook and wrote every name she could remember from Kraków — neighbours, cousins, the family of the man who sold coal. ' +
    'Most of this family tree above 1946 exists because of that notebook.', 'Chana\'s grandchildren');
  legacy('chana', 'lesson', 'Set another place',
    'There was always one more plate than there were people. She said you never want to be the house where someone had to ask.', 'Esther Weiss');
  legacy('sarahg', 'known_for', 'Patience',
    'She never once made a child feel slow. She simply waited, and the child got there.', 'Michael Kish');
  legacy('yosef', 'teaching', 'On being stuck',
    'He told his students that being stuck is not a failure of intelligence, it is the ordinary condition of anyone doing real work.', 'Talia Kish');

  /* ── The demonstration account ───────────────────────────────────── */

  const userId = registerUser({
    email: 'demo@ldorvador.family',
    password: 'family',
    displayName: 'Michael Kish',
    role: 'admin',
  });
  linkUserToPerson(userId, ref('michael'));
}

/**
 * Seed the demonstration family on first run — but only where it belongs.
 *
 * A real family's deployment must start empty: nobody wants to open their
 * own archive and find the Kish family in it. Set LDOR_SEED_DEMO=true to
 * bring the demonstration data into a production instance deliberately.
 */
export function demoSeedingAllowed(): boolean {
  const explicit = process.env.LDOR_SEED_DEMO;
  if (explicit !== undefined) return explicit === 'true';
  return process.env.NODE_ENV !== 'production';
}

export function ensureSeeded(): void {
  if (!demoSeedingAllowed()) return;
  if (personCount() > 0) return;
  db().transaction(() => seedFamily())();
}

/** True when nobody has an account yet, and the first one still has to be made. */
export function needsFirstAccount(): boolean {
  const row = db().prepare('SELECT COUNT(*) AS n FROM user').get() as { n: number };
  return row.n === 0;
}
