// Transforme une dictée (ou un texte tapé) en une liste de tâches.
// - découpe sur « puis », « ensuite », « et aussi », « tâche suivante », la ponctuation…
// - repère « urgent » / « important » (et leurs négations)
// - repère les dates et périodes (voir when.js) : demain, jeudi 26 novembre, entre lundi et mercredi…
// - rattache à la tâche précédente les phrases qui ne font que la préciser (« À faire avant vendredi. »)
// - supprime les reprises de dictée (« envoyer le… envoyer le dossier »)

import { summarize } from './summarize.js';
import { extractWhen } from './when.js';

const LETTER = "\\p{L}'’";
const word = (body, flags = 'giu') => new RegExp(`(?<![${LETTER}])(?:${body})(?![\\p{L}])`, flags);

const SEPARATORS = word(
  [
    'et puis', 'et ensuite', 'et aussi', 'et après ça', 'puis', 'ensuite', 'après ça', 'après quoi',
    'tâche suivante', 'nouvelle tâche', 'autre tâche', 'prochaine tâche', 'autre chose', 'point suivant',
    'premièrement', 'deuxièmement', 'troisièmement', 'quatrièmement', 'cinquièmement', 'sixièmement',
    "d['’]abord", 'pour finir', 'enfin',
    '(?:première|deuxième|seconde|troisième|quatrième|cinquième|sixième|dernière) tâche',
  ].join('|')
);

const NOT_URGENT = word("(?:c['’]est |ce n['’]est )?(?:pas|non|peu) (?:très |vraiment |si |trop )?(?:urgente?s?|pressée?s?|pressante?s?)");
const URGENT = word(
  "(?:c['’]est )?(?:très |super |vraiment |assez )?(?:urgente?s?|urgemment|en urgence|au plus vite|dès que possible|asap|rapidement|tout de suite|immédiatement|pressante?s?)"
);
const NOT_IMPORTANT = word("(?:c['’]est |ce n['’]est )?(?:pas|non|peu) (?:très |vraiment |si |trop )?(?:importante?s?|prioritaires?|essentielle?s?)");
const IMPORTANT = word(
  "(?:c['’]est )?(?:très |super |vraiment |assez )?(?:importante?s?|prioritaires?|en priorité|essentielle?s?|cruciale?s?|primordiale?s?|capitale?s?)"
);

