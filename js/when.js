// Comprend « quand » une tâche doit être faite, dans une phrase en français.
//
//  1. On repère toutes les expressions de date : « jeudi 26 novembre », « le 3 », « 12/12 », « demain »,
//     « vendredi », « la semaine prochaine », « fin du mois », « dans 2 semaines »…
//  2. On regarde les mots autour pour savoir comment les combiner :
//       entre A et B · du A au B · de A à B · à partir de A jusqu'à B   → période de A à B
//       pour / avant / d'ici / au plus tard / jusqu'à A                → échéance : d'aujourd'hui à A
//       à partir de / dès A                                            → commence le A
//       pendant / sur / durant N jours (ou semaines)                   → durée
//  3. On retire tout ça du texte, pour que le titre ne garde que l'action.

import { toISO } from './dates.js';

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6,
  août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
};
const NUMBERS = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, quelques: 3,
};

const WD = WEEKDAYS.join('|');
const MONTH = Object.keys(MONTHS).join('|');
const NUM = `\\d{1,3}|${Object.keys(NUMBERS).join('|')}`;
const DAYNUM = '\\d{1,2}|1er|premier';
const ART = "(?:(?:le|la|l['’]|ce|cette|cet)\\s+)?";
const MOMENT = '(?:\\s+(?:matin|soir|midi|après-midi|aprèm|prochain|qui vient))?';
const rx = (body) => new RegExp(`(?<![\\p{L}\\d'’])(?:${body})(?![\\p{L}\\d])`, 'giu');

/* ---------- calcul de dates ---------- */

const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plus = (now, n) => {
  const d = day0(now);
  d.setDate(d.getDate() + n);
  return d;
};
const nextWeekday = (now, target, allowToday = false) => {
  const delta = (target - now.getDay() + 7) % 7;
  return plus(now, delta === 0 && !allowToday ? 7 : delta);
};
const endOfWorkWeek = (now) => (now.getDay() === 0 || now.getDay() === 6 ? nextWeekday(now, 0, true) : nextWeekday(now, 5, true));
const lastOfMonth = (y, m) => new Date(y, m + 1, 0);
const toNumber = (s) => (/^\d+$/.test(s) ? Number(s) : NUMBERS[s.toLowerCase()] ?? 1);
const dayNum = (s) => (/^\d+$/.test(s) ? Number(s) : 1);
const monthOf = (s) => MONTHS[s.toLowerCase()];

/** Jour + mois explicites. Sans année : cette année, ou l'an prochain si la date est passée depuis plus de 2 mois. */
function explicit(now, d, month, year) {
  if (d < 1 || d > 31 || month == null || month < 0 || month > 11) return null;
  if (year) return new Date(year < 100 ? 2000 + year : year, month, d);
  const date = new Date(now.getFullYear(), month, d);
  return date < plus(now, -60) ? new Date(now.getFullYear() + 1, month, d) : date;
}

/** Jour seul (« le 3 ») : ce mois-ci, ou le mois prochain si c'est déjà passé. */
function inferMonth(now, d, weekday = null) {
  if (d < 1 || d > 31) return null;
  const today = day0(now);
  const candidates = [-1, 0, 1, 2].map((k) => new Date(now.getFullYear(), now.getMonth() + k, d)).filter((x) => x.getDate() === d);
  if (weekday != null) {
    const match = candidates.find((x) => x.getDay() === weekday && x >= plus(now, -14));
    if (match) return match;
  }
  return candidates.find((x) => x >= today) || candidates[candidates.length - 1];
}

/* ---------- expressions de date (une date ou une période) ---------- */

const one = (d) => (d ? { start: d, end: d } : null);
const span = (a, b) => (a && b ? { start: a, end: b, period: true } : null);

