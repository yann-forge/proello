// Stockage local des tâches (localStorage) avec abonnement aux changements.
// Les autres onglets ouverts sont mis à jour en temps réel via l'événement 'storage'.
//
// Corbeille : une tâche supprimée reçoit `deletedAt` au lieu de disparaître. Elle reste récupérable
// pendant TRASH_DAYS jours, puis elle est effacée pour de bon au démarrage suivant.
// `updatedAt` est mis à jour à chaque modification (préparation de la synchronisation).

import { lsGet, lsSet, uid } from './util.js';

const KEY = 'proello.tasks.v1';
export const TRASH_DAYS = 30;
const DAY = 86400000;

let tasks = purgeOld(lsGet(KEY, []));
const subscribers = new Set();

function purgeOld(list) {
  const limit = Date.now() - TRASH_DAYS * DAY;
  return list.filter((t) => !t.deletedAt || t.deletedAt > limit);
}

const live = () => tasks.filter((t) => !t.deletedAt);
const emit = () => subscribers.forEach((fn) => fn(live()));

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
  const time = t.time || null;
  const endTime = time && t.endTime && t.endTime > time ? t.endTime : null;
  return { ...t, start, end, time, endTime };
}

function make(input) {
  const now = Date.now();
  return normalizeDates({
    id: uid(),
    title: String(input.title || '').trim(),
    urgent: !!input.urgent,
    important: !!input.important,
    done: !!input.done, // une tâche importée peut arriver déjà terminée
    doneAt: input.done ? input.doneAt || now : null,
    start: input.start || null,
    end: input.end || null,
    time: input.time || null, // horaire « HH:MM », sur le dernier jour de la tâche
    endTime: input.endTime || null,
    notes: input.notes || '',
    category: input.category || null, // identifiant de catégorie du profil (voir profiles.js)
    source: input.source || '', // texte dicté ou tapé d'origine
    dictatedAt: input.dictatedAt || null, // moment de la dictée (les dates relatives en dépendent)
    dictationId: input.dictationId || null, // tâches issues de la même dictée
    createdAt: now,
    updatedAt: now,
    deletedAt: null, // rempli quand la tâche est dans la corbeille
  });
}

const touch = (t, patch) => ({ ...t, ...patch, updatedAt: Date.now() });

export const store = {
  /** Tâches actives (hors corbeille). */
  all: live,
  get: (id) => tasks.find((t) => t.id === id && !t.deletedAt),

  add(inputs) {
    const created = inputs.filter((i) => i.title && i.title.trim()).map(make);
    if (created.length) commit([...tasks, ...created]);
    return created;
  },

  update(id, patch) {
    commit(
      tasks.map((t) => {
        if (t.id !== id) return t;
        const next = normalizeDates(touch(t, patch));
        if ('done' in patch) next.doneAt = patch.done ? Date.now() : null;
        return next;
      })
    );
  },

  /** Met la tâche à la corbeille. */
  remove(id) {
    const removed = tasks.find((t) => t.id === id);
    commit(tasks.map((t) => (t.id === id ? touch(t, { deletedAt: Date.now() }) : t)));
    return removed;
  },

  /* ---------- corbeille ---------- */

  trash: () => tasks.filter((t) => t.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt),

  /** Sort une ou plusieurs tâches de la corbeille. */
  untrash(ids) {
    const set = new Set([].concat(ids));
    commit(tasks.map((t) => (set.has(t.id) ? touch(t, { deletedAt: null }) : t)));
  },

  /** Efface définitivement une tâche de la corbeille (ou toute la corbeille sans argument). */
  purge(id) {
    commit(tasks.filter((t) => !t.deletedAt || (id && t.id !== id)));
  },

  /** Met les tâches terminées à la corbeille ; renvoie leurs identifiants (pour « Annuler »). */
  clearDone() {
    const ids = live()
      .filter((t) => t.done)
      .map((t) => t.id);
    const set = new Set(ids);
    commit(tasks.map((t) => (set.has(t.id) ? touch(t, { deletedAt: Date.now() }) : t)));
    return ids;
  },

  /** Remplace les tâches actives (import, annulation) en gardant la corbeille. */
  replaceAll(list) {
    const ids = new Set(list.map((t) => t.id));
    const keptTrash = tasks.filter((t) => t.deletedAt && !ids.has(t.id));
    commit([...list.map((t) => normalizeDates({ ...make(t), ...t, deletedAt: null })), ...keptTrash]);
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