const LEADING_FILLERS = new RegExp(
  '^(?:' +
    [
      'alors', 'bon', 'donc', 'ok', 'okay', 'euh', 'et', 'aussi', 'ah', 'oui',
      'il (?:faut|faudrait)(?: absolument| vraiment| aussi)?(?: que (?:je |j[\'’]))?',
      'je (?:dois|devrais|voudrais|veux)(?: absolument| vraiment| aussi)?',
      "j['’](?:aimerais|ai à|aurais à)",
      'on (?:doit|devrait)',
      'penser à', 'pense à',
      "ne pas oublier (?:de |d['’])", "n['’]oublie pas (?:de |d['’])", "rappelle[- ]moi (?:de |d['’])",
      'tâche\\s*:?',
    ].join('|') +
    ")(?:(?<=['’])|(?![\\p{L}]))\\s*",
  'iu'
);
const TRAILING_FILLERS =
  /(?:[\s,]+(?:et|c['’]est|ce|qui est|très|vraiment|aussi|le|la|les|pour|avant|entre|de|du|au|à|max|maximum|prévue?s?|(?:à|a) (?:faire|réaliser|rendre|terminer|finir|traiter|boucler|livrer)))+$/iu;

// Une phrase qui ne contient que des précisions (« À faire entre jeudi et vendredi », « C'est urgent »)
const ATTRIBUTE_ONLY =
  /^(?:(?:à|a)\s+(?:faire|réaliser|rendre|terminer|finir|traiter|boucler|livrer)|il faut le faire|(?:le|la) faire|faire ça|ça|ce sera|c['’]est|prévue?s?|délai|échéance|deadline|et|pour|de|du|au|le|la|les|entre|à|max|maximum|[\s,.;:!?\-–])*$/iu;

// « il faut que je… » / « faut que j'… » : le verbe qui suit est conjugué, on le remet à l'infinitif
const QUE_JE = /^(?:(?:alors|bon|donc|euh|et|oui)\s+)*(?:il )?(?:faut|faudrait)(?: absolument| vraiment| aussi| vite)? que (?:je |j['’])\s*(\p{L}+)/iu;

const IRREGULAR = {
  fasse: 'faire', aille: 'aller', prenne: 'prendre', reprenne: 'reprendre', apprenne: 'apprendre', sois: 'être',
  aie: 'avoir', puisse: 'pouvoir', sache: 'savoir', voie: 'voir', revoie: 'revoir', écrive: 'écrire', lise: 'lire',
  dise: 'dire', mette: 'mettre', remette: 'remettre', permette: 'permettre', rende: 'rendre', réponde: 'répondre',
  vende: 'vendre', attende: 'attendre', descende: 'descendre', parte: 'partir', sorte: 'sortir', dorme: 'dormir',
  vienne: 'venir', revienne: 'revenir', passe: 'passer', boive: 'boire', reçoive: 'recevoir', conduise: 'conduire',
  construise: 'construire', inscrive: 'inscrire', ouvre: 'ouvrir', offre: 'offrir', suive: 'suivre', courre: 'courir',
};
const E_GRAVE_KEEP = /^(?:ach|lev|enlev|soulev|amen|emmen|ramen|promen|men|pes|sem|gel|congel|achev)et?er$/u;

export function toInfinitive(w) {
  const lower = w.toLocaleLowerCase('fr-FR');
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (/isse$/u.test(lower)) return lower.replace(/isse$/u, 'ir'); // finisse → finir
  if (/[oua]ie$/u.test(lower)) return lower.replace(/ie$/u, 'yer'); // envoie → envoyer, paie → payer
  if (/e(ll|tt)e$/u.test(lower)) return lower.replace(/(l|t)e$/u, 'er'); // appelle → appeler, jette → jeter
  if (/[^e]e$/u.test(lower) || /ée$/u.test(lower)) {
    let inf = lower + 'r'; // prépare → préparer, crée → créer
    if (inf.includes('è')) {
      const plain = inf.replace('è', 'e');
      inf = E_GRAVE_KEEP.test(plain) ? plain : inf.replace('è', 'é'); // achète → acheter, complète → compléter
    }
    return inf;
  }
  return lower;
}

function clean(s) {
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(QUE_JE, (m, verb) => toInfinitive(verb));
  let prev;
  do {
    prev = s;
    s = s.replace(LEADING_FILLERS, '').replace(/^[\s,:;\-–]+/, '');
  } while (s !== prev);
  s = (' ' + s).replace(TRAILING_FILLERS, '').trim();
  s = s.replace(/[\s,:;\-–]+$/, '');
  return s ? s[0].toLocaleUpperCase('fr-FR') + s.slice(1) : '';
}

/* ---------- reprises de dictée ---------- */

// Mot « comparable » : minuscules, sans accents, lettres doublées simplifiées (Guzzo ≈ guzo)
const fold = (w) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1');

/**
 * Quand on se reprend en dictant (« envoyer exemplaire guzo de Xavier à envoyer exemplaire Guzzo de Xavier à Aurélie »),
 * les 3 premiers mots reviennent plus loin : on garde seulement la dernière version.
 */
export function dropRestart(text) {
  const words = text.trim().split(/\s+/);
  if (words.length < 6) return text.trim();
  const key = words.slice(0, 3).map(fold);
  if (key.some((k) => !k)) return text.trim();
  for (let k = words.length - 3; k >= 2; k--) {
    if (key.every((w, i) => fold(words[k + i]) === w)) return words.slice(k).join(' ');
  }
  return text.trim();
}

/* ---------- une phrase → une tâche (ou des précisions) ---------- */

function parseFragment(raw, now) {
  raw = dropRestart(raw);
  let text = ` ${raw} `;
  let urgent = false;
  let important = false;

  text = text.replace(NOT_URGENT, ' ');
  text = text.replace(NOT_IMPORTANT, ' ');
  text = text.replace(URGENT, () => ((urgent = true), ' '));
  text = text.replace(IMPORTANT, () => ((important = true), ' '));

  const when = extractWhen(text, now);
  const full = clean(when.text);
  const base = { raw, urgent, important, start: when.start, end: when.end };

  if (!/\p{L}{2,}/u.test(full) || ATTRIBUTE_ONLY.test(full)) {
    // pas d'action : seulement des précisions à rattacher à une tâche voisine
    return urgent || important || when.start ? { ...base, attributeOnly: true } : null;
  }
  return { ...base, full, title: summarize(full) };
}

function mergeInto(task, extra) {
  task.urgent ||= extra.urgent;
  task.important ||= extra.important;
  if (extra.start && !task.start) {
    task.start = extra.start;
    task.end = extra.end;
  }
  task.raw = `${task.raw}. ${extra.raw}`;
  task.merged = true;
}

function dictated(raw) {
  const s = raw.replace(/surlendemain/giu, 'après-demain').replace(/\s+/g, ' ').trim();
  return s ? s[0].toLocaleUpperCase('fr-FR') + s.slice(1) + (/[.!?…]$/.test(s) ? '' : '.') : '';
}

/** Découpe un texte libre en tâches. */
export function parseDictation(input, now = new Date()) {
  if (!input || !input.trim()) return [];
  const text = input
    .replace(/après[-\s]demain/giu, 'surlendemain') // évite de couper sur « après »
    .replace(/[;!?\n]+|\.(?!\d)|(?<!\d)\./g, ' | ') // un point coupe, sauf dans une date « 26.11 »
    .replace(SEPARATORS, ' | ');

  const tasks = [];
  let pending = null; // précisions dites avant la première tâche
  for (const frag of text.split('|').map((f) => f.trim()).filter(Boolean)) {
    const r = parseFragment(frag, now);
    if (!r) continue;
    if (r.attributeOnly) {
      const prev = tasks[tasks.length - 1];
      if (prev) mergeInto(prev, r);
      else if (pending) mergeInto(pending, r);
      else pending = r;
      continue;
    }
    if (pending) {
      mergeInto(r, pending);
      pending = null;
    }
    tasks.push(r);
  }

  return tasks.map((t) => ({
    title: t.title,
    // le texte dicté devient le détail dès que le titre a perdu de l'information
    notes: t.title !== t.full || t.merged ? dictated(t.raw) : '',
    urgent: t.urgent,
    important: t.important,
    start: t.start,
    end: t.end,
  }));
}
