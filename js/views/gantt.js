// Vue 2 : planning façon Gantt :
// - une ligne par tâche, son titre dans la colonne de gauche (petit, sur plusieurs lignes si besoin) ;
// - rien n'est écrit dans les barres, qui se déplacent / s'étirent au doigt ou à la souris ;
// - toutes les tâches datées sont affichées : la frise va de la plus ancienne à la plus lointaine
//   et se parcourt en faisant défiler (en largeur et en hauteur) ;
// - deux affichages : Semaine (7 jours, le lundi tout à gauche) et Mois (le 1er tout à gauche) ;
//   le défilement s'arrête toujours sur un lundi / un 1er du mois ;
// - les tâches terminées n'y figurent pas (elles restent dans la liste).

import { quadrantOf, sortTasks, sortPlanning } from '../tasks.js';
import { todayISO, addDays, diffDays, fromISO, fmtShort, fmtTime } from '../dates.js';
import { renderDay, legendHtml } from './day.js';
import { esc, lsGet, lsSet } from '../util.js';
import { occurrences, describeRepeat } from '../repeat.js';

const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
// start : premier jour de la frise ; view : jour affiché au bord gauche 
const state = { start: null, view: null, day: null }; // day : vue journée ouverte
const MODES = [
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
];
const fmtMonthLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const mondayOf = (d) => addDays(d, -((fromISO(d).getDay() + 6) % 7));
const firstOf = (d) => d.slice(0, 8) + '01';
/** 1er du mois décalé de n mois. */
function shiftMonth(d, n) {
  const y = +d.slice(0, 4);
  const m = +d.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}
const MAX_DAYS = 1100; // garde-fou : environ trois ans de frise
const HOLD_MS = 1000; // appui long (au doigt) avant de pouvoir déplacer une barre
const drag = { armed: false };

/** Position horizontale d'une barre (en px, dans la zone des jours). */
function barBox(s, e, span, dayW) {
  const a = Math.max(s, 0);
  const b = Math.min(e, span - 1);
  return { left: a * dayW + 1, width: Math.max(b - a + 1, 1) * dayW - 2 };
}
const barStyle = ({ left, width }) => `left:${left}px;width:${width}px`;

// Plein écran : en descendant dans le planning, la saisie, les filtres et la légende se cachent ;
// ils reviennent dès qu'on remonte. Après chaque bascule, on laisse la mise en page se stabiliser.
let winY = null;
let quietUntil = 0; // commun aux deux défilements (cadre et page) : cacher la saisie fait bouger la page
function focusTracker() {
  let last = 0;
  const set = (on) => {
    if (document.body.classList.contains('g-focus') === on) return;
    document.body.classList.toggle('g-focus', on);
    quietUntil = Date.now() + 350;
  };
  const track = (y) => {
    const d = y - last;
    if (Date.now() < quietUntil) return void (last = y);
    if (y < 8) set(false);
    else if (d > 6) set(true);
    else if (d < -6) set(false);
    last = y;
  };
  track.reset = (y) => (last = y);
  return track;
}

