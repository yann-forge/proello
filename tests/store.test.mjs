// Corbeille et stockage des tâches : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// faux stockage du navigateur, avec une tâche supprimée il y a 40 jours (à purger) et une il y a 2 jours
const DAY = 86400000;
const seed = [
  { id: 'vieux', title: 'Vieille tâche', deletedAt: Date.now() - 40 * DAY, createdAt: 1 },
  { id: 'recent', title: 'Supprimée récemment', deletedAt: Date.now() - 2 * DAY, createdAt: 2 },
  { id: 'active', title: 'Tâche active', deletedAt: null, createdAt: 3 },
];
const mem = { 'proello.tasks.v1': JSON.stringify(seed) };
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = v) };
globalThis.window = { addEventListener: () => {} };
const { store } = await import('../js/store.js');

test('au démarrage, la corbeille de plus de 30 jours est effacée', () => {
  assert.deepEqual(store.all().map((t) => t.id), ['active']);
  assert.deepEqual(store.trash().map((t) => t.id), ['recent']);
});

test('supprimer met à la corbeille, restaurer remet la tâche', () => {
  const [t] = store.add([{ title: 'Appeler plombier' }]);
  assert.ok(t.updatedAt && t.deletedAt === null);
  store.remove(t.id);
  assert.ok(!store.all().some((x) => x.id === t.id));
  assert.ok(store.trash().some((x) => x.id === t.id));
  assert.equal(store.get(t.id), undefined);
  store.untrash(t.id);
  assert.ok(store.all().some((x) => x.id === t.id));
});

test('les tâches terminées vont à la corbeille et peuvent revenir ensemble', () => {
  const created = store.add([{ title: 'A' }, { title: 'B' }]);
  created.forEach((t) => store.update(t.id, { done: true }));
  const ids = store.clearDone();
  assert.deepEqual(ids.sort(), created.map((t) => t.id).sort());
  assert.ok(created.every((t) => !store.all().some((x) => x.id === t.id)));
  store.untrash(ids);
  assert.ok(created.every((t) => store.all().some((x) => x.id === t.id)));
});

test('effacer définitivement une tâche, puis vider la corbeille', () => {
  const [a, b] = store.add([{ title: 'X' }, { title: 'Y' }]);
  store.remove(a.id);
  store.remove(b.id);
  store.purge(a.id);
  assert.ok(!store.trash().some((x) => x.id === a.id));
  assert.ok(store.trash().some((x) => x.id === b.id));
  store.purge();
  assert.equal(store.trash().length, 0);
});

test('un import (replaceAll) garde la corbeille', () => {
  const [t] = store.add([{ title: 'Z' }]);
  store.remove(t.id);
  store.replaceAll([{ id: 'imp', title: 'Importée' }]);
  assert.deepEqual(store.all().map((x) => x.id), ['imp']);
  assert.ok(store.trash().some((x) => x.id === t.id));
});