const RULES = [
  // « du 26 au 28 novembre », « entre le 3 et le 5 »
  {
    re: `(?:du|entre le|depuis le)\\s+(${DAYNUM})\\s+(?:au|et le|et|jusqu['’]au)\\s+(${DAYNUM})(?:\\s+(${MONTH}))?(?:\\s+(\\d{4}))?`,
    fn: (m, now) => {
      const a = dayNum(m[1]);
      const b = dayNum(m[2]);
      if (m[3]) {
        const month = monthOf(m[3]);
        const end = explicit(now, b, month, m[4] && Number(m[4]));
        const start = a <= b ? new Date(end.getFullYear(), month, a) : new Date(end.getFullYear(), month - 1, a);
        return span(start, end);
      }
      const start = inferMonth(now, a);
      const end = start && (b >= a ? new Date(start.getFullYear(), start.getMonth(), b) : new Date(start.getFullYear(), start.getMonth() + 1, b));
      return span(start, end);
    },
    whole: true,
  },
  // « jeudi 26 novembre », « le 3 décembre 2027 »
  {
    re: `${ART}(?:(${WD})\\s+)?(${DAYNUM})\\s+(${MONTH})(?:\\s+(\\d{4}))?${MOMENT}`,
    fn: (m, now) => one(explicit(now, dayNum(m[2]), monthOf(m[3]), m[4] && Number(m[4]))),
  },
  // « 26/11 », « 26.11.2026 »
  {
    re: `${ART}(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?`,
    fn: (m, now) => one(explicit(now, Number(m[1]), Number(m[2]) - 1, m[3] && Number(m[3]))),
  },
  // « jeudi 26 »
  {
    re: `${ART}(${WD})\\s+(${DAYNUM})${MOMENT}`,
    fn: (m, now) => one(inferMonth(now, dayNum(m[2]), WEEKDAYS.indexOf(m[1].toLowerCase()))),
  },
  // « le 3 » (mais pas « le 3 heures », « le 14h »…)
  {
    re: `le\\s+(${DAYNUM})(?!\\s*(?:h(?![\\p{L}])|heures?|%|€|euros?|kilos?|kg|km|ans?|minutes?|min|personnes?|fois|pages?|exemplaires?))`,
    fn: (m, now) => one(inferMonth(now, dayNum(m[1]))),
  },
  { re: "surlendemain|après[-\\s]demain", fn: (m, now) => one(plus(now, 2)) },
  {
    re: "aujourd['’]hui|ce soir|ce matin|cet après-midi|cette après-midi|cet aprèm|tout à l['’]heure|dans la journée",
    fn: (m, now) => one(plus(now, 0)),
  },
  { re: `demain${MOMENT}`, fn: (m, now) => one(plus(now, 1)) },
  {
    re: "(?:ce |le )?(?:week-end|weekend|week end)(?: prochain)?",
    fn: (m, now) => {
      const sat = nextWeekday(now, 6, true);
      return now.getDay() === 0 ? span(plus(now, 0), plus(now, 0)) : span(sat, plus(sat, 1));
    },
  },
  {
    re: "début de (?:la )?semaine prochaine",
    fn: (m, now) => {
      const mon = nextWeekday(now, 1);
      return span(mon, plus(mon, 1));
    },
  },
  {
    re: "fin de (?:la )?semaine prochaine",
    fn: (m, now) => {
      const fri = plus(nextWeekday(now, 1), 4);
      return one(fri);
    },
  },
  { re: '(?:en |à la |la )?fin de (?:la )?semaine', fn: (m, now) => one(nextWeekday(now, 5, true)) },
  {
    re: "(?:toute )?(?:la )?semaine prochaine",
    fn: (m, now) => {
      const mon = nextWeekday(now, 1);
      return span(mon, plus(mon, 4));
    },
  },
  { re: "(?:toute )?cette semaine|toute la semaine", fn: (m, now) => span(plus(now, 0), endOfWorkWeek(now)) },
  {
    re: "(?:le |au |tout le )?mois prochain",
    fn: (m, now) => span(new Date(now.getFullYear(), now.getMonth() + 1, 1), lastOfMonth(now.getFullYear(), now.getMonth() + 1)),
  },
  {
    re: '(?:en |à la |la )?fin (?:du|de) mois',
    fn: (m, now) => one(lastOfMonth(now.getFullYear(), now.getMonth())),
  },
  { re: "ce mois[-\\s]ci", fn: (m, now) => span(plus(now, 0), lastOfMonth(now.getFullYear(), now.getMonth())) },
  {
    re: `${ART}(${WD})${MOMENT}`,
    fn: (m, now) => ({ ...one(nextWeekday(now, WEEKDAYS.indexOf(m[1].toLowerCase()))), weekday: true }),
  },
  {
    re: `dans (${NUM}) (jours?|semaines?|mois)`,
    fn: (m, now) => {
      const n = toNumber(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('mois')) return one(new Date(now.getFullYear(), now.getMonth() + n, now.getDate()));
      return one(plus(now, unit.startsWith('semaine') ? n * 7 : n));
    },
  },
].map((r) => ({ ...r, regex: rx(r.re) }));

