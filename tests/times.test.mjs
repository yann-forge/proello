// Horaires dictés (vue journée du planning) : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictation } from '../js/parser.js';

const NOW = new Date(2026, 10, 25, 10, 0); // mercredi 25 novembre 2026
const p = (s) => parseDictation(s, NOW).map((t) => [t.title, t.end, t.time, t.endTime]);

test('heure simple, quart, demie, midi', () => {
  assert.deepEqual(p('dentiste jeudi à 9h30'), [['Dentiste', '2026-11-26', '09:30', null]]);
  assert.deepEqual(p('appeler Paul demain vers 10 heures'), [['Appeler Paul', '2026-11-26', '10:00', null]]);
  assert.deepEqual(p('rendez-vous à 9 heures et quart'), [['Rendez-vous', null, '09:15', null]]);
  assert.deepEqual(p('dîner vers 20 heures et demie'), [['Dîner', null, '20:30', null]]);
  assert.deepEqual(p('réunion à midi'), [['Réunion', null, '12:00', null]]);
});

test('plage horaire et durée', () => {
  assert.deepEqual(p('répéter demain de 14h à 16h'), [['Répéter', '2026-11-26', '14:00', '16:00']]);
  assert.deepEqual(p('cours à 18h pendant 1h30'), [['Cours', null, '18:00', '19:30']]);
  assert.deepEqual(p('yoga à 7h pendant 45 minutes'), [['Yoga', null, '07:00', '07:45']]);
});

test('une durée seule ou un nombre ne sont pas des horaires', () => {
  assert.deepEqual(p('répéter demain 2 heures'), [['Répéter 2 heures', '2026-11-26', null, null]]);
  assert.deepEqual(p('imprimer 3 exemplaires le 14'), [['Imprimer 3 exemplaires', '2026-12-14', null, null]]);
});

test('chaque tâche d’une dictée garde son horaire', () => {
  assert.deepEqual(p('demain appeler la banque à 9h puis rendez-vous à 11h à la mairie puis trier les papiers'), [
    ['Appeler banque', '2026-11-26', '09:00', null],
    ['Rendez-vous à mairie', null, '11:00', null], // « demain » n'est dit que pour la 1re tâche
    ['Trier papiers', null, null, null],
  ]);
  // une phrase de précision apporte son horaire à la tâche précédente
  assert.deepEqual(p('Réunion du bureau jeudi. Ce sera à 18h.'), [['Réunion du bureau', '2026-11-26', '18:00', null]]);
});