export function renderGantt(root, tasks, ctx) {
  const today = todayISO();
  // vue journée (heure par heure)
  if (state.day) {
    return renderDay(root, tasks, ctx, {
      day: state.day,
      spans: [{ days: 14, label: '← Planning' }],
      setDay: (d) => ((state.day = d), ctx.rerender()),
      leave: () => {
        state.view = state.day;
        state.day = null;
        ctx.rerender();
      },
    });
  }
  // jour au bord gauche : lu sur la frise déjà affichée (plus sûr que le dernier évènement de défilement)
  const old = root.querySelector('.gantt[data-from]');
  if (old && !state.jump) state.view = addDays(old.dataset.from, Math.round(old.scrollLeft / Number(old.dataset.dayW)));
  state.jump = false;
  const oldTop = old ? old.scrollTop : 0;
  if (!old) document.body.classList.remove('g-focus'); // on arrive sur le planning : tout est visible
  const compact = lsGet('proello.gantt.compact', false);
  const mode = lsGet('proello.gantt.mode', 'week') === 'month' ? 'month' : 'week';
  const month = mode === 'month';
  const periodStart = month ? firstOf : mondayOf; // début de semaine (lundi) ou de mois (1er)
  const nextPeriod = (d, n) => (month ? shiftMonth(d, n) : addDays(mondayOf(d), 7 * n));
  state.view = periodStart(state.view || today);
  const avail = Math.max(0, root.clientWidth - 2);
  // colonne des titres : étroite sur téléphone
  const nameW = avail < 520 ? 104 : avail < 900 ? 150 : 190;
  // la semaine ou le mois entier tient dans la largeur de l'écran
  const dayW = month ? Math.max(7, Math.floor((avail - nameW) / 31)) : Math.max(34, Math.floor((avail - nameW) / 7));

  tasks = tasks.filter((t) => !t.perEvent); // modèles « pour chaque prestation » : pas de date propre
  const scheduled = tasks.filter((t) => t.start && !t.done); // les terminées restent dans la liste, pas ici
  // la frise couvre toutes les tâches datées (et au moins l'écran autour d'aujourd'hui), avec un peu de marge
  let from = today;
  let to = today;
  for (const t of scheduled) {
    const end = t.repeat ? t.repeat.until || t.start : t.end;
    if (t.start < from) from = t.start;
    if (end > to) to = end;
  }
  // de quoi caler la dernière semaine / le dernier mois tout à gauche
  to = month ? addDays(shiftMonth(to, 1), 30) : addDays(mondayOf(to), 13);
  if (diffDays(from, to) > MAX_DAYS) from = addDays(to, -MAX_DAYS);
  from = periodStart(from);
  state.start = from;
  const last = to;
  const span = diffDays(from, to) + 1;

  // tâche répétée : visible si une de ses occurrences tombe dans la frise
  const visible = scheduled.filter((t) => (t.repeat ? occurrences(t, from, last).length : t.end >= from && t.start <= last));
  const unscheduled = sortTasks(tasks.filter((t) => !t.start && !t.done));
  const days = Array.from({ length: span }, (_, i) => addDays(from, i));
  // ordre des lignes : à faire aujourd'hui d'abord, puis priorité et proximité mêlées (voir sortPlanning)
  const rows = sortPlanning(visible, today);

  const head = days
    .map((d, i) => {
      const dt = fromISO(d);
      const wd = dt.getDay();
      const mo = i === 0 || dt.getDate() === 1 ? `<em>${fmtMonth.format(dt)}</em>` : '';
      const snap = month ? dt.getDate() === 1 : wd === 1; // points d'arrêt du défilement
      // au mois, les jours sont étroits : on n'écrit que le numéro des lundis (et aujourd'hui),
      // sauf en toute fin de mois où il déborderait sur le mois suivant
      const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      const num = !month || d === today || (wd === 1 && dt.getDate() <= lastDay - 2) ? `<b>${dt.getDate()}</b>` : '';
      return `<button class="g-day ${wd === 0 || wd === 6 ? 'we' : ''} ${d === today ? 'today' : ''} ${snap ? 'snap' : ''}" data-day="${d}" aria-label="Voir la journée du ${fmtShort(d)}">${mo}<span>${WD[wd]}</span>${num}</button>`;
    })
    .join('');

  const grid = days
    .map((d) => {
      const wd = fromISO(d).getDay();
      return `<div class="${wd === 0 || wd === 6 ? 'we' : ''} ${d === today ? 'today' : ''}"></div>`;
    })
    .join('');

  const rowHtml = (t) => {
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
  };

  const rowsHtml = rows.map(rowHtml).join('');

  const todayIdx = diffDays(state.start, today);

  root.innerHTML = `
    <div class="gantt-toolbar">
      <div class="seg">${MODES.map((m) => `<button data-mode="${m.id}" class="${m.id === mode ? 'on' : ''}">${m.label}</button>`).join('')}</div>
      <button class="btn ghost small compact-btn ${compact ? 'on' : ''}" data-compact aria-pressed="${compact}" title="Lignes plus serrées pour voir plus de tâches">☰ Compact</button>
      <div class="g-nav">
        <button class="icon-btn" data-nav="prev" aria-label="Plus tôt">‹</button>
        <button class="btn ghost small" data-nav="today">Aujourd'hui</button>
        <button class="icon-btn" data-nav="next" aria-label="Plus tard">›</button>
      </div>
      <span class="range-label"></span>
    </div>
    ${legendHtml()}
    <div class="gantt ${mode} ${compact ? 'compact' : ''}" data-from="${from}" data-day-w="${dayW}" style="--day-w:${dayW}px;--days:${span};--name-w:${nameW}px">
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
    if (month) return (label.textContent = fmtMonthLong.format(fromISO(addDays(a, Math.floor(shown() / 2)))));
    const b = addDays(a, Math.min(shown(), 7) - 1);
    // l'année quand on n'est plus dans l'année en cours
    const y = b.slice(0, 4) !== today.slice(0, 4) ? ` ${b.slice(0, 4)}` : '';
    label.textContent = `${fmtShort(a)} – ${fmtShort(b)}${y}`;
  };
  box.scrollLeft = Math.max(0, diffDays(from, state.view)) * dayW;
  box.scrollTop = oldTop;
  showRange();
  const boxY = focusTracker();
  boxY.reset(box.scrollTop);
  box.onscroll = () => {
    state.view = addDays(from, Math.round(box.scrollLeft / dayW));
    showRange();
    boxY(box.scrollTop);
  };
  if (!winY) {
    winY = focusTracker();
    addEventListener('scroll', () => document.body.dataset.view === 'gantt' && !state.day && winY(scrollY), { passive: true });
  }
  winY.reset(scrollY);
  // revenu tout en haut (ex. après un changement d'affichage) : on réaffiche tout
  if (box.scrollTop < 8 && scrollY < 8) document.body.classList.remove('g-focus');
  // saut direct (un défilement animé se bat avec l'arrêt sur les lundis)
  const scrollToDay = (d) => {
    box.scrollLeft = Math.max(0, diffDays(from, d)) * dayW;
    state.view = d < from ? from : d;
    showRange();
  };

  root.onclick = (e) => {
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn) {
      state.day = dayBtn.dataset.day;
      return ctx.rerender();
    }
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      lsSet('proello.gantt.mode', modeBtn.dataset.mode);
      state.view = today; // on recale sur la semaine / le mois en cours
      state.jump = true;
      return ctx.rerender();
    }
    if (e.target.closest('[data-compact]')) {
      lsSet('proello.gantt.compact', !compact);
      return ctx.rerender();
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const n = nav.dataset.nav;
      const cur = periodStart(state.view < from ? from : state.view);
      return scrollToDay(n === 'today' ? periodStart(todayISO()) : nextPeriod(cur, n === 'next' ? 1 : -1));
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
