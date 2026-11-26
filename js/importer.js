// Import de tâches en nombre, depuis trois sources :
//  1. un tableau (Excel, Google Sheets, LibreOffice) enregistré en .csv, ou des cellules copiées-collées ;
//     la première ligne donne le nom des colonnes (Titre, Urgent, Important, Début, Échéance, Heure, Catégorie…) ;
//  2. un simple texte, une tâche par ligne : chaque ligne est comprise comme une dictée (« appeler Paul demain urgent ») ;
//  3. une sauvegarde Proello (.json, faite avec « Exporter une sauvegarde »).
// Les tâches importées s'ajoutent aux tâches existantes ; les doublons sont ignorés.
// Module sans accès à la page : testable avec Node (tests/import.test.mjs).

import { parseDictation } from './parser.js';
import { extractWhen } from './when.js';
import { toISO, todayISO, addDays, diffDays, fromISO } from './dates.js';
import { findRepeat, placeRepeat, weekdaysIn, dayPartTime, eventOffset } from './repeat.js';
import { uid } from './util.js';

// sans accents ni majuscules (comme slug() de profiles.js, qui n'est pas chargeable hors navigateur)
const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/* ---------- Lecture d'un fichier (UTF-8, ou Windows-1252 pour les vieux CSV d'Excel) ---------- */

export function decodeBytes(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/* ---------- Tableau CSV / TSV ---------- */

/** Devine le séparateur d'après la première ligne : tabulation (copier-coller), point-virgule (Excel français) ou virgule. */
function delimiterOf(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const count = (c) => first.split(c).length - 1;
  const best = ['\t', ';', ','].map((c) => [c, count(c)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] ? best[0] : null;
}

/** Découpe un texte CSV en lignes de cellules (gère les guillemets et les retours à la ligne dans une cellule). */
export function parseTable(text, delim = delimiterOf(text)) {
  if (!delim) return text.split(/\r?\n/).map((l) => [l]);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row);
  // les lignes vides sont gardées (pour que les numéros de ligne signalés correspondent au fichier)
  return rows.map((r) => r.map((x) => x.trim()));
}

// Noms de colonnes reconnus (sans accents ni majuscules)
const COLUMNS = {
  title: ['titre', 'tache', 'taches', 'nom', 'intitule', 'libelle', 'quoi', 'a-faire', 'task', 'title', 'todo'],
  urgent: ['urgent', 'urgente', 'urgence'],
  important: ['important', 'importante', 'importance'],
  priority: ['priorite', 'priority', 'quadrant', 'eisenhower'],
  date: ['date', 'jour', 'quand', 'periode'],
  start: ['debut', 'date-de-debut', 'date-debut', 'start', 'commence', 'a-partir-du'],
  end: ['echeance', 'fin', 'date-de-fin', 'date-fin', 'date-limite', 'deadline', 'due', 'avant-le', 'pour-le', 'end'],
  time: ['heure', 'horaire', 'heure-de-debut', 'heure-debut', 'time'],
  endTime: ['heure-de-fin', 'heure-fin', 'jusqu-a'],
  category: ['categorie', 'category', 'rubrique', 'theme', 'domaine'],
  notes: ['detail', 'details', 'note', 'notes', 'description', 'commentaire', 'commentaires', 'remarque', 'remarques'],
  done: ['terminee', 'termine', 'fait', 'faite', 'statut', 'etat', 'done', 'fini'],
};

/** Associe chaque colonne du tableau à un champ de tâche ; null si aucune colonne « Titre ». */
export function mapHeader(cells) {
  const map = {};
  cells.forEach((h, i) => {
    const key = slug(h);
    const field = Object.keys(COLUMNS).find((f) => COLUMNS[f].includes(key));
    if (field && !(field in map)) map[field] = i;
  });
  return 'title' in map ? map : null;
}

const YES = new Set(['oui', 'o', 'x', '1', 'vrai', 'true', 'yes', 'y', 'ok', 'urgent', 'important', 'fait', 'faite', 'termine', 'terminee', 'fini', 'done']);
const isYes = (v) => /[✓✔☑✅]/.test(v) || YES.has(slug(v));

/** « Priorité » : « urgent et important », « faire maintenant », « planifier », « déléguer »… */
function priorityOf(v) {
  const s = slug(v);
  if (!s) return {};
  if (/faire-maintenant|^maintenant|urgent-(et-)?important|tres-urgent/.test(s)) return { urgent: true, important: true };
  return {
    urgent: /(^|-)urgent/.test(s) && !/(pas|non)-urgent/.test(s) || /deleguer/.test(s),
    important: /(^|-)important/.test(s) && !/(pas|non)-important/.test(s) || /planifier/.test(s),
  };
}

/**
 * Date d'une cellule : 28/11/2026, 28/11/26, 28/11, 2026-11-28, ou du texte (« demain », « vendredi », « du 5 au 7 décembre »).
 * Renvoie { start, end } ou null si la cellule n'est pas comprise.
 */
export function parseDateCell(v, now = new Date()) {
  v = v.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return one(new Date(+m[1], +m[2] - 1, +m[3]));
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?:\s|$)/);
  if (m) {
    let year = m[3] ? +m[3] : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1) return null;
    // sans année : une date passée depuis plus de 2 mois est celle de l'an prochain
    if (!m[3] && toISO(d) < addDays(todayISO(), -60)) d.setFullYear(year + 1);
    return one(d);
  }
  const w = extractWhen(v, now);
  return w.start ? { start: w.start, end: w.end || w.start } : null;
}
const one = (d) => (isNaN(d) ? null : { start: toISO(d), end: toISO(d) });

