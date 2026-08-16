import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretGedcom, parseGedcom, parseGedcomDate } from '../src/lib/gedcom.ts';
import { applyImport, previewImport } from '../src/lib/import-gedcom.ts';
import { getPerson, personCount, searchPersons, unionsOfPerson, parentIdsOf, childIdsOf, eventsFor } from '../src/lib/repo.ts';
import { formatGregorian } from '../src/lib/dates.ts';
import { relationship, describe as describeRel } from '../src/lib/relationships.ts';
import { dbGraph } from '../src/lib/graph-db.ts';

const actor = { id: null, name: 'Importer' };

/**
 * A small file with the things real exports are full of: a remarriage, an
 * adopted child, a maiden name, a nickname, a Hebrew name, vague dates, a
 * note split across continuation lines, and a tag we do not support.
 */
const SAMPLE = `0 HEAD
1 SOUR MyHeritage
2 NAME MyHeritage Family Tree Builder
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Mordechai /Stern/
2 NICK Motty
1 NAME מרדכי בן יהודה
1 SEX M
1 BIRT
2 DATE 12 APR 1921
2 PLAC Lviv, Ukraine
1 DEAT
2 DATE ABT 1998
1 OCCU Watchmaker
2 DATE FROM 1946 TO 1981
2 PLAC Haifa, Israel
1 NOTE He mended watches for fifty years and never once
2 CONT threw away a working part.
1 FAMS @F1@
1 FAMS @F2@
1 _MILITARY Served 1943-1945
0 @I2@ INDI
1 NAME Feiga /Stern/
2 TYPE married
1 NAME Feiga /Rosenblum/
2 TYPE birth
1 SEX F
1 BIRT
2 DATE BET 1924 AND 1926
1 DEAT
2 DATE 3 SEP 1974
1 FAMS @F1@
0 @I3@ INDI
1 NAME Shulamit /Stern/
1 SEX F
1 BIRT
2 DATE @#DHEBREW@ 21 AAV 5745
1 FAMS @F2@
0 @I4@ INDI
1 NAME Ari /Stern/
1 SEX M
1 BIRT
2 DATE 1952
1 FAMC @F1@
0 @I5@ INDI
1 NAME Tovah /Stern/
1 SEX F
1 BIRT
2 DATE BEF 1990
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I4@
1 MARR
2 DATE 8 JUN 1949
2 PLAC Haifa, Israel
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I3@
1 CHIL @I5@
2 PEDI adopted
1 MARR
2 DATE 1979
0 TRLR
`;

test('the line format is read, including continuations', () => {
  const records = parseGedcom(SAMPLE);
  const people = records.filter((record) => record.tag === 'INDI');
  assert.equal(people.length, 5);

  const note = people[0].children.find((node) => node.tag === 'NOTE')!;
  assert.match(note.value, /never once\nthrew away a working part\./);
});

test('GEDCOM dates keep the vagueness they were recorded with', () => {
  assert.equal(formatGregorian(parseGedcomDate('12 APR 1921')), 'April 12, 1921');
  assert.equal(formatGregorian(parseGedcomDate('APR 1921')), 'April 1921');
  assert.equal(formatGregorian(parseGedcomDate('1921')), '1921');
  assert.equal(formatGregorian(parseGedcomDate('ABT 1998')), 'c. 1998');
  assert.equal(formatGregorian(parseGedcomDate('BEF 1990')), 'before 1990');
  assert.equal(formatGregorian(parseGedcomDate('AFT 1990')), 'after 1990');
  assert.equal(formatGregorian(parseGedcomDate('BET 1924 AND 1926')), '1924 or 1926');
  assert.equal(parseGedcomDate('').precision, 'unknown');
});

test('a Hebrew-calendar date is converted, and the original kept', () => {
  // 21 Av 5745 fell on 8 August 1985.
  const date = parseGedcomDate('@#DHEBREW@ 21 AAV 5745');
  assert.equal(date.value, '1985-08-08');
  assert.equal(date.precision, 'exact');
  assert.match(date.text ?? '', /HEBREW/);
});

test('names, nicknames, maiden names and Hebrew names are all understood', () => {
  const reading = interpretGedcom(SAMPLE);
  const mordechai = reading.people.find((person) => person.preferredName.startsWith('Mordechai'))!;

  assert.equal(mordechai.preferredName, 'Mordechai Stern');
  assert.equal(mordechai.givenName, 'Mordechai');
  assert.equal(mordechai.familyName, 'Stern');
  assert.deepEqual(mordechai.nicknames, ['Motty']);
  assert.equal(mordechai.hebrewName, 'מרדכי בן יהודה');
  assert.equal(mordechai.gender, 'male');
  assert.equal(mordechai.living, false, 'a death record means they have died');

  const feiga = reading.people.find((person) => person.preferredName.startsWith('Feiga'))!;
  assert.equal(feiga.birthName, 'Feiga Rosenblum', 'a maiden name is kept as the name at birth');
});

test('unsupported details are reported rather than silently dropped', () => {
  const reading = interpretGedcom(SAMPLE);
  assert.ok(
    reading.warnings.some((warning) => warning.includes('_MILITARY')),
    'the reader should say what it could not bring across',
  );
  assert.equal(reading.source, 'MyHeritage Family Tree Builder');
});

