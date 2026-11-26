// Vue 2 : planning façon Gantt :
// - une ligne par tâche, son titre dans la colonne de gauche (petit, sur plusieurs lignes si besoin) ;
// - rien n'est écrit dans les barres, qui se déplacent / s'étirent au doigt ou à la souris ;
// - toutes les tâches datées sont affichées : la frise va de la plus ancienne à la plus lointaine
//   et se parcourt en faisant défiler (en largeur et en hauteur). Semaine / 2 semaines / Mois = zoom.

import { quadrantOf, sortTasks } from '../tasks.js';
import { todayISO, addDays, diffDays, fromISO, fmtShort, fmtTime } from '../dates.js';
import { renderDay, legendHtml } from './day.js';
import { esc, lsGet, lsSet } from '../util.js';
import { occurrences, describeRepeat } from '../repeat.js';

const SPANS = [
  { days: 7, label: 'Semaine', step: 7 },
  { days: 14, label: '2 semaines', step: 7 },
  { days: 31, label: 'Mois', step: 28 },
];
const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
// start : premier jour de la frise ; view : jour affiché au bord gauche ; span : nombre de jours visibles (zoom)
const state = { start: null, view: null, span: lsGet('proello.gantt.span', 14), day: null }; // day : vue journée ouverte
const MAX_DAYS = 1100; // garde-fou : environ trois ans de frise
const HOLD_MS = 1000; // appui long (au doigt) avant de pouvoir déplacer une barre
const drag = { armed: false };

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
        state.view = addDays(state.day, -1);
        state.span = span;
        state.day = null;
        lsSet('proello.gantt.span', span);
        ctx.rerender();
      },
    });
  }
  // jour au bord gauche : lu sur la frise déjà affichée (plus sûr que le dernier évènement de défilement)
  const old = root.querySelector('.gantt[data-from]');
  if (old) state.view = addDays(old.dataset.from, Math.round(old.scrollLeft / Number(old.dataset.dayW)));
  if (!state.view) state.view = addDays(today, -1);
  const zoom = state.span;
  const spanDef = SPANS.find((x) => x.days === zoom) || SPANS[1];
  const avail = Math.max(0, root.clientWidth - 2);
  // colonne des titres : étroite sur téléphone
  const nameW = avail < 520 ? 104 : avail < 900 ? 150 : 190;
  const dayW = Math.max(zoom > 14 ? 26 : 34, Math.floor((avail - nameW) / zoom));

  tasks = tasks.filter((t) => !t.perEvent); // modèles « pour chaque prestation » : pas de date propre
  const scheduled = tasks.filter((t) => t.start);
  // la frise couvre toutes les tâches datées (et au moins l'écran autour d'aujourd'hui), avec un peu de marge
  let from = addDays(today, -1);
  let to = addDays(today, zoom - 2);
  for (const t of scheduled) {
    const end = t.repeat ? t.repeat.until || t.start : t.end;
    if (t.start < from) from = t.start;
    if (end > to) to = end;
  }
  from = addDays(from, -1);
  to = addDays(to, 7);
  if (diffDays(from, to) > MAX_DAYS) from = addDays(to, -MAX_DAYS);
  state.start = from;
  const last = to;
  const span = diffDays(from, to) + 1;

  // tâche répétée : visible si une de ses occurrences tombe dans la frise
  const visible = scheduled.filter((t) => (t.repeat ? occurrences(t, from, last).length : t.end >= from && t.start <= last));
  const unscheduled = sortTasks(tasks.filter((t) => !t.start && !t.done));
  const days = Array.from({ length: span }, (_, i) => addDays(from, i));
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
      // tâche répétée : une petite barre par occurrence (on la modifie depuis sa fiche)
      const bars = t.repeat
        ? occurrences(t, state.start, last)
            .map((d) => {
              const i = diffDays(state.start, d);
              return `<button class="g-bar g-occ q-${q}" data-edit="${t.id}" style="${barStyle(barBox(i, i, span, dayW))}" title="${esc(t.title)} · ${esc(describeRepeat(t))}" aria-label="${esc(t.title)}, ${fmtShort(d)}"></button>`;
            })
            .join('')
        : `<div class="g-bar q-${q} ${t.done ? 'is-done' : ''} ${s < 0 ? 'clip-l' : ''} ${e > span - 1 ? 'clip-r' : ''}" data-id="${t.id}"
            style="${barStyle(barBox(s, e, span, dayW))}" title="${esc(t.title)}" aria-label="${esc(t.title)}">
            <i class="g-handle l"></i><i class="g-handle r"></i>
          </div>`;
      return `<div class="g-row ${t.done ? 'is-done' : ''}">
        <button class="g-name q-${q}" data-edit="${t.id}">${
          t.time || t.repeat ? `<small>${t.repeat ? '↻ ' : ''}${t.time ? fmtTime(t.time, t.endTime) : esc(describeRepeat(t))}</small>` : ''
        }<span>${esc(t.title)}</span></button>
        <div class="g-track">${bars}</div>
      </div>`;
    })
    .join('');

  const todayIdx = diffDays(state.start, today);

  root.innerHTML = `
    <div class="gantt-toolbar">
      <div class="seg">${SPANS.map((s) => `<button data-span="${s.days}" class="${s.days === zoom ? 'on' : ''}">${s.label}</button>`).join('')}</div>
      <div class="g-nav">
        <button class="icon-btn" data-nav="prev" aria-label="Plus tôt">‹</button>
        <button class="btn ghost small" data-nav="today">Aujourd'hui</button>
        <button class="icon-btn" data-nav="next" aria-label="Plus tard">›</button>
      </div>
      <span class="range-label"></span>
    </div>
    ${legendHtml()}
    <div class="gantt" data-from="${from}" data-day-w="${dayW}" style="--day-w:${dayW}px;--days:${span};--name-w:${nameW}px">
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

  // on revient au même jour qu'avant (aujourd'hui la première fois), même si la frise s'est allongée
  const box = root.querySelector('.gantt');
  const label = root.querySelector('.range-label');
  const shown = () => Math.max(1, Math.floor((box.clientWidth - nameW) / dayW));
  const showRange = () => {
    const a = addDays(from, Math.round(box.scrollLeft / dayW));
    const b = addDays(a, shown() - 1);
    // l'année quand on n'est plus dans l'année en cours
    const y = b.slice(0, 4) !== today.slice(0, 4) ? ` ${b.slice(0, 4)}` : '';
    label.textContent = `${fmtShort(a)} – ${fmtShort(b)}${y}`;
  };
  box.scrollLeft = Math.max(0, diffDays(from, state.view)) * dayW;
  showRange();
  box.onscroll = () => {
    state.view = addDays(from, Math.round(box.scrollLeft / dayW));
    showRange();
  };
  const scrollToDay = (d) => box.scrollTo({ left: Math.max(0, diffDays(from, d)) * dayW, behavior: 'smooth' });

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
      return scrollToDay(n === 'today' ? addDays(todayISO(), -1) : addDays(state.view, (n === 'next' ? 1 : -1) * spanDef.step));
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) return ctx.openEditor(edit.dataset.edit);
    const plan = e.target.closest('[data-plan]');
    if (plan) ctx.update(plan.dataset.plan, { start: todayISO(), end: todayISO() });
  };

  // Déplacer / étirer une barre :
  // - au doigt : appui long (HOLD_MS) ; la barre s'entoure progressivement, puis se met en surbrillance :
  //   elle est sélectionnée et suit alors le doigt. Un simple glissement fait défiler le planning sans rien changer ;
  // - à la souris : on peut la faire glisser tout de suite.
  // Un appui bref (sans bouger) ouvre la fiche de la tâche.
  root.oncontextmenu = (e) => e.target.closest('.g-bar') && e.preventDefault(); // pas de menu sur appui long
  if (!root.dataset.holdReady) {
    root.dataset.holdReady = '1';
    // une fois la barre sélectionnée, le doigt la déplace au lieu de faire défiler la page
    root.addEventListener('touchmove', (e) => drag.armed && e.preventDefault(), { passive: false });
  }

  root.onpointerdown = (ev) => {
    const bar = ev.target.closest('.g-bar:not(.g-occ)');
    if (!bar || ev.button > 0) return;
    const touch = ev.pointerType !== 'mouse';
    if (!touch) ev.preventDefault();
    const id = bar.dataset.id;
    const t = tasks.find((x) => x.id === id);
    const mode = ev.target.closest('.g-handle.l') ? 'start' : ev.target.closest('.g-handle.r') ? 'end' : 'move';
    const s0 = diffDays(state.start, t.start);
    const e0 = diffDays(state.start, t.end);
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let moved = false;
    let s = s0;
    let en = e0;
    drag.armed = !touch;
    let timer = 0;

    const arm = () => {
      drag.armed = true;
      bar.classList.remove('holding');
      bar.classList.add('armed');
      try {
        bar.setPointerCapture(ev.pointerId);
      } catch {}
      navigator.vibrate?.(25);
    };
    if (touch) {
      bar.classList.add('holding');
      bar.style.setProperty('--hold', `${HOLD_MS}ms`);
      timer = setTimeout(arm, HOLD_MS);
    } else bar.setPointerCapture(ev.pointerId);

    const cleanup = () => {
      clearTimeout(timer);
      drag.armed = false;
      bar.classList.remove('holding', 'armed');
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', finish);
      bar.removeEventListener('pointercancel', finish);
      bar.removeEventListener('lostpointercapture', finish);
    };

    const onMove = (e) => {
      const dx = e.clientX - x0;
      if (!drag.armed) {
        // le doigt bouge avant la fin de l'appui long : c'est un défilement, on n'y touche pas
        if (Math.abs(dx) > 8 || Math.abs(e.clientY - y0) > 8) (moved = true), cleanup();
        return;
      }
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
      bar.style.left = barBox(s, en, span, dayW).left + 'px';
      bar.style.width = barBox(s, en, span, dayW).width + 'px';
      bar.classList.add('dragging');
    };
    const finish = (e) => {
      const wasArmed = drag.armed;
      cleanup();
      if (e.type === 'pointercancel' || e.type === 'lostpointercapture') return wasArmed && moved ? ctx.rerender() : null;
      if (!moved) return wasArmed && touch ? null : ctx.openEditor(id);
      if (!wasArmed) return;
      if (s === s0 && en === e0) return ctx.rerender();
      ctx.update(id, { start: addDays(state.start, s), end: addDays(state.start, en) });
    };
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
  };
}