/** Heure d'une cellule : 14h, 14h30, 14:30, 9h-11h, de 9h à 11h, midi. */
export function parseTimeCell(v) {
  const s = v.trim().toLowerCase().replace(/^de\s+/, '');
  if (!s) return null;
  if (/^midi$/.test(s)) return { time: '12:00' };
  const T = '(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?(?::\\d{2})?';
  const m = s.match(new RegExp(`^${T}(?:\\s*(?:-|–|à|a)\\s*${T})?`));
  if (!m || +m[1] > 23) return null;
  const hm = (h, mn) => `${String(h).padStart(2, '0')}:${(mn || '00').padStart(2, '0')}`;
  return { time: hm(m[1], m[2]), endTime: m[3] && +m[3] <= 23 ? hm(m[3], m[4]) : null };
}

/** Catégorie d'après son nom (sans accents ni majuscules) ; null si inconnue (elle sera alors devinée). */
function categoryId(v, categories) {
  const s = slug(v);
  if (!s) return null;
  const c = categories.find((x) => slug(x.name) === s || x.id === s) || categories.find((x) => slug(x.name).startsWith(s) || s.startsWith(slug(x.name)));
  return c ? c.id : null;
}

export function tasksFromTable(rows, { categories = [], now = new Date() } = {}) {
  const map = mapHeader(rows[0] || []);
  const tasks = [];
  const skipped = [];
  if (!map) return { tasks, skipped };
  const get = (row, f) => (f in map ? (row[map[f]] || '').trim() : '');
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    if (!row.some(Boolean)) return; // ligne vide
    const full = get(row, 'title');
    if (!full) return skipped.push({ line, reason: 'pas de titre' });
    // le titre du tableau est gardé tel quel (choisi par l'utilisateur, pas raccourci comme une dictée)
    const t = { title: full.replace(/\s+/g, ' '), notes: get(row, 'notes'), source: '' };
    const prio = priorityOf(get(row, 'priority'));
    t.urgent = isYes(get(row, 'urgent')) || !!prio.urgent;
    t.important = isYes(get(row, 'important')) || !!prio.important;
    t.done = isYes(get(row, 'done'));

    // Cellules de date : une vraie date, une répétition (« Chaque semaine »), « En continu »,
    // ou un moment lié aux prestations (« J-30 avant chaque date »). Ce qui reste incompris
    // n'est pas perdu : recopié dans le détail de la tâche.
    const unread = [];
    const label = (f) => rows[0][map[f]] || f;
    let repeat = null;
    let ongoing = false;
    const offsets = {};
    const date = (f) => {
      const v = get(row, f);
      if (!v) return null;
      const off = eventOffset(v);
      if (off != null) return (offsets[f] = off), null;
      if (ONGOING.test(v)) return (ongoing = true), null;
      const rep = findRepeat(v);
      if (rep && !/\d/.test(v)) return (repeat = { ...rep.repeat, ...(repeat?.days ? { days: repeat.days } : {}) }), null;
      const d = parseDateCell(v, now);
      if (!d) unread.push([label(f), v]);
      return d;
    };
    const d = date('date');
    const s = date('start');
    const e = date('end');
    t.start = s?.start || d?.start || e?.start || null;
    t.end = e?.end || d?.end || s?.end || null;
    if (s && e && e.end < s.start) t.end = s.start;

    // Heure : « 14h », « 9h-11h », ou des jours (« Mardi et vendredi », « Lundi matin »)
    const tv = get(row, 'time');
    const time = tv ? parseTimeCell(tv) : null;
    const days = tv && !time ? weekdaysIn(tv) : [];
    const part = tv && !time ? dayPartTime(tv) : null;
    if (time) {
      t.time = time.time;
      t.endTime = time.endTime || parseTimeCell(get(row, 'endTime'))?.time || null;
    } else if (part) t.time = part;
    if (tv && !time && !days.length && !part) unread.push([label('time'), tv]);

    const offs = Object.values(offsets);
    if (offs.length) {
      // modèle « pour chaque prestation » : J-30 → J-15, J+1 → J+7…
      t.perEvent = { from: Math.min(...offs), to: Math.max(...offs) };
      t.start = t.end = null;
    } else if (days.length) {
      const span = t.start && t.end ? diffDays(t.start, t.end) : Infinity;
      if (repeat || span > 7) repeat = { freq: 'week', days };
      else if (t.start) {
        // un jour précis dans une période courte : « Lundi » entre le 7 et le 13
        let x = t.start;
        while (x < t.end && !days.includes(fromISO(x).getDay())) x = addDays(x, 1);
        t.start = t.end = x;
      }
    }
    if (repeat && !t.perEvent) {
      // une vraie date d'échéance devient la fin de la série ; une échéance « Chaque semaine » n'en est pas une
      Object.assign(t, placeRepeat(repeat, { start: t.start, end: e ? t.end : null, now }));
    }
    if (ongoing && !t.perEvent && !repeat) t.ongoing = true; // fin fixée plus bas : dernière date du fichier
    const cv = get(row, 'category');
    t.category = cv ? categoryId(cv, categories) : null;
    if (cv && !t.category) t.categoryHint = cv; // nom inconnu : aide à deviner la catégorie
    if (unread.length) {
      t.notes = [t.notes, unread.map(([k, v]) => `${k} : ${v}`).join('\n')].filter(Boolean).join('\n');
      skipped.push({ line, reason: unread.map(([k, v]) => `${k} « ${v} »`).join(', '), kept: true });
    }
    tasks.push(t);
  });
  // « En continu » : jusqu'à la dernière date du fichier (la fin du rétroplanning)
  const horizon = tasks.reduce((m, t) => (!t.ongoing && !t.repeat && t.end > m ? t.end : m), '');
  for (const t of tasks.filter((x) => x.ongoing)) {
    t.start ||= toISO(now);
    t.end = horizon > t.start ? horizon : t.start;
    delete t.ongoing;
  }
  return { tasks, skipped };
}

