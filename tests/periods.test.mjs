// Tests des périodes et délais : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictation } from '../js/parser.js';
import { extractWhen } from '../js/when.js';

// Lundi 23 novembre 2026
const NOW = new Date(2026, 10, 23, 10, 0);
const p = (s) => parseDictation(s, NOW);
const w = (s) => {
  const r = extractWhen(s, NOW);
  return [r.start, r.end];
};

test("l'exemple dicté : une seule tâche étalée sur jeudi et vendredi", () => {
  const r = p(
    'Envoyer exemplaire guzo de Xavier à envoyer exemplaire Guzzo de Xavier à Aurélie. À faire  entre le jeudi 26 novembre et le vendredi 27 novembre.'
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Envoyer exemplaire Guzzo');
  assert.deepEqual([r[0].start, r[0].end], ['2026-11-26', '2026-11-27']);
  assert.match(r[0].notes, /Aurélie\. À faire entre le jeudi 26 novembre et le vendredi 27 novembre\./);
  assert.doesNotMatch(r[0].notes, /guzo de Xavier à envoyer/);
});

test('périodes : entre… et, du… au, de… à', () => {
  assert.deepEqual(w('entre le jeudi 26 novembre et le vendredi 27 novembre'), ['2026-11-26', '2026-11-27']);
  assert.deepEqual(w('entre jeudi et vendredi'), ['2026-11-26', '2026-11-27']);
  assert.deepEqual(w('du 26 au 28 novembre'), ['2026-11-26', '2026-11-28']);
  assert.deepEqual(w('du 30 novembre au 2 décembre'), ['2026-11-30', '2026-12-02']);
  assert.deepEqual(w('de lundi à mercredi'), ['2026-11-30', '2026-12-02']);
  assert.deepEqual(w('du lundi 30 au mercredi 2 décembre'), ['2026-11-30', '2026-12-02']);
  assert.deepEqual(w("à partir de demain jusqu'à vendredi"), ['2026-11-24', '2026-11-27']);
  assert.deepEqual(w('entre le 3 et le 5'), ['2026-12-03', '2026-12-05']);
  assert.deepEqual(w('du 28/11 au 01/12'), ['2026-11-28', '2026-12-01']);
});

test('échéances : avant, d’ici, au plus tard (et « pour » = le jour même)', () => {
  assert.deepEqual(w('pour vendredi'), ['2026-11-27', '2026-11-27']); // rapport #3 : « pour » = ce jour-là
  assert.deepEqual(w('avant le 4 décembre'), ['2026-11-23', '2026-12-04']);
  assert.deepEqual(w("d'ici la fin du mois"), ['2026-11-23', '2026-11-30']);
  assert.deepEqual(w('au plus tard jeudi'), ['2026-11-23', '2026-11-26']);
  assert.deepEqual(w("jusqu'au 2 décembre"), ['2026-11-23', '2026-12-02']);
});

test('durées : pendant / sur N jours', () => {
  assert.deepEqual(w('à partir de mercredi pendant 3 jours'), ['2026-11-25', '2026-11-27']);
  assert.deepEqual(w('lundi prochain sur deux jours'), ['2026-11-30', '2026-12-01']);
  assert.deepEqual(w('pendant une semaine'), ['2026-11-23', '2026-11-29']);
});

test('périodes nommées', () => {
  assert.deepEqual(w('la semaine prochaine'), ['2026-11-30', '2026-12-04']);
  assert.deepEqual(w('cette semaine'), ['2026-11-23', '2026-11-27']);
  assert.deepEqual(w('ce week-end'), ['2026-11-28', '2026-11-29']);
  assert.deepEqual(w('le mois prochain'), ['2026-12-01', '2026-12-31']);
  assert.deepEqual(w('début de semaine prochaine'), ['2026-11-30', '2026-12-01']);
});

test('dates simples, et pas de fausse date', () => {
  assert.deepEqual(w('jeudi 26 novembre'), ['2026-11-26', '2026-11-26']);
  assert.deepEqual(w('le 3'), ['2026-12-03', '2026-12-03']);
  assert.deepEqual(w('26/11'), ['2026-11-26', '2026-11-26']);
  assert.deepEqual(w('imprimer 3 exemplaires'), [null, null]);
  assert.deepEqual(w('rendez-vous à 14h'), [null, null]);
  assert.deepEqual(w('envoyer la lettre de Marc à Paul'), [null, null]);
});

test('plusieurs tâches, chacune avec sa propre période', () => {
  const r = p(
    "Préparer le salon du livre entre lundi et mercredi prochain. C'est important. " +
      'Ensuite appeler la banque pour vendredi, urgent. ' +
      'Puis repeindre la chambre du 5 au 7 décembre. ' +
      'Et aussi faire les courses demain.'
  );
  assert.deepEqual(
    r.map((t) => [t.title, t.start, t.end, t.urgent, t.important]),
    [
      ['Préparer salon du livre', '2026-11-30', '2026-12-02', false, true],
      ['Appeler la banque', '2026-11-27', '2026-11-27', true, false],
      ['Repeindre la chambre', '2026-12-05', '2026-12-07', false, false],
      ['Faire les courses', '2026-11-24', '2026-11-24', false, false],
    ]
  );
});

test('les précisions dites dans une phrase à part vont à la bonne tâche', () => {
  const r = p('Rédiger le rapport annuel. À rendre avant le 4 décembre. Puis réserver le train. Pour samedi, c’est urgent.');
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].title, r[0].start, r[0].end], ['Rédiger le rapport annuel', '2026-11-23', '2026-12-04']);
  assert.deepEqual([r[1].title, r[1].end, r[1].urgent], ['Réserver le train', '2026-11-28', true]);
});