/** Toutes les expressions de date du texte, sans chevauchement (la plus longue gagne). */
function findDates(text, now) {
  const found = [];
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    for (const m of text.matchAll(rule.regex)) {
      const value = rule.fn(m, now);
      if (value) found.push({ index: m.index, endIndex: m.index + m[0].length, ...value });
    }
  }
  const chosen = [];
  for (const f of found.sort((a, b) => b.endIndex - b.index - (a.endIndex - a.index))) {
    if (!chosen.some((c) => f.index < c.endIndex && c.index < f.endIndex)) chosen.push(f);
  }
  return chosen.sort((a, b) => a.index - b.index);
}

/* ---------- mots autour des dates ---------- */

const RANGE_START = /(?:entre|du|de|depuis|à partir du|à partir de|à partir d['’]|à compter du|à compter de|dès)\s*$/iu;
const RANGE_MID = /^\s*,?\s*(?:et|au|à|jusqu['’]au|jusqu['’]à|jusqu['’]|-|–|—)\s*$/iu;
const DEADLINE = /(?:pour|avant|d['’]ici|au plus tard|jusqu['’]au|jusqu['’]à|à rendre|à terminer|à finir|à boucler|à livrer|dernier délai|délai|échéance|deadline|maximum|max)\s*,?\s*$/iu;
const START = /(?:à partir du|à partir de|à partir d['’]|à compter du|à compter de|dès|commencer|démarrer)\s*$/iu;
const DURATION = rx(`(?:pendant|durant|sur|en)\\s+(${NUM})\\s+(jours?|semaines?)`);

/**
 * Extrait la période d'une phrase.
 * @returns {{ text: string, start: string|null, end: string|null }}
 */
export function extractWhen(text, now = new Date()) {
  const dates = findDates(text, now);
  const cuts = [];
  let start = null;
  let end = null;
  let open = false; // une date de début seule, qu'une durée peut prolonger

  const [a, b] = dates;
  if (a) {
    const before = text.slice(0, a.index);
    const between = b ? text.slice(a.endIndex, b.index) : '';
    const rs = before.match(RANGE_START);
    if (b && rs && RANGE_MID.test(between)) {
      // entre A et B, du A au B… (« de lundi à mercredi » : le mercredi qui suit ce lundi)
      start = a.start;
      end = b.end;
      if (b.weekday) while (end < start) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 7);
      cuts.push([rs.index, b.endIndex]);
    } else {
      const dl = before.match(DEADLINE);
      const st = before.match(START);
      if (dl && !a.period) {
        end = a.end;
        start = day0(now) < a.start ? day0(now) : a.start;
        cuts.push([dl.index, a.endIndex]);
      } else if (st) {
        start = a.start;
        end = a.end;
        open = !a.period;
        cuts.push([st.index, a.endIndex]);
      } else {
        start = a.start;
        end = a.end;
        open = !a.period;
        cuts.push([a.index, a.endIndex]);
      }
    }
  }

  DURATION.lastIndex = 0;
  const dur = DURATION.exec(text);
  if (dur && !cuts.some(([x, y]) => dur.index < y && x < dur.index + dur[0].length)) {
    const n = toNumber(dur[1]) * (dur[2].toLowerCase().startsWith('semaine') ? 7 : 1);
    if (!start) {
      start = day0(now);
      end = plus(now, n - 1);
    } else if (open) {
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n - 1);
    }
    cuts.push([dur.index, dur.index + dur[0].length]);
  }

  if (start && end && end < start) [start, end] = [end, start];

  let out = text;
  for (const [x, y] of cuts.sort((p, q) => q[0] - p[0])) out = out.slice(0, x) + ' ' + out.slice(y);
  return { text: out, start: start && toISO(start), end: end && toISO(end) };
}
