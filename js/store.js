// Stockage local des tâches (localStorage) avec abonnement aux changements.
// Les autres onglets ouverts sont mis à jour en temps réel via l'événement 'storage'.

import { lsGet, lsSet, uid } from './util.js';

const KEY = 'proello.tasks.v1';
let tasks = lsGet(KEY, []);
const subscribers = new Set();

const emit = () => subscribers.forEach((fn) => fn(tasks));

function commit(next) {
  tasks = next;
  lsSet(KEY, tasks);
  emit();
}

/** Garantit des dates cohérentes : si une seule date est donnée, début = fin ; fin >= début. */
function normalizeDates(t) {
  let { start, end } = t;
  start = start || null;
  end = end || null;
  if (start && !end) end = start;
  if (end && !start) start = end;
  if (start && end && end < start) end = start;
  return { ...t, start, end };
}

function make(input) {
  return normalizeDates({
    id: uid(),
    title: String(input.title || '').trim(),
    urgent: !!input.urgent,
    important: !!input.important,
    done: false,
    doneAt: null,
    start: input.start || null,
    end: input.end || null,
    notes: input.notes || '',
    source: input.source || '', // texte dicté ou tapé d'origine
    dictatedAt: input.dictatedAt || null, // moment de la dictée (les dates relatives en dépendent)
    createdAt: Date.now(),
  });
}

export const store = {
  all: () => tasks,
  get: (id) => tasks.find((t) => t.id === id),

  add(inputs) {
    const created = inputs.filter((i) => i.title && i.title.trim()).map(make);
    if (created.length) commit([...tasks, ...created]);
    return created;
  },

  update(id, patch) {
    commit(
      tasks.map((t) => {
        if (t.id !== id) return t;
        const next = normalizeDates({ ...t, ...patch });
        if ('done' in patch) next.doneAt = patch.done ? Date.now() : null;
        return next;
      })
    );
  },

  remove(id) {
    const removed = tasks.find((t) => t.id === id);
    commit(tasks.filter((t) => t.id !== id));
    return removed;
  },

  restore(task) {
    if (task && !tasks.some((t) => t.id === task.id)) commit([...tasks, task]);
  },

  clearDone() {
    const n = tasks.filter((t) => t.done).length;
    commit(tasks.filter((t) => !t.done));
    return n;
  },

  replaceAll(list) {
    commit(list.map((t) => normalizeDates({ ...make(t), ...t })));
  },

  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    tasks = lsGet(KEY, []);
    emit();
  }
});
