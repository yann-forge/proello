// Ordre des tâches dans le planning : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortPlanning } from '../js/tasks.js';

const today = '2026-11-26';
const t = (title, start, end, urgent = false, important = false, done = false) => ({ title, start, end: end || start, urgent, important, done, createdAt: 0 });

test('planning : aujourd’hui d’abord, puis priorité et proximité, terminées à la fin', () => {
  const list = [
    t('Plus tard demain', '2026-11-27'),
    t('Fini', '2026-11-20', null, true, true, true),
    t('Urgent important dans 3 jours', '2026-11-29', null, true, true),
    t('Simple aujourd’hui', '2026-11-26'),
    t('Important dans 2 jours', '2026-11-28', null, false, true),
    t('Urgent important aujourd’hui', '2026-11-26', null, true, true),
    t('En retard', '2026-11-24'),
    t('Urgent important dans 3 semaines', '2026-12-17', null, true, true),
    t('Commencée, finit samedi', '2026-11-25', '2026-11-28', false, true),
  ];
  assert.deepEqual(sortPlanning(list, today).map((x) => x.title), [
    'Urgent important aujourd’hui',
    'Commencée, finit samedi',
    'En retard', // même cadran : la plus en retard d'abord
    'Simple aujourd’hui',
    'Urgent important dans 3 jours',
    'Important dans 2 jours',
    'Plus tard demain',
    'Urgent important dans 3 semaines',
    'Fini',
  ]);
});
