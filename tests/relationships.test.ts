import test from 'node:test';
import assert from 'node:assert/strict';
import {
  relationship,
  describe as describeRel,
  describeSentence,
  findPaths,
  ancestorMap,
  type GraphAccess,
  type Gender,
} from '../src/lib/relationships.ts';

/**
 * A small but awkward family: two marriages, a half-sibling, four generations.
 *
 *   Avraham ══ Bracha              (gen 1)
 *      ├── Chana ══ Eli            (gen 2)
 *      │      └── Gila ══ Noam     (gen 3)
 *      │             └── Ilan      (gen 4)
 *      └── David ══ Frieda         (gen 2)
 *             ├── Hannah           (gen 3)
 *             │     └── Yael       (gen 4)
 *             └── (David ══ Miriam, second marriage)
 *                   └── Koby       (gen 3, Hannah's half-brother)
 */
const parents: Record<string, string[]> = {
  chana: ['avraham', 'bracha'],
  david: ['avraham', 'bracha'],
  gila: ['chana', 'eli'],
  hannah: ['david', 'frieda'],
  koby: ['david', 'miriam'],
  ilan: ['gila', 'noam'],
  yael: ['hannah', 'shimon'],
};

const spouses: Record<string, string[]> = {
  avraham: ['bracha'],
  bracha: ['avraham'],
  chana: ['eli'],
  eli: ['chana'],
  david: ['frieda', 'miriam'],
  frieda: ['david'],
  miriam: ['david'],
  gila: ['noam'],
  noam: ['gila'],
  hannah: ['shimon'],
  shimon: ['hannah'],
};

const genders: Record<string, Gender> = {
  avraham: 'male', bracha: 'female', chana: 'female', david: 'male',
  eli: 'male', frieda: 'female', miriam: 'female', gila: 'female',
  noam: 'male', hannah: 'female', shimon: 'male', koby: 'male',
  ilan: 'male', yael: 'female',
};

const children: Record<string, string[]> = {};
for (const [child, list] of Object.entries(parents)) {
  for (const parent of list) (children[parent] ??= []).push(child);
}

const graph: GraphAccess = {
  parentsOf: (id) => parents[id] ?? [],
  childrenOf: (id) => children[id] ?? [],
  spousesOf: (id) => spouses[id] ?? [],
  genderOf: (id) => genders[id] ?? null,
  nameOf: (id) => id,
};

function term(from: string, to: string): string {
  return describeRel(relationship(graph, from, to), graph.genderOf(to));
}

test('immediate family', () => {
  assert.equal(term('gila', 'chana'), 'mother');
  assert.equal(term('chana', 'gila'), 'daughter');
  assert.equal(term('chana', 'david'), 'brother');
  assert.equal(term('gila', 'noam'), 'husband');
  assert.equal(term('gila', 'gila'), 'the same person');
});

test('grandparents and great-grandparents', () => {
  assert.equal(term('gila', 'avraham'), 'grandfather');
  assert.equal(term('avraham', 'gila'), 'granddaughter');
  assert.equal(term('ilan', 'avraham'), 'great-grandfather');
  assert.equal(term('avraham', 'ilan'), 'great-grandson');
  assert.equal(term('yael', 'bracha'), 'great-grandmother');
});

test('aunts, uncles, nieces and nephews', () => {
  assert.equal(term('gila', 'david'), 'uncle');
  assert.equal(term('david', 'gila'), 'niece');
  assert.equal(term('ilan', 'david'), 'great-uncle');
  assert.equal(term('david', 'ilan'), 'great-nephew');
});

test('cousins, degrees and removals', () => {
  assert.equal(term('gila', 'hannah'), 'first cousin');
  assert.equal(term('ilan', 'yael'), 'second cousin');
  assert.equal(term('ilan', 'hannah'), 'first cousin once removed');
  assert.equal(term('hannah', 'ilan'), 'first cousin once removed');
});

test('half-siblings from a second marriage', () => {
  assert.equal(term('hannah', 'koby'), 'half-brother');
  assert.equal(term('koby', 'hannah'), 'half-sister');
  // A half-sibling is still a full uncle to the next generation.
  assert.equal(term('yael', 'koby'), 'uncle');
});