const ONGOING = /\b(en\s+continu|en\s+permanence|permanent|toute\s+l['’]ann[ée]e|au\s+fil\s+de\s+l['’]eau|tout\s+le\s+temps|r[ée]guli[èe]rement)\b/iu;

/* ---------- Texte, une tâche par ligne ---------- */

const BULLET = /^\s*(?:[-*•–·▪➤>]|\d{1,3}[.)]|\[[ xX✓]?\]|[☐☑✓✔✅])\s*/;

export function tasksFromText(text, { now = new Date() } = {}) {
  const tasks = [];
  for (const raw of text.split(/\r?\n/)) {
    const done = /^\s*(?:[-*]\s*)?(?:\[[xX✓]\]|[☑✓✔✅])/.test(raw);
    const line = raw.replace(BULLET, '').replace(BULLET, '').trim();
    if (!line) continue;
    const dictationId = uid();
    for (const t of parseDictation(line, now)) tasks.push({ ...t, done, source: line, dictationId });
  }
  return { tasks, skipped: [] };
}

/* ---------- Sauvegarde Proello (.json) ---------- */

export function tasksFromBackup(data) {
  const list = Array.isArray(data) ? data : data && data.tasks;
  if (!Array.isArray(list)) throw new Error('not a backup');
  return { tasks: list.filter((t) => t && t.title && !t.deletedAt), skipped: [] };
}

