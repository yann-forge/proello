// Vue journée du planning : agenda heure par heure à gauche, tâches « Sans horaire » à droite.
//
// - Une tâche avec horaire est placée à son heure sur son dernier jour (le jour de l'échéance) ;
//   les autres jours de sa période, elle apparaît dans « Sans horaire » avec son échéance.
// - Sans heure de fin, une tâche dure 1 h. Les tâches qui se chevauchent se partagent la largeur.

import { QUADS, QUAD_ORDER, quadrantOf } from '../tasks.js';
import { todayISO, addDays, fromISO, fmtShort, fmtTime } from '../dates.js';
import { esc } from '../util.js';
import { occurrences } from '../repeat.js';

const HOUR_H = 52; // hauteur d'une heure (px)
const DEFAULT_START = 7;
const DEFAULT_END = 21;
// libellés de la légende propres au planning (même ordre que la matrice : 2 × 2)
const LEGEND = { later: 'Si tu as le temps' };

export const legendHtml = () => `<ul class="g-legend" aria-label="Légende des couleurs">
  ${QUAD_ORDER.map((k) => `<li class="q-${k}"><i></i>${LEGEND[k] || QUADS[k].label}</li>`).join('')}
</ul>`;

const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Répartit les tâches qui se chevauchent en colonnes (comme un agenda). */
function columns(events) {
  events.sort((a, b) => a.from - b.from || b.to - a.to);
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = [];
    for (const ev of cluster) {
      let c = cols.findIndex((end) => end <= ev.from);
      if (c < 0) c = cols.push(0) - 1;
      cols[c] = ev.to;
      ev.col = c;
    }
    cluster.forEach((ev) => (ev.cols = cols.length));
    cluster = [];
  };
  for (const ev of events) {
    if (cluster.length && ev.from >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.to);
  }
  flush();
  return events;
}

/**
 * @param {HTMLElement} root
 * @param {object[]} tasks
 * @param {object} ctx      contexte des vues (openEditor, rerender…)
 * @param {object} nav      { day, spans, setDay(iso), leave(spanDays) }
 */
export function renderDay(root, tasks, ctx, nav) {
  const day = nav.day;
  const today = todayISO();
  const onDay = (t) => (t.repeat ? occurrences(t, day, day).length > 0 : t.start <= day && (t.end || t.start) >= day);
  const ofDay = tasks.filter((t) => t.start && !t.perEvent && onDay(t));
  const timed = ofDay.filter((t) => t.time && (t.repeat || (t.end || t.start) === day));
  const untimed = ofDay.filter((t) => !timed.includes(t)).sort((a, b) => Number(a.done) - Number(b.done) || QUAD_ORDER.indexOf(quadrantOf(a)) - QUAD_ORDER.indexOf(quadrantOf(b)));

  const events = columns(
    timed.map((t) => {
      const from = minutes(t.time);
      const to = t.endTime ? minutes(t.endTime) : from + 60;
      return { t, from, to: Math.max(to, from + 30) };
    })
  );

  let startH = DEFAULT_START;
  let endH = DEFAULT_END;
  for (const ev of events) {
    startH = Math.min(startH, Math.floor(ev.from / 60));
    endH = Math.max(endH, Math.ceil(ev.to / 60));
  }
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const top = (mins) => ((mins - startH * 60) / 60) * HOUR_H;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const showNow = day === today && nowMins >= startH * 60 && nowMins <= endH * 60;

  const evHtml = events
    .map(({ t, from, to, col, cols }) => {
      const h = Math.max(26, top(to) - top(from) - 3);
      return `<button class="day-ev q-${quadrantOf(t)} ${t.done ? 'is-done' : ''} ${h < 40 ? 'short' : ''}" data-edit="${t.id}"
        style="top:${top(from) + 1}px;height:${h}px;left:calc(${(col / cols) * 100}% + 2px);width:calc(${100 / cols}% - 4px)">
        <b>${fmtTime(t.time, t.endTime)}</b><span>${esc(t.title)}</span>
      </button>`;
    })
    .join('');

  const untimedHtml = untimed.length
    ? `<ul>${untimed
        .map((t) => {
          const end = t.repeat ? day : t.end || t.start;
          const note =
            end !== day ? `→ ${end === addDays(day, 1) ? 'demain' : fmtShort(end)}${t.time ? ' ' + fmtTime(t.time) : ''}` : t.start !== day ? 'dernier jour' : '';
          return `<li><button class="day-card q-${quadrantOf(t)} ${t.done ? 'is-done' : ''}" data-edit="${t.id}">
            <span>${esc(t.title)}</span>${note ? `<small>${note}</small>` : ''}
          </button></li>`;
        })
        .join('')}</ul>`
    : '<p class="day-none">Rien d’autre ce jour-là.</p>';

  const label = fmtLong.format(fromISO(day));

  root.innerHTML = `
    <div class="gantt-toolbar">
      <div class="seg">
        ${nav.spans.map((s) => `<button data-span="${s.days}">${s.label}</button>`).join('')}
      </div>
      <div class="g-nav">
        <button class="icon-btn" data-day-nav="-1" aria-label="Jour précédent">‹</button>
        <button class="btn ghost small" data-day-nav="0">Aujourd'hui</button>
        <button class="icon-btn" data-day-nav="1" aria-label="Jour suivant">›</button>
      </div>
      <span class="range-label">${label[0].toUpperCase() + label.slice(1)}</span>
    </div>
    ${legendHtml()}
    <div class="day">
      <div class="day-scroll">
        <div class="day-agenda" style="height:${hours.length * HOUR_H}px">
          ${hours.map((h) => `<div class="day-hour" style="top:${top(h * 60)}px"><span>${h}h</span></div>`).join('')}
          <div class="day-events">${evHtml}</div>
          ${showNow ? `<div class="day-now" style="top:${top(nowMins)}px"></div>` : ''}
          ${events.length ? '' : '<p class="day-empty">Aucune tâche à heure fixe.<br>Dis « à 14h », « de 9h à 11h »… en dictant.</p>'}
        </div>
      </div>
      <aside class="day-untimed">
        <h4>Sans horaire <small>${untimed.length || ''}</small></h4>
        ${untimedHtml}
      </aside>
    </div>`;

  // ouvre l'agenda sur l'heure utile : maintenant (aujourd'hui) ou la première tâche
  const scroller = root.querySelector('.day-scroll');
  // hauteur : tout l'espace libre jusqu'à la barre d'onglets (téléphone) ou au bas de l'écran
  const nav2 = window.innerWidth <= 760 ? document.querySelector('.tabs') : null;
  const bottom = nav2 ? nav2.getBoundingClientRect().top - 8 : window.innerHeight - 16;
  scroller.style.maxHeight = Math.max(240, bottom - (scroller.getBoundingClientRect().top + window.scrollY)) + 'px';
  const focus = showNow ? nowMins : events.length ? events[0].from : 8 * 60;
  scroller.scrollTop = Math.max(0, top(focus) - HOUR_H);

  root.onpointerdown = null;
  root.onclick = (e) => {
    const span = e.target.closest('[data-span]');
    if (span) return nav.leave(Number(span.dataset.span));
    const dn = e.target.closest('[data-day-nav]');
    if (dn) return nav.setDay(dn.dataset.dayNav === '0' ? todayISO() : addDays(day, Number(dn.dataset.dayNav)));
    const edit = e.target.closest('[data-edit]');
    if (edit) ctx.openEditor(edit.dataset.edit);
  };
}