test('a preview reports what would happen and changes nothing', () => {
  const before = personCount();
  const preview = previewImport(SAMPLE);

  assert.equal(preview.counts.people, 5);
  assert.equal(preview.counts.families, 2);
  assert.ok(preview.counts.events >= 1);
  assert.equal(preview.sample.length, 5);
  assert.equal(personCount(), before, 'a preview must not touch the archive');
});

test('importing builds the family, including the remarriage and the adoption', async () => {
  const before = personCount();
  const outcome = await applyImport(SAMPLE, actor);

  assert.equal(outcome.added, 5);
  assert.equal(outcome.unions, 2, 'both marriages come across');
  assert.ok(outcome.backup, 'a backup is taken before anything is written');
  assert.equal(personCount(), before + 5);

  const mordechai = searchPersons('Mordechai Stern')[0].person;
  const unions = unionsOfPerson(mordechai.id);
  assert.equal(unions.length, 2, 'he is recorded in two marriages');

  // Children hang from the marriage they belong to, not from the man alone.
  const ari = searchPersons('Ari Stern')[0].person;
  const tovah = searchPersons('Tovah Stern')[0].person;
  const feiga = searchPersons('Feiga Stern')[0].person;
  const shulamit = searchPersons('Shulamit Stern')[0].person;

  assert.deepEqual(parentIdsOf(ari.id).sort(), [mordechai.id, feiga.id].sort());
  assert.deepEqual(parentIdsOf(tovah.id).sort(), [mordechai.id, shulamit.id].sort());

  // And the relationship engine reads them correctly from the imported graph.
  const graph = dbGraph();
  assert.equal(describeRel(relationship(graph, ari.id, tovah.id), 'female'), 'half-sister');
  assert.equal(describeRel(relationship(graph, ari.id, shulamit.id), 'female'), 'stepmother');
  assert.equal(describeRel(relationship(graph, tovah.id, mordechai.id), 'male'), 'father');

  // The occupation came across as a life event.
  const events = eventsFor(mordechai.id);
  assert.ok(events.some((event) => event.title === 'Watchmaker'));

  // A Hebrew-dated birth landed on the right civil day.
  assert.equal(formatGregorian(getPerson(shulamit.id)!.birth), 'August 8, 1985');

  // Vagueness survived the round trip.
  assert.equal(formatGregorian(getPerson(mordechai.id)!.death), 'c. 1998');
  assert.equal(childIdsOf(mordechai.id).length, 2);
});

test('an import can be joined to people already in the archive', async () => {
  // Import the same file again, telling it that Mordechai is already here.
  const existing = searchPersons('Mordechai Stern')[0].person;
  const before = personCount();

  const outcome = await applyImport(SAMPLE, actor, { linkTo: { I1: existing.id } });

  assert.equal(outcome.linked, 1);
  assert.equal(outcome.added, 4, 'the person we already had is not duplicated');
  assert.equal(personCount(), before + 4);

  // The second import's marriages attached to the existing person.
  assert.ok(unionsOfPerson(existing.id).length >= 4);
});

test('a preview notices people who are probably already here', () => {
  const preview = previewImport(SAMPLE);
  assert.ok(
    preview.matches.some((match) => match.incomingName === 'Mordechai Stern'),
    'having imported him once, a second run should say so',
  );
});

test('a file that is not GEDCOM is refused before anything is written', async () => {
  const before = personCount();
  await assert.rejects(() => applyImport('this is not a family tree', actor), /no people/i);
  assert.equal(personCount(), before);
});

test('the family can be exported and read straight back', async () => {
  const { exportGedcom } = await import('../src/lib/export-gedcom.ts');

  const text = exportGedcom({ familyName: 'Kish' });
  assert.match(text, /^0 HEAD/);
  assert.match(text, /0 TRLR\n$/);

  const reading = interpretGedcom(text);
  assert.equal(reading.people.length, personCount(), 'everyone comes out');

  // Spot-check that the awkward parts survive the round trip.
  const david = reading.people.find((person) => person.preferredName === 'David Kish')!;
  assert.ok(david, 'the remarried man is in the export');
  assert.equal(formatGregorian(david.birth), 'May 14, 1948');

  const davidFamilies = reading.families.filter(
    (family) => family.husband === david.xref || family.wife === david.xref,
  );
  assert.equal(davidFamilies.length, 2, 'both his marriages are exported');

  const sarah = reading.people.find((person) => person.preferredName === 'Sarah Kish')!;
  assert.equal(sarah.birthName, 'Sarah Goldman', 'the maiden name survives');
  assert.equal(sarah.living, false);

  const avraham = reading.people.find((person) => person.preferredName === 'Avraham Kish')!;
  assert.ok(avraham.hebrewName, 'the Hebrew name survives');
  assert.match(avraham.biography ?? '', /bookbinding/, 'the biography survives');
  assert.match(avraham.biography ?? '', /Legacy/, 'and so does the legacy, as a note');

  // An adopted child is still marked as adopted on the way out.
  const eli = reading.people.find((person) => person.preferredName === 'Eli Kish')!;
  const eliFamily = reading.families.find((family) =>
    family.children.some((c) => c.xref === eli.xref),
  )!;
  assert.equal(eliFamily.children.find((c) => c.xref === eli.xref)!.adopted, true);
});
