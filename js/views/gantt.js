// Vue 2 : planning façon Gantt :
// - une ligne par tâche, son titre dans la colonne de gauche (petit, sur plusieurs lignes si besoin) ;
// - rien n'est écrit dans les barres, qui se déplacent / s'étirent au doigt ou à la souris.

import { quadrantOf, sortTasks } from '../tasks.js';
import { todayISO, addDays, diffDays, fromISO, fmtShort, fmtTime } from '../dates.js';
import { renderDay, legendHtml } from './day.js';
import { esc, lsGet, lsSet } from '../util.js';

const SPANS = [
  { days: 7, label: 'Semaine', step: 7 },
  { days: 14, label: '2 semaines', step: 7 },
  { days: 31, label: 'Mois', step: 28 },
];
const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const state = { start: null, span: lsGet('proello.gantt.span', 14), day: null }; // day : vue journée ouverte

/** Position horizontale d'une barre (en px, dans la zone des jours). */
function barBox(s, e, span, dayW) {
  const a = Math.max(s, 0);
  const b = Math.min(e, span - 1);
  return { left: a * dayW + 3, width: Math.max(b - a + 1, 1) * dayW - 6 };
}
const barStyle = ({ left, width }) => `left:${left}px;width:${width}px`;

export function renderGantt(root, tasks, ctx) {
  const today = todayISO();
  // vue journée (heure par heure)
  if (state.day) {
    return renderDay(root, tasks, ctx, {
      day: state.day,
      spans: SPANS,
      setDay: (d) => ((state.day = d), ctx.rerender()),
      leave: (span) => {
        state.start = addDays(state.day, -1);
        state.span = span;
        state.day = null;
        lsSet('proello.gantt.span', span);
        ctx.rerender();
      },
    });
  }
  if (!state.start) state.start = addDays(today, -1);
  const span = state.span;
  const spanDef = SPANS.find((s) => s.days === span) || SPANS[1];
  const last = addDays(state.start, span - 1);
  const avail = Math.max(0, root.clientWidth - 2);
  // colonne des titres : étroite sur téléphone
  const nameW = avail < 520 ? 104 : avail < 900 ? 150 : 190;
  const dayW = Math.max(span > 14 ? 26 : 34, Math.floor((avail - nameW) / span));
  const prevScroll = root.querySelector('.gantt')?.scrollLeft;

  const scheduled = tasks.filter((t) => t.start);
  const visible = scheduled.filter((t) => t.end >= state.start && t.start <= last);
  const before = scheduled.filter((t) => t.end < state.start && !t.done).sort((a, b) => (a.end < b.end ? 1 : -1));
  const after = scheduled.filter((t) => t.start > last && !t.done).sort((a, b) => (a.start < b.start ? -1 : 1));
  const unscheduled = sortTasks(tasks.filter((t) => !t.start && !t.done));
  const days = Array.from({ length: span }, (_, i) => addDays(state.start, i));
  // ordre des lignes : à faire d'abord, puis par date de début, puis par priorité
  const rows = sortTasks(visible).sort((x, y) => Number(x.done) - Number(y.done) || (x.start < y.start ? -1 : x.start > y.start ? 1 : 0));

  const head = days
    .map((d, i) => {
      const dt = fromISO(d);
      const wd = dt.getDay();
      const month = i === 0 || dt.getDate() === 1 ? `<em>${fmtMonth.format(dt)}</em>` : '';
      return `<button class="g-day ${wd === 0 || wd === 6 ? 'we' : ''} ${d === today ? 'today' : ''}" data-day="${d}" aria-label="Voir la journée du ${fmtShort(d)}">${month}<span>${WD[wd]}</span><b>${dt.getDate()}</b></button>`;
    })
    .join('');

  const grid = days
    .map((d) => {
      const wd = fromISO(d).getDay();
      return `<div class="${wd === 0 || wd === 6 ? 'we' : ''} ${d === today ? 'today' : ''}"></div>`;
    })
    .join('');

  const rowsHtml = rows
    .map((t) => {
      const s = diffDays(state.start, t.start);
      const e = diffDays(state.start, t.end);
      const q = quadrantOf(t);
      return `<div class="g-row ${t.done ? 'is-done' : ''}">
        <button class="g-name q-${q}" data-edit="${t.id}">${t.time ? `<small>${fmtTime(t.time, t.endTime)}</small>` : ''}<span>${esc(t.title)}</span></button>
        <div class="g-track">
          <div class="g-bar q-${q} ${t.done ? 'is-done' : ''} ${s < 0 ? 'clip-l' : ''} ${e > span - 1 ? 'clip-r' : ''}" data-id="${t.id}"
            style="${barStyle(barBox(s, e, span, dayW))}" title="${esc(t.title)}" aria-label="${esc(t.title)}">
            <i class="g-handle l"></i><i class="g-handle r"></i>
          </div>
        </div>
      </div>`;
    })
    .join('');

  const todayIdx = diffDays(state.start, today);
  const outside =
    before.length || after.length
      ? `<div class="g-outside">
          ${before.length ? `<button class="link" data-jump="${before[0].start}">‹ ${before.length} tâche${before.length > 1 ? 's' : ''} plus tôt</button>` : '<span></span>'}
          ${after.length ? `<button class="link" data-jump="${after[0].start}">${after.length} tâche${after.length > 1 ? 's' : ''} plus tard ›</button>` : ''}
        </div>`
      : '';

  root.innerHTML = `
    <div class="gantt-toolbar">
      <div class="seg">${SPANS.map((s) => `<button data-span="${s.days}" class="${s.days === span ? 'on' : ''}">${s.label}</button>`).join('')}</div>
      <div class="g-nav">
        <button class="icon-btn" data-nav="prev" aria-label="Période précédente">‹</button>
        <button class="btn ghost small" data-nav="today">Aujourd'hui</button>
        <button class="icon-btn" data-nav="next" aria-label="Période suivante">›</button>
      </div>
      <span class="range-label">${fmtShort(state.start)} – ${fmtShort(last)}</span>
    </div>
    ${legendHtml()}
    <div class="gantt" style="--day-w:${dayW}px;--days:${span};--name-w:${nameW}px">
      <div class="g-inner">
        <div class="g-head"><div class="g-corner">Tâches</div>${head}</div>
        <div class="g-body">
          <div class="g-grid">${grid}</div>
          ${todayIdx >= 0 && todayIdx < span ? `<div class="g-now" style="left:calc(var(--name-w) + ${(todayIdx + 0.5) * dayW}px)"></div>` : ''}
          ${
            rows.length
              ? rowsHtml
              : `<p class="g-empty">${
                  scheduled.length
                    ? 'Aucune tâche sur cette période.'
                    : 'Aucune tâche planifiée. Donne une date à une tâche (ou dis « demain », « vendredi »… en la dictant).'
                }</p>`
          }
        </div>
      </div>
    </div>
    ${outside}
    ${
      unscheduled.length
        ? `<section class="unscheduled">
            <h3>Non planifiées <small>${unscheduled.length}</small></h3>
            <ul>${unscheduled
              .map(
                (t) => `<li class="q-${quadrantOf(t)}">
                  <button class="u-title" data-edit="${t.id}">${esc(t.title)}</button>
                  <button class="btn ghost small" data-plan="${t.id}">+ Aujourd'hui</button>
                </li>`
              )
              .join('')}</ul>
          </section>`
        : ''
    }
  `;

  if (prevScroll != null) root.querySelector('.gantt').scrollLeft = prevScroll;

  root.onclick = (e) => {
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn) {
      state.day = dayBtn.dataset.day;
      return ctx.rerender();
    }
    const spanBtn = e.target.closest('[data-span]');
    if (spanBtn) {
      state.span = Number(spanBtn.dataset.span);
      lsSet('proello.gantt.span', state.span);
      return ctx.rerender();
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const n = nav.dataset.nav;
      state.start = n === 'today' ? addDays(todayISO(), -1) : addDays(state.start, (n === 'next' ? 1 : -1) * spanDef.step);
      return ctx.rerender();
    }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      state.start = addDays(jump.dataset.jump, -1);
      return ctx.rerender();
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) return ctx.openEditor(edit.dataset.edit);
    const plan = e.target.closest('[data-plan]');
    if (plan) ctx.update(plan.dataset.plan, { start: todayISO(), end: todayISO() });
  };

  root.onpointerdown = (ev) => {
    const bar = ev.target.closest('.g-bar');
    if (!bar || ev.button > 0) return;
    ev.preventDefault();
    const id = bar.dataset.id;
    const t = tasks.find((x) => x.id === id);
    const mode = ev.target.closest('.g-handle.l') ? 'start' : ev.target.closest('.g-handle.r') ? 'end' : 'move';
    const s0 = diffDays(state.start, t.start);
    const e0 = diffDays(state.start, t.end);
    const x0 = ev.clientX;
    let moved = false;
    let s = s0;
    let en = e0;
    bar.setPointerCapture(ev.pointerId);

    const onMove = (e) => {
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 5) moved = true;
      if (!moved) return;
      const delta = Math.round(dx / dayW);
      s = s0;
      en = e0;
      if (mode === 'move') {
        s += delta;
        en += delta;
      } else if (mode === 'start') s = Math.min(s0 + delta, e0);
      else en = Math.max(e0 + delta, s0);
      bar.style.cssText = barStyle(barBox(s, en, span, dayW));
      bar.classList.add('dragging');
    };
    const finish = (e) => {
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', finish);
      bar.removeEventListener('pointercancel', finish);
      if (e.type === 'pointercancel') return ctx.rerender();
      if (!moved) return ctx.openEditor(id);
      if (s === s0 && en === e0) return ctx.rerender();
      ctx.update(id, { start: addDays(state.start, s), end: addDays(state.start, en) });
    };
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
  };
}
