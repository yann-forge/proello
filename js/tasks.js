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
