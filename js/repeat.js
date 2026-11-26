// Tâches qui se répètent et tâches « pour chaque prestation ».
//
// Répétition : une seule tâche porte une règle `repeat` = { freq: 'day'|'week'|'month', days?: [0-6], until?: 'AAAA-MM-JJ' }
//   (days : jours de la semaine, 0 = dimanche ; sans days, le jour de la semaine de `anchor`).
//   `start` / `end` = la prochaine occurrence à faire. Cochée, la tâche passe à l'occurrence suivante.
//   Le planning et la vue journée affichent toutes les occurrences.
//
// Modèle par prestation : `perEvent` = { from, to } (jours par rapport à la prestation : -30, -15, +1, +7…).
//   Sans date propre ; quand une tâche est marquée « prestation » (`event: true`) et datée, une copie datée
//   de chaque modèle est créée (`fromTemplate`, `forEvent` évitent les doublons).

import { toISO, fromISO, addDays, todayISO } from './dates.js';

export const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WD = '(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?';
const DAY_LIST = `${WD}(?:\\s*(?:,|et)\\s*${WD})*`;

const weekday = (iso) => fromISO(iso).getDay();

/** Jours de la semaine cités dans un texte (« mardi et vendredi » → [2, 5]). */
export function weekdaysIn(text) {
  const out = [];
  for (const m of String(text).toLowerCase().matchAll(new RegExp(WD, 'gu'))) {
    const d = WEEKDAYS.indexOf(m[1]);
    if (!out.includes(d)) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

/** Heure par défaut d'un moment de la journée : matin 9h, midi 12h, après-midi 14h, soir 19h. */
export function dayPartTime(text) {
  const s = String(text).toLowerCase();
  if (/apr[eè]s[-\s]?midi/.test(s)) return '14:00';
  if (/\bmatin(ée)?\b/.test(s)) return '09:00';
  if (/\bmidi\b/.test(s)) return '12:00';
  if (/\bsoir(ée)?\b/.test(s)) return '19:00';
  return null;
}

/** Le jour `iso` est-il une occurrence de la règle (sans regarder début ni fin) ? */
function fits(rule, anchor, iso) {
  if (rule.freq === 'day') return true;
  if (rule.freq === 'week') return (rule.days?.length ? rule.days : [weekday(anchor)]).includes(weekday(iso));
  if (rule.freq === 'month') {
    const want = fromISO(anchor).getDate();
    const d = fromISO(iso);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(want, last);
  }
  return false;
}

const anchorOf = (t) => t.repeat?.anchor || t.start || todayISO();

/** Première occurrence à partir de `from` (incluse), ou null après la date de fin. */
export function firstOccurrence(rule, anchor, from) {
  for (let i = 0, d = from; i < 400; i++, d = addDays(d, 1)) {
    if (rule.until && d > rule.until) return null;
    if (fits(rule, anchor, d)) return d;
  }
  return null;
}

/** Occurrence suivant celle du `start` actuel de la tâche (null : la série est finie). */
export const nextOccurrence = (t) => firstOccurrence(t.repeat, anchorOf(t), addDays(t.start, 1));

/** Occurrences de la tâche entre `from` et `to` inclus (à partir de son occurrence courante). */
export function occurrences(t, from, to) {
  if (!t.repeat || !t.start) return [];
  const out = [];
  let d = from > t.start ? from : t.start;
  const anchor = anchorOf(t);
  for (let i = 0; i < 400 && d <= to; i++, d = addDays(d, 1)) {
    if (t.repeat.until && d > t.repeat.until) break;
    if (fits(t.repeat, anchor, d)) out.push(d);
  }
  return out;
}

const joinFr = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);

/** « chaque lundi », « chaque mardi et vendredi », « chaque jour », « chaque mois (le 7) ». */
export function describeRepeat(t) {
  const r = t.repeat;
  if (!r) return '';
  if (r.freq === 'day') return 'chaque jour';
  if (r.freq === 'month') return `chaque mois (le ${fromISO(anchorOf(t)).getDate()})`;
  const days = r.days?.length ? r.days : [weekday(anchorOf(t))];
  if (days.length === 7) return 'chaque jour';
  return `chaque ${joinFr(days.map((d) => WEEKDAYS[d]))}`;
}

/** Règle pour un nouveau point de départ : la règle garde son jour d'ancrage. */
export function withAnchor(repeat, start) {
  if (!repeat) return null;
  return { ...repeat, anchor: repeat.anchor || start || todayISO() };
}

/* ---------- Lecture dans un texte (dictée, cellule de tableau) ---------- */

const REPEAT_RULES = [
  // « tous les lundis (matin) », « chaque mardi et vendredi », « le lundi et le jeudi de chaque semaine »
  [new RegExp(`\\b(?:tous\\s+les|chaque)\\s+(${DAY_LIST})(?:\\s+(matin|midi|apr[eè]s[-\\s]?midi|soir))?`, 'iu'), (m) => ({ freq: 'week', days: weekdaysIn(m[1]), part: m[m.length - 1] })],
  [/\b(?:tous\s+les\s+jours|chaque\s+jour|quotidiennement|au\s+quotidien|tous\s+les\s+(?:matins|soirs))\b/iu, (m) => ({ freq: 'day', part: /matins/i.test(m[0]) ? 'matin' : /soirs/i.test(m[0]) ? 'soir' : null })],
  [/\b(?:toutes\s+les\s+semaines|chaque\s+semaine|une\s+fois\s+par\s+semaine|hebdomadaire(?:ment)?|par\s+semaine)\b/iu, () => ({ freq: 'week' })],
  [/\b(?:tous\s+les\s+mois|chaque\s+mois|une\s+fois\s+par\s+mois|mensuel(?:le(?:ment)?)?|par\s+mois)\b/iu, () => ({ freq: 'month' })],
];

/**
 * Repère une répétition dans un texte.
 * @returns {{ repeat: {freq, days?}, time: string|null, index: number, length: number } | null}
 */
export function findRepeat(text) {
  for (const [re, make] of REPEAT_RULES) {
    const m = text.match(re);
    if (!m) continue;
    const { part, ...repeat } = make(m);
    if (!repeat.days?.length) delete repeat.days;
    return { repeat, time: part ? dayPartTime(part) : null, index: m.index, length: m[0].length };
  }
  return null;
}

/**
 * Place une tâche répétée : première occurrence à partir du début voulu (aujourd'hui par défaut) ;
 * une période donnée (« jusqu'au 30 septembre », « du 22/12 au 30/09 ») devient la date de fin de la série.
 */
export function placeRepeat(repeat, { start, end, now = new Date() }) {
  const from = start || toISO(now);
  const rule = { ...repeat };
  if (end && end > from) rule.until = end;
  if (rule.freq === 'week' && !rule.days) rule.days = [weekday(from)];
  const anchor = from;
  const first = firstOccurrence(rule, anchor, from) || from;
  return { repeat: { ...rule, anchor: rule.freq === 'month' ? anchor : first }, start: first, end: first };
}

/* ---------- Modèles « pour chaque prestation » ---------- */

/**
 * « J-30 avant chaque date », « J+7 après chaque date », « Après chaque date », « la veille de chaque prestation »…
 * @returns {number|null} décalage en jours par rapport à la prestation
 */
export function eventOffset(text) {
  const s = String(text).toLowerCase().trim();
  if (!/(chaque|toute?s?\s+les?)\s+(date|prestation|événement|evenement|concert|mariage|cérémonie|ceremonie)s?|\bj\s*[-+]\s*\d/u.test(s)) return null;
  const j = s.match(/\bj\s*([-+])\s*(\d{1,3})/);
  if (j) return (j[1] === '-' ? -1 : 1) * Number(j[2]);
  const n = s.match(/(\d{1,3})\s*jours?\s+(avant|après|apres)/);
  if (n) return (n[2] === 'avant' ? -1 : 1) * Number(n[1]);
  if (/\bveille\b/.test(s)) return -1;
  if (/\blendemain\b/.test(s)) return 1;
  if (/\bavant\b/.test(s)) return -1;
  if (/\b(?:après|apres)\b/.test(s)) return 1;
  if (/\b(le\s+jour|jour\s+j)\b/.test(s)) return 0;
  return null;
}

/** Copie datée d'un modèle pour une prestation. */
export function fromTemplate(tpl, ev) {
  const base = (off) => addDays(off < 0 ? ev.start : ev.end || ev.start, off);
  const a = base(tpl.perEvent.from);
  const b = base(tpl.perEvent.to ?? tpl.perEvent.from);
  // « Faire un brief avant chaque date » → « Faire un brief » : la copie est datée, la précision n'a plus lieu d'être
  const title = tpl.title.replace(/\s*,?\s*(?:avant|après|apres|pour|à|a|lors de|le jour de)\s+(?:chaque|toutes?\s+les?)\s+(?:date|prestation|événement|evenement|concert|mariage)s?\b/iu, '').trim();
  return {
    title: title || tpl.title,
    notes: [`Pour « ${ev.title} »`, tpl.notes].filter(Boolean).join('\n'),
    urgent: tpl.urgent,
    important: tpl.important,
    category: tpl.category,
    start: a < b ? a : b,
    end: a < b ? b : a,
    fromTemplate: tpl.id,
    forEvent: ev.id,
  };
}

/** Le modèle s'applique-t-il à cette prestation ? (modèle sans type : à toutes ; sinon : au même type) */
export const appliesTo = (tpl, ev) => !!tpl.perEvent && (!tpl.perEvent.type || tpl.perEvent.type === ev.eventType);

/** Copies à créer pour une prestation (celles qui n'existent pas encore). */
export function missingForEvent(ev, all) {
  if (!ev.event || !ev.start) return [];
  const done = new Set(all.filter((t) => t.forEvent === ev.id).map((t) => t.fromTemplate));
  return all.filter((t) => appliesTo(t, ev) && !t.deletedAt && !done.has(t.id)).map((tpl) => fromTemplate(tpl, ev));
}

/** Copies pas encore faites dont le modèle ne s'applique plus (type de prestation changé, plus une prestation). */
export function staleForEvent(ev, all) {
  return all.filter((c) => {
    if (c.forEvent !== ev.id || c.done || c.deletedAt) return false;
    const tpl = all.find((x) => x.id === c.fromTemplate);
    return !ev.event || !tpl || !appliesTo(tpl, ev);
  });
}

const fmtOff = (n) => (n === 0 ? 'jour J' : `J${n < 0 ? '−' : '+'}${Math.abs(n)}`);
/** « J−30 → J−15 », « J+1 → J+7 ». */
export const describeOffsets = (pe) => (pe.to == null || pe.to === pe.from ? fmtOff(pe.from) : `${fmtOff(pe.from)} → ${fmtOff(pe.to)}`);

// mots qui font penser qu'une nouvelle tâche est une prestation (on propose, on n'impose pas)
export const EVENT_WORDS = /\b(prestation|mariage|concert|cérémonie|ceremonie|vin d['’]honneur|cocktail|spectacle|représentation|gig|soirée privée|anniversaire)\b/iu;
