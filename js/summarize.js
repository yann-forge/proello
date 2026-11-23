// Résume une phrase de tâche en un titre court (4 mots maximum), sans IA, directement sur l'appareil.
// Étapes, de la plus douce à la plus forte (on s'arrête dès que le titre est assez court) :
//   1. couper à la première explication (« parce que », « pour que », « qui », virgule…)
//   2. enlever les mots vides (articles, possessifs, pronoms, « vraiment », « bien »…)
//   3. couper avant une préposition (« pour », « avec », « de »…) en gardant le plus de mots possible
//   4. tronquer à 4 mots en retirant les petits mots de liaison

export const MAX_WORDS = 4;

const B = '(?<![\\p{L}\'’])';
const E = '(?![\\p{L}])';
const CLAUSE = new RegExp(
  `\\s*(?:[,:(]|${B}(?:parce que|parce qu['’]|car|pour que|pour qu['’]|afin de|afin d['’]|afin que|vu que|puisque|sinon|histoire de|comme ça|qui|où|lorsque|lorsqu['’]|quand|si jamais|sachant que|étant donné que)${E})`,
  'iu'
);

const PARTICIPLES =
  'faite?s?|réalisée?s?|effectuée?s?|envoyée?s?|préparée?s?|rédigée?s?|terminée?s?|finie?s?|organisée?s?|transmise?s?|remise?s?|établie?s?|présentée?s?|validée?s?|signée?s?|planifiée?s?|traitée?s?|lancée?s?';
const PASSIVE = new RegExp(
  `${B}(?:devra|devront|doit|doivent|devrait|devraient|va|vont|sera|seront|est|sont)(?:\\s+(?:être|bien|absolument|vraiment|aussi|vite))*\\s+(?:${PARTICIPLES})${E}`,
  'giu'
);
const fold = (w) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

const ELISION =/^(?:l|d|j|qu|m|t|s|n|c)['’](?=\p{L})/iu;
const EMPTY = new Set(
  (
    'le la les un une des mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ce cet cette ces ' +
    'je tu il elle on nous vous ils elles me te se ' +
    'bien très vraiment aussi alors donc euh genre juste voilà enfin peut-être quelques tout toute tous toutes'
  ).split(' ')
);
const PREPS = new Set('à au aux de du des pour avec sur dans en par chez sans vers entre sous avant après'.split(' '));
const LIGHT = new Set('à au aux de du des et ou'.split(' '));

const lc = (w) => w.toLocaleLowerCase('fr-FR').replace(/[.,;:!?…]+$/u, '');
const words = (s) => s.split(/\s+/).filter(Boolean);
const cap = (s) => {
  s = s.replace(/[\s,;:.\-–]+$/u, '').trim();
  return s ? s[0].toLocaleUpperCase('fr-FR') + s.slice(1) : '';
};
const trimTail = (list) => {
  const out = [...list];
  while (out.length > 1 && (PREPS.has(lc(out[out.length - 1])) || EMPTY.has(lc(out[out.length - 1])) || LIGHT.has(lc(out[out.length - 1])))) out.pop();
  return out;
};

export function summarize(text) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  if (words(s).length <= MAX_WORDS) return cap(s);

  // 1. couper à la première explication
  const m = s.match(CLAUSE);
  if (m && m.index > 0) {
    const head = s.slice(0, m.index).trim();
    if (words(head).length >= 2) s = head;
  }
  if (words(s).length <= MAX_WORDS) return cap(s);

  // 1 bis. retirer les tournures au passif, qui n'apportent rien au titre (« devra être fait », « doit être envoyé »)
  s = s.replace(PASSIVE, ' ').replace(/\s+/g, ' ').trim();
  if (words(s).length <= MAX_WORDS) return cap(trimTail(words(s)).join(' '));

  // 2. enlever les mots vides, et les mots de la même famille déjà présents (« rapport » … « rapporter »)
  const stems = new Set();
  let list = words(s)
    .map((w) => w.replace(ELISION, ''))
    .filter((w) => w && !EMPTY.has(lc(w)))
    .filter((w) => {
      const stem = fold(w).slice(0, 6);
      if (stem.length < 6) return true;
      if (stems.has(stem)) return false;
      stems.add(stem);
      return true;
    });
  if (list.length <= MAX_WORDS) return cap(list.join(' '));

  // 3. couper avant une préposition, si on garde au moins 3 mots (« Envoyer devis à Marc »)
  for (let i = MAX_WORDS; i >= 3; i--) {
    if (PREPS.has(lc(list[i]))) {
      const head = trimTail(list.slice(0, i));
      if (head.length >= 3) return cap(head.join(' '));
    }
  }

  // 4. retirer toutes les prépositions et tronquer (« Réserver table restaurant italien »)
  list = list.filter((w, i) => i === 0 || (!PREPS.has(lc(w)) && !LIGHT.has(lc(w))));
  return cap(trimTail(list.slice(0, MAX_WORDS)).join(' '));
}