test('both marriages are equally real in the data', () => {
  assert.equal(term('david', 'frieda'), 'wife');
  assert.equal(term('david', 'miriam'), 'wife');
  assert.equal(relationship(graph, 'frieda', 'miriam').kind, 'unrelated');
});

test('in-laws', () => {
  assert.equal(term('noam', 'chana'), 'mother-in-law');
  assert.equal(term('chana', 'noam'), 'son-in-law');
  assert.equal(term('noam', 'david'), 'uncle by marriage');
  assert.equal(term('eli', 'david'), 'brother-in-law');
});

test('step relationships', () => {
  assert.equal(term('hannah', 'miriam'), 'stepmother');
  assert.equal(term('miriam', 'hannah'), 'stepdaughter');
});

test('sentences read plainly', () => {
  const rel = relationship(graph, 'ilan', 'yael');
  assert.equal(describeSentence(rel, 'Yael', 'female'), 'Yael is your second cousin.');

  const unrelated = relationship(graph, 'frieda', 'miriam');
  assert.match(describeSentence(unrelated, 'Miriam', 'female'), /No family connection/);
});

test('connection paths trace the real route', () => {
  const paths = findPaths(graph, 'ilan', 'yael');
  assert.ok(paths.length >= 1);

  const ids = paths[0].steps.map((s) => s.personId);
  assert.equal(ids[0], 'ilan');
  assert.equal(ids[ids.length - 1], 'yael');
  // Ilan → Gila → Chana → Avraham → David → Hannah → Yael
  assert.equal(paths[0].length, 6);
});

test('multiple paths are found when the family loops back', () => {
  // Cousins who marry create a second, equally valid connection.
  const loopParents = { ...parents, tovah: ['gila', 'noam'] };
  const loopSpouses = { ...spouses, tovah: ['yael'], yael: ['shimon' in spouses ? 'tovah' : 'tovah'] };
  const loopChildren: Record<string, string[]> = {};
  for (const [child, list] of Object.entries(loopParents)) {
    for (const parent of list) (loopChildren[parent] ??= []).push(child);
  }
  const loopGraph: GraphAccess = {
    parentsOf: (id) => loopParents[id] ?? [],
    childrenOf: (id) => loopChildren[id] ?? [],
    spousesOf: (id) => loopSpouses[id] ?? [],
    genderOf: (id) => genders[id] ?? null,
    nameOf: (id) => id,
  };

  const paths = findPaths(loopGraph, 'ilan', 'yael', 3);
  assert.ok(paths.length >= 2, 'expected more than one connection');
  assert.ok(paths[0].length <= paths[1].length, 'shortest path must come first');
});

test('ancestor traversal terminates on cyclic data', () => {
  const broken: GraphAccess = {
    parentsOf: (id) => (id === 'a' ? ['b'] : id === 'b' ? ['a'] : []),
    childrenOf: () => [],
    spousesOf: () => [],
    genderOf: () => null,
    nameOf: (id) => id,
  };
  const map = ancestorMap(broken, 'a');
  assert.equal(map.get('b'), 1);
  assert.ok(map.size <= 2);
});

test('scales across a deep synthetic family', () => {
  // 12 generations, branching by 2 — a graph far larger than any real family tree view.
  const bigParents: Record<string, string[]> = {};
  const bigChildren: Record<string, string[]> = {};
  for (let gen = 0; gen < 12; gen++) {
    for (let i = 0; i < 2 ** gen; i++) {
      const parent = `g${gen}n${i}`;
      for (const childIndex of [i * 2, i * 2 + 1]) {
        const child = `g${gen + 1}n${childIndex}`;
        bigParents[child] = [parent];
        (bigChildren[parent] ??= []).push(child);
      }
    }
  }
  const bigGraph: GraphAccess = {
    parentsOf: (id) => bigParents[id] ?? [],
    childrenOf: (id) => bigChildren[id] ?? [],
    spousesOf: () => [],
    genderOf: () => null,
    nameOf: (id) => id,
  };

  const started = process.hrtime.bigint();
  const rel = relationship(bigGraph, 'g12n0', 'g12n4095');
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(rel.kind, 'cousin');
  assert.equal(rel.degree, 11);
  assert.equal(rel.removed, 0);
  assert.ok(elapsedMs < 100, `relationship calculation took ${elapsedMs}ms`);
});
