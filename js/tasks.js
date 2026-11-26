// Modèle : les 4 cadrans de la matrice d'Eisenhower et le tri des tâches

export const QUADS = {
  do: {
    label: 'Faire maintenant',
    short: 'Maintenant',
    sub: 'Urgent · Important',
    urgent: true,
    important: true,
    empty: "Rien d'urgent et d'important. Profites-en !",
  },
  plan: {
    label: 'Planifier',
    short: 'À planifier',
    sub: 'Important · Pas urgent',
    urgent: false,
    important: true,
    empty: 'Les tâches importantes qui peuvent attendre arrivent ici.',
  },
  delegate: {
    label: 'Déléguer',
    short: 'À déléguer',
    sub: 'Urgent · Pas important',
    urgent: true,
    important: false,
    empty: 'Urgent mais pas essentiel : à confier si possible.',
  },
  later: {
    label: 'Plus tard',
    short: 'Plus tard',
    sub: 'Ni urgent ni important',
    urgent: false,
    important: false,
    empty: 'Le reste, quand tu auras le temps.',
  },
};

export const QUAD_ORDER = ['do', 'plan', 'delegate', 'later'];

export const quadrantOf = (t) => (t.urgent ? (t.important ? 'do' : 'delegate') : t.important ? 'plan' : 'later');

const cmpDate = (a, b) => (a === b ? 0 : !a ? 1 : !b ? -1 : a < b ? -1 : 1);

/** Tri : à faire avant terminées, puis par cadran, puis par échéance, puis par ancienneté. */
export function sortTasks(list) {
  return [...list].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      QUAD_ORDER.indexOf(quadrantOf(a)) - QUAD_ORDER.indexOf(quadrantOf(b)) ||
      cmpDate(a.end, b.end) ||
      a.createdAt - b.createdAt
  );
}

// Planning : retard (en jours) accepté selon le cadran avant de passer derrière une tâche moins prioritaire.
// Une tâche « Faire maintenant » dans 3 jours passe ainsi devant une tâche « Plus tard » de demain.
const PLAN_DELAY = { do: 0, plan: 5, delegate: 7, later: 10 };
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/**
 * Ordre des lignes du planning :
 * 1. à faire aujourd'hui (commencée, du jour ou en retard), quelle que soit sa priorité — par cadran puis échéance ;
 * 2. puis les suivantes, selon leur proximité et leur priorité (jours d'attente + délai du cadran) ;
 * 3. les terminées à la fin.
 */
export function sortPlanning(list, today) {
  const t0 = dayNum(today);
  const rank = (t) => {
    const q = quadrantOf(t);
    if (t.done) return [2, dayNum(t.start), 0];
    if (t.start <= today) return [0, QUAD_ORDER.indexOf(q), dayNum(t.end)];
    return [1, dayNum(t.start) - t0 + PLAN_DELAY[q], QUAD_ORDER.indexOf(q)];
  };
  return [...list]
    .map((t) => [rank(t), t])
    .sort(([a, x], [b, y]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || cmpDate(x.start, y.start) || x.createdAt - y.createdAt)
    .map(([, t]) => t);
}
