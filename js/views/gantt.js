// Vue 2 : planning façon Gantt, « épuré » :
// - pas de colonne de noms : chaque titre n'est écrit qu'une fois, dans sa barre ou juste à côté ;
// - les tâches qui ne se chevauchent pas (titre compris) partagent la même ligne, côte à côte ;
// - les barres se déplacent / s'étirent au doigt ou à la souris.

import { quadrantOf, sortTasks } from '../tasks.js';
import { todayISO, addDays, diffDays, fromISO, fmtShort } from '../dates.js';
import { esc, lsGet, lsSet } from '../util.js';

const SPANS = [
  { days: 7, label: 'Semaine', step: 7 },
  { days: 14, label: '2 semaines', step: 7 },
  { days: 31, label: 'Mois', step: 28 },
];
const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const state = { start: null, span: lsGet('proello.gantt.span', 14) };

const LANE_H = 40; // hauteur d'une ligne
const BAR_H = 30;
const PAD = 10; // marge en haut et en bas du planning
const GAP = 10; // espace minimal entre deux tâches sur une même ligne
const LABEL_GAP = 6; // espace entre une barre et son titre écrit à côté

// Mesure de la largeur d'un titre (pour savoir s'il tient dans sa barre)
let ctx2d = null;
function textWidth(text, weight) {
  ctx2d ||= document.createElement('canvas').getContext('2d');
  ctx2d.font = `${weight} 13px Nunito, ui-rounded, system-ui, sans-serif`;
  return Math.ceil(ctx2d.measureText(text).width);
}

/**
 * Place chaque tâche visible : position de la barre, titre dedans / à droite / à gauche, et ligne.
 * Une ligne accueille plusieurs tâches tant que leurs zones (barre + titre) ne se touchent pas.
 */
function layout(tasks, span, dayW) {
  const totalW = span * dayW;
  const items = tasks.map((t) => {
    const s = diffDays(state.start, t.start);
    const e = diffDays(state.start, t.end);
    const a = Math.max(s, 0);
    const b = Math.min(e, span - 1);
    const left = a * dayW + 3;
    const width = Math.max(b - a + 1, 1) * dayW - 6;
    const label = textWidth(t.title, 800);
    let mode = 'in';
    let occL = left;
    let occR = left + width;
    if (width < label + 22) {
      if (left + width + LABEL_GAP + label <= totalW) {
        mode = 'right';
        occR = left + width + LABEL_GAP + label;
      } else if (left - LABEL_GAP - label >= 0) {
        mode = 'left';
        occL = left - LABEL_GAP - label;
      }
    }
    return { t, s, e, left, width, mode, occL, occR };
  });

  // tri : début, puis tâches longues d'abord ; les terminées en dernier
  items.sort((x, y) => Number(x.t.done) - Number(y.t.done) || x.occL - y.occL || y.occR - x.occR);
  const lanes = []; // bord droit occupé de chaque ligne
  for (const it of items) {
    let lane = lanes.findIndex((r) => r + GAP <= it.occL);
    if (lane < 0) lane = lanes.push(-Infinity) - 1;
    lanes[lane] = it.occR;
    it.lane = lane;
  }
  return { items, lanes: lanes.length };
}

const barStyle = (left, width, lane) => `left:${left}px;width:${width}px;top:${PAD + lane * LANE_H + (LANE_H - BAR_H) / 2}px`;

export function renderGantt(root, tasks, ctx) {
  const today = todayISO();
  if (!state.start) state.start = addDays(today, -1);
  const span = state.span;
  const spanDef = SPANS.find((s) => s.days === span) || SPANS[1];
  const last = addDays(state.start, span - 1);
  const avail = Math.max(0, root.clientWidth - 2);
  const dayW = Math.max(span > 14 ? 30 : 40, Math.floor(avail / span));
  const prevScroll = root.querySelector('.gantt')?.scrollLeft;

  const scheduled = tasks.filter((t) => t.start);
  const visible = scheduled.filter((t) => t.end >= state.start && t.start <= last);
  const before = scheduled.filter((t) => t.end < state.start && !t.done).sort((a, b) => (a.end < b.end ? 1 : -1));
  const after = scheduled.filter((t) => t.start > last && !t.done).sort((a, b) => (a.start < b.start ? -1 : 1));
  const unscheduled = sortTasks(tasks.filter((t) => !t.start && !t.done));
  const days = Array.from({ length: span }, (_, i) => addDays(state.start, i));
  const { items, lanes } = layout(visible, span, dayW);

  const head = days
    .map((d, i) => {
      const dt = fromISO(d);
      const wd = dt.getDay();
      const month = i === 0 || dt.getDate() === 1 ? `<em>${fmtMonth.format(dt)}</em>` : '';
      return `<div class="g-day ${wd === 0 || wd === 6 ? 'we' : ''} ${d === today ? 'today' : ''}">${month}<span>${WD[wd]}</span><b>${dt.getDate()}</b></div>`;
    })
    .join('');

  const grid = days
    .map((d) => {
      const wd = fromISO(d).getDay();
      return `<div class="${wd === 0 || wd === 6 ? 'we' : ''} ${d === today ? 'today' : ''}"></div>`;
    })
    .join('');

  const bars = items
    .map(
      ({ t, s, e, left, width, mode, lane }) => `<div class="g-bar q-${quadrantOf(t)} lbl-${mode} ${t.done ? 'is-done' : ''} ${s < 0 ? 'clip-l' : ''} ${
        e > span - 1 ? 'clip-r' : ''
      }" data-id="${t.id}" data-lane="${lane}" style="${barStyle(left, width, lane)}" title="${esc(t.title)}">
        <i class="g-handle l"></i><span class="g-label">${esc(t.title)}</span><i class="g-handle r"></i>
      </div>`
    )
    .join('');

  const todayIdx = diffDays(state.start, today);
  const bodyH = Math.max(lanes, 2) * LANE_H + PAD * 2;
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
    <div class="gantt" style="--day-w:${dayW}px;--days:${span}">
      <div class="g-inner">
        <div class="g-head">${head}</div>
        <div class="g-body" style="height:${bodyH}px">
          <div class="g-grid">${grid}</div>
          ${todayIdx >= 0 && todayIdx < span ? `<div class="g-now" style="left:${(todayIdx + 0.5) * dayW}px"></div>` : ''}
          ${bars}
          ${
            items.length
              ? ''
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
    const lane = Number(bar.dataset.lane);
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
      const a = Math.max(s, 0);
      const b = Math.min(en, span - 1);
      bar.style.cssText = barStyle(a * dayW + 3, Math.max(b - a + 1, 1) * dayW - 6, lane);
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
