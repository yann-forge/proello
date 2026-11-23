// Chaque rapport d'erreur envoyé depuis l'app devient un test (données : tests/reports.json).
// Le test vérifie le nombre de tâches, les dates et l'urgence / importance attendus,
// et le titre seulement quand le rapport signale un problème de titre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDictation } from '../js/parser.js';

const cases = JSON.parse(readFileSync(new URL('./reports.json', import.meta.url), 'utf8'));
const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

for (const c of cases) {
  test(`rapport #${c.issue} : ${c.input.slice(0, 60)}`, () => {
    const got = parseDictation(c.input, new Date(c.now));
    const expected = c.expected.filter((t) => t.title);
    const show = (list) => list.map((t) => `${t.title} [${t.start}→${t.end}${t.urgent ? ' U' : ''}${t.important ? ' I' : ''}]`);
    assert.equal(got.length, expected.length, `nombre de tâches\n  compris : ${show(got).join(' | ')}\n  attendu : ${show(expected).join(' | ')}`);
    expected.forEach((e, i) => {
      const g = got[i];
      const where = `tâche ${i + 1} (« ${e.title} »)`;
      assert.equal(g.start, e.start ?? null, `${where} : début`);
      assert.equal(g.end, e.end ?? null, `${where} : fin`);
      assert.equal(g.urgent, !!e.urgent, `${where} : urgent`);
      assert.equal(g.important, !!e.important, `${where} : important`);
      if (c.problems.includes('titre')) assert.equal(fold(g.title), fold(e.title), `${where} : titre`);
    });
  });
}
