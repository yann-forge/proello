// Transforme une dictée (ou un texte tapé) en une liste de tâches.
// - découpe sur « puis », « ensuite », « et aussi », « tâche suivante », la ponctuation…
// - repère « urgent » / « important » (et leurs négations)
// - repère les dates : aujourd'hui, demain, lundi, dans 3 jours, le 12 décembre, pour vendredi…

import { toISO } from './dates.js';
import { summarize } from './summarize.js';

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

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6,
  août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
};
const NUMBERS = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, quelques: 3,
};
const NUM = `\\d{1,3}|${Object.keys(NUMBERS).join('|')}`;
const MONTH = Object.keys(MONTHS).join('|');

// mots qui transforment la date en échéance (début = aujourd'hui, fin = date)
const DEADLINE = new Set(['pour', 'avant', "d'ici", 'd’ici', 'au plus tard', "jusqu'à", 'jusqu’à', "jusqu'au", 'jusqu’au', 'à rendre']);
const PREFIX = "(?:(pour|avant|d['’]ici|au plus tard|jusqu['’]à|jusqu['’]au|à rendre|dès|à partir d['’]|à partir de|à partir du)\\s+)?(?:(?:le|la|ce|cette|du|au)\\s+)?";

const day0 = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate());
const plus = (now, n) => {
  const d = day0(now);
  d.setDate(d.getDate() + n);
  return d;
};
const nextWeekday = (now, target, allowToday = false) => {
  const delta = (target - now.getDay() + 7) % 7;
  return plus(now, delta === 0 && !allowToday ? 7 : delta);
};
const toNumber = (s) => (/^\d+$/.test(s) ? Number(s) : NUMBERS[s.toLowerCase()] ?? 1);

// Règles de dates, testées dans l'ordre. `m[k]` = groupes de la règle (le groupe 1 est le préfixe).
const DATE_RULES = [
  { re: 'surlendemain', fn: (m, now) => plus(now, 2) },
  { re: "aujourd['’]hui|ce soir|ce matin|cet après-midi|cette après-midi|tout à l['’]heure", fn: (m, now) => plus(now, 0) },
  { re: 'demain(?: matin| soir| midi| après-midi)?', fn: (m, now) => plus(now, 1) },
  { re: 'week-end|weekend|week end', fn: (m, now) => nextWeekday(now, 6, true) },
  { re: '(?:en )?fin de (?:la )?semaine', fn: (m, now) => nextWeekday(now, 5, true) },
  {
    re: 'semaine prochaine',
    fn: (m, now) => nextWeekday(now, 1),
  },
  {
    re: 'mois prochain',
    fn: (m, now) => new Date(now.getFullYear(), now.getMonth() + 1, 1),
  },
  {
    re: `(${WEEKDAYS.join('|')})(?: prochain| qui vient)?(?: matin| soir| midi| après-midi)?`,
    fn: (m, now) => nextWeekday(now, WEEKDAYS.indexOf(m[2].toLowerCase())),
  },
  {
    re: `dans (${NUM}) (jours?|semaines?|mois)`,
    fn: (m, now) => {
      const n = toNumber(m[2]);
      const unit = m[3].toLowerCase();
      if (unit.startsWith('mois')) return new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
      return plus(now, unit.startsWith('semaine') ? n * 7 : n);
    },
  },
  {
    re: `le (\\d{1,2}|1er|premier)(?:\\s+(${MONTH}))?(?:\\s+(\\d{4}))?`,
    fn: (m, now) => {
      const d = /^\d+$/.test(m[2]) ? Number(m[2]) : 1;
      if (d < 1 || d > 31) return null;
      const today = day0(now);
      if (m[3]) {
        const month = MONTHS[m[3].toLowerCase()];
        let date = new Date(m[4] ? Number(m[4]) : now.getFullYear(), month, d);
        if (!m[4] && date < today) date = new Date(now.getFullYear() + 1, month, d);
        return date;
      }
      let date = new Date(now.getFullYear(), now.getMonth(), d);
      if (date < today) date = new Date(now.getFullYear(), now.getMonth() + 1, d);
      return date;
    },
  },
].map((r) => ({ ...r, regex: word(PREFIX + r.re, 'iu') }));

function extractDate(text, now) {
  for (const rule of DATE_RULES) {
    // le préfixe « le » est intégré à la dernière règle : on le retire du préfixe générique
    const m = text.match(rule.regex);
    if (!m) continue;
    const date = rule.fn(m, now);
    if (!date) continue;
    const iso = toISO(date);
    const prefix = (m[1] || '').toLowerCase();
    const isDeadline = DEADLINE.has(prefix);
    const todayIso = toISO(now);
    return {
      text: text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length),
      start: isDeadline && iso > todayIso ? todayIso : iso,
      end: iso,
    };
  }
  return { text, start: null, end: null };
}

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
const TRAILING_FILLERS = /(?:[\s,]+(?:et|c['’]est|ce|qui est|très|vraiment|aussi|le|la|les|pour|avant))+$/iu;

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

function parseFragment(raw, now) {
  let text = ` ${raw} `;
  let urgent = false;
  let important = false;

  text = text.replace(NOT_URGENT, ' ');
  text = text.replace(NOT_IMPORTANT, ' ');
  text = text.replace(URGENT, () => ((urgent = true), ' '));
  text = text.replace(IMPORTANT, () => ((important = true), ' '));

  const date = extractDate(text, now);
  const full = clean(date.text);
  if (!/\p{L}{2,}/u.test(full)) return null;
  const title = summarize(full);
  // Le texte dicté complet devient le détail, seulement si le titre a perdu de l'information
  const notes = title === full ? '' : dictated(raw);
  return { title, notes, urgent, important, start: date.start, end: date.end };
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
    .replace(/[.;!?\n]+/g, ' | ')
    .replace(SEPARATORS, ' | ');
  return text
    .split('|')
    .map((frag) => frag.trim())
    .filter(Boolean)
    .map((frag) => parseFragment(frag, now))
    .filter(Boolean);
}
