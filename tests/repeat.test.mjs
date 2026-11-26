// Tâches répétées et modèles « pour chaque prestation » : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, occurrences, describeRepeat, eventOffset, missingForEvent, placeRepeat, findRepeat } from '../js/repeat.js';
import { parseDictation } from '../js/parser.js';

const now = new Date(2026, 10, 26, 10, 0); // jeudi 26 novembre 2026

test('occurrences et occurrence suivante', () => {
  const t = { start: '2026-12-01', repeat: { freq: 'week', days: [2, 5], until: '2026-12-15', anchor: '2026-12-01' } };
  assert.deepEqual(occurrences(t, '2026-11-26', '2026-12-31'), ['2026-12-01', '2026-12-04', '2026-12-08', '2026-12-11', '2026-12-15']);
  assert.equal(nextOccurrence(t), '2026-12-04');
  assert.equal(nextOccurrence({ ...t, start: '2026-12-15' }), null); // fin de la série
  const month = { start: '2027-01-31', repeat: { freq: 'month', anchor: '2027-01-31' } };
  assert.equal(nextOccurrence(month), '2027-02-28'); // mois plus court : dernier jour
  assert.equal(nextOccurrence({ start: '2026-11-26', repeat: { freq: 'day' } }), '2026-11-27');
});

test('description lisible', () => {
  assert.equal(describeRepeat({ start: '2026-12-07', repeat: { freq: 'week', days: [1] } }), 'chaque lundi');
  assert.equal(describeRepeat({ start: '2026-12-01', repeat: { freq: 'week', days: [2, 5] } }), 'chaque mardi et vendredi');
  assert.equal(describeRepeat({ start: '2026-12-05', repeat: { freq: 'month', anchor: '2026-12-05' } }), 'chaque mois (le 5)');
});

test('dictée : « tous les lundis », « chaque dimanche soir », « tous les mois à partir du… », « jusqu’au… »', () => {
  const one = (s) => parseDictation(s, now)[0];
  let t = one('aller à la salle de sport tous les lundis et jeudis');
  assert.deepEqual([t.title, t.start, t.repeat.days], ['Aller salle sport', '2026-11-26', [1, 4]]);
  t = one('appeler maman chaque dimanche soir');
  assert.deepEqual([t.start, t.time, t.repeat.days], ['2026-11-29', '19:00', [0]]);
  t = one('faire la compta tous les mois à partir du 5 décembre');
  assert.deepEqual([t.start, t.repeat.freq], ['2026-12-05', 'month']);
  t = one('publier une vidéo tous les mardis jusqu’au 30 juin');
  assert.deepEqual([t.start, t.repeat.until], ['2026-12-01', '2027-06-30']);
  t = one('réunion d’équipe chaque semaine à 10h');
  assert.deepEqual([t.time, t.repeat.freq, t.repeat.days], ['10:00', 'week', [4]]);
  // sans « tous les / chaque » : toujours deux tâches distinctes
  assert.equal(parseDictation('sport lundi et jeudi', now).length, 2);
  // la phrase « Tous les lundis. » s'applique à la tâche précédente
  assert.deepEqual(parseDictation('Répéter. Tous les lundis.', now).map((x) => [x.title, x.repeat?.days]), [['Répéter', [1]]]);
});

test('placement : première occurrence et date de fin', () => {
  assert.deepEqual(placeRepeat({ freq: 'week', days: [1] }, { start: '2026-12-07', now }).start, '2026-12-07');
  const p = placeRepeat({ freq: 'week', days: [2, 5] }, { start: '2026-12-22', end: '2027-09-30', now });
  assert.deepEqual([p.start, p.repeat.until], ['2026-12-22', '2027-09-30']);
  assert.equal(findRepeat('Bilan de saison'), null);
});

test('moments liés aux prestations', () => {
  assert.equal(eventOffset('J-30 avant chaque date'), -30);
  assert.equal(eventOffset('J+7 après chaque date'), 7);
  assert.equal(eventOffset('Après chaque date'), 1);
  assert.equal(eventOffset('la veille de chaque prestation'), -1);
  assert.equal(eventOffset('30/11/2026'), null);
  assert.equal(eventOffset('avant vendredi'), null);
});

test('une prestation crée les tâches de ses modèles, une seule fois', () => {
  const tpl1 = { id: 'b', title: 'Brief avec les mariés', perEvent: { from: -30, to: -15 }, important: true };
  const tpl2 = { id: 'a', title: 'Demander un avis', perEvent: { from: 1, to: 7 } };
  const ev = { id: 'm', title: 'Mariage Julie', event: true, start: '2027-06-12', end: '2027-06-12' };
  const made = missingForEvent(ev, [tpl1, tpl2, ev]);
  assert.deepEqual(made.map((t) => [t.title, t.start, t.end, t.forEvent]), [
    ['Brief avec les mariés', '2027-05-13', '2027-05-28', 'm'],
    ['Demander un avis', '2027-06-13', '2027-06-19', 'm'],
  ]);
  assert.equal(made[0].important, true);
  // déjà créées : rien de plus
  const existing = made.map((t, i) => ({ ...t, id: `c${i}` }));
  assert.deepEqual(missingForEvent(ev, [tpl1, tpl2, ev, ...existing]), []);
  // pas une prestation, ou pas datée : rien
  assert.deepEqual(missingForEvent({ ...ev, event: false }, [tpl1, ev]), []);
});

test('stockage : une tâche répétée cochée passe à la fois suivante', async () => {
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = v) };
  globalThis.window ||= { addEventListener: () => {} };
  const { store } = await import('../js/store.js?repeat');
  const [t] = store.add([{ title: 'Candidature', start: '2026-12-07', end: '2026-12-07', repeat: { freq: 'week', days: [1], until: '2026-12-14' } }]);
  let u = store.update(t.id, { done: true });
  assert.deepEqual([u.done, u.start], [false, '2026-12-14']);
  u = store.update(t.id, { done: true }); // dernière occurrence : terminée pour de bon
  assert.deepEqual([u.done, u.start], [true, '2026-12-14']);
  const [tpl] = store.add([{ title: 'Brief', start: '2026-12-07', perEvent: { from: -30, to: -15 } }]);
  assert.equal(tpl.start, null); // un modèle n'a pas de date propre
});