/* ---------- Choix automatique de la source ---------- */

/**
 * @returns {{ kind: 'table'|'text'|'backup', tasks: object[], skipped: {line, reason, kept?}[] }}
 */
export function readImport(text, { name = '', categories = [], now = new Date() } = {}) {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) return { kind: 'text', tasks: [], skipped: [] };
  if (/\.json$/i.test(name) || /^[[{]/.test(trimmed)) {
    try {
      return { kind: 'backup', ...tasksFromBackup(JSON.parse(trimmed)) };
    } catch {
      if (/\.json$/i.test(name)) throw new Error('Fichier JSON illisible');
    }
  }
  const rows = parseTable(trimmed);
  if (rows.length && mapHeader(rows[0])) return { kind: 'table', ...tasksFromTable(rows, { categories, now }) };
  return { kind: 'text', ...tasksFromText(trimmed, { now }) };
}

/** Écarte les tâches déjà présentes (même identifiant, ou même titre aux mêmes dates) et les doublons de l'import. */
export function withoutDuplicates(incoming, existing) {
  const key = (t) => `${slug(t.title)}|${t.start || ''}|${t.end || t.start || ''}`;
  const ids = new Set(existing.map((t) => t.id));
  const keys = new Set(existing.map(key));
  const fresh = [];
  for (const t of incoming) {
    if ((t.id && ids.has(t.id)) || keys.has(key(t))) continue;
    keys.add(key(t));
    fresh.push(t);
  }
  return { fresh, duplicates: incoming.length - fresh.length };
}

/* ---------- Modèle de tableau à remplir ---------- */

const fr = (iso) => iso.split('-').reverse().join('/');

/** Fichier CSV modèle (séparateur « ; » et BOM : s'ouvre tel quel dans Excel en français). */
export function templateCSV(categories = [], now = new Date()) {
  const today = toISO(now);
  const cat = (i) => categories[i]?.name || '';
  const rows = [
    ['Titre', 'Urgent', 'Important', 'Début', 'Échéance', 'Heure', 'Catégorie', 'Détail', 'Terminée'],
    ['Appeler le comptable', 'oui', 'oui', '', fr(addDays(today, 1)), '10h', cat(6), 'Questions sur la TVA', ''],
    ['Préparer le dossier de subvention', '', 'oui', fr(addDays(today, 3)), fr(addDays(today, 7)), '', cat(0), '', ''],
    ['Réserver la salle', 'oui', '', '', 'vendredi', '14h-16h', cat(1), '', ''],
    ['Ranger le garage', '', '', '', '', '', cat(7), '', ''],
    ['Envoyer les factures', '', '', '', fr(addDays(today, -1)), '', '', '', 'oui'],
  ];
  const cell = (v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
