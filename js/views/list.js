// Vue 1 : to-do list complète, triée par priorité

import { QUADS, QUAD_ORDER, quadrantOf, sortTasks } from '../tasks.js';
import { relLabel, todayISO, fmtTime } from '../dates.js';
import { esc, lsGet, lsSet } from '../util.js';
import { catChip } from '../profile-ui.js';

const state = lsGet('proello.list', { filter: 'todo', quad: null });

export function dateChip(t) {
  if (!t.end && !t.time) return '';
  const time = t.time ? fmtTime(t.time, t.endTime) : '';
  if (!t.end) return `<span class="date-chip">${time}</span>`;
  const late = !t.done && t.end < todayISO();
  const range = t.start && t.start !== t.end ? `${esc(relLabel(t.start))} → ` : '';
  return `<span class="date-chip ${late ? 'late' : ''}">${late ? 'En retard · ' : ''}${range}${esc(relLabel(t.end))}${time ? ` · ${time}` : ''}</span>`;
}

/** Date compacte pour téléphone : « Auj. », « Dem. », « Ven. », précédée de « → » pour une période. */
const SHORT = (label) =>
  label
    .replace("Aujourd'hui", 'Auj.')
    .replace('Demain', 'Dem.')
    .replace(/^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)/, (w) => w.slice(0, 3) + '.');
function listDate(t) {
  const full = dateChip(t);
  if (!full || !t.end) return full;
  const late = !t.done && t.end < todayISO();
  const time = t.time ? ` ${fmtTime(t.time, t.endTime)}` : '';
  const range = t.start && t.start !== t.end ? '→ ' : '';
  return `<span class="date-chip d-long ${late ? 'late' : ''}">${full.replace(/^<span[^>]*>|<\/span>$/g, '')}</span><span class="date-chip d-short ${late ? 'late' : ''}">${late ? '⚠ ' : ''}${range}${esc(SHORT(relLabel(t.end)))}${time}</span>`;
}

/** Petit symbole indiquant qu'un détail (texte dicté, notes) est disponible en ouvrant la tâche. */
const hasDetail = (t) => (t.notes && t.notes.trim()) || (t.source && t.source.trim().toLowerCase() !== t.title.trim().toLowerCase());
const DETAIL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>';
export const detailMark = (t) => (hasDetail(t) ? `<span class="detail-mark" title="Détail disponible" aria-label="Détail disponible">${DETAIL_SVG}</span>` : '');

// tâches dont le détail est déplié dans la liste (le temps de la session)
const opened = new Set();
const detailBtn = (t) =>
  hasDetail(t)
    ? `<button class="detail-mark ${opened.has(t.id) ? 'on' : ''}" data-act="detail" aria-expanded="${opened.has(t.id)}" title="Voir le détail" aria-label="Voir le détail">${DETAIL_SVG}</button>`
    : '';
function detailText(t) {
  const notes = t.notes && t.notes.trim();
  const source = t.source && t.source.trim();
  const bare = (x) => (x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const showSource = source && bare(source) !== bare(t.title) && !bare(notes).includes(bare(source));
  return [notes, showSource ? `<i>Dicté : « ${esc(source)} »</i>` : '']
    .filter(Boolean)
    .map((x, i) => (i === 0 && x === notes ? esc(x) : x))
    .join('<br>');
}

function item(t) {
  const q = quadrantOf(t);
  return `<li class="task q-${q} ${t.done ? 'is-done' : ''}" data-id="${t.id}">
    <button class="check" data-act="done" aria-label="${t.done ? 'Marquer à faire' : 'Marquer comme terminée'}" aria-pressed="${t.done}"></button>
    <div class="task-body">
      <button class="task-title" data-act="edit">${esc(t.title)}</button>
      <div class="task-meta">
        ${catChip(t)}
        ${detailBtn(t)}
        ${listDate(t)}
        ${t.urgent ? '<button class="pill pill-u on" data-act="urgent" aria-pressed="true" title="Retirer « urgent »">Urgent</button>' : ''}
        ${t.important ? '<button class="pill pill-i on" data-act="important" aria-pressed="true" title="Retirer « important »">Important</button>' : ''}
      </div>
      ${opened.has(t.id) ? `<p class="task-detail">${detailText(t)}</p>` : ''}
    </div>
    <span class="q-tag" title="${QUADS[q].label}">${QUADS[q].short}</span>
  </li>`;
}

export function renderList(root, tasks, ctx) {
  const open = tasks.filter((t) => !t.done);
  const doneCount = tasks.length - open.length;
  const counts = Object.fromEntries(QUAD_ORDER.map((k) => [k, open.filter((t) => quadrantOf(t) === k).length]));

  let shown = tasks;
  if (state.filter === 'todo') shown = open;
  if (state.filter === 'done') shown = tasks.filter((t) => t.done);
  if (state.quad) shown = shown.filter((t) => quadrantOf(t) === state.quad);
  shown = sortTasks(shown);

  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  root.innerHTML = `
    <div class="summary">
      ${QUAD_ORDER.map(
        (k) => `<button class="sum q-${k} ${state.quad === k ? 'active' : ''}" data-quad="${k}" aria-pressed="${state.quad === k}">
          <b>${counts[k]}</b><span>${QUADS[k].short}</span></button>`
      ).join('')}
    </div>
    <div class="progress-row">
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Tâches terminées">
        <div style="width:${pct}%;background-size:${pct ? 10000 / pct : 100}% 100%"></div>
      </div>
      <span class="progress-label">${doneCount} / ${tasks.length} terminée${doneCount > 1 ? 's' : ''}</span>
    </div>
    <div class="list-toolbar">
      <div class="seg">
        <button data-filter="todo" class="${state.filter === 'todo' ? 'on' : ''}">À faire <small>${open.length}</small></button>
        <button data-filter="done" class="${state.filter === 'done' ? 'on' : ''}">Terminées <small>${doneCount}</small></button>
        <button data-filter="all" class="${state.filter === 'all' ? 'on' : ''}">Toutes</button>
      </div>
      ${state.quad ? `<button class="link" data-quad="${state.quad}">× ${QUADS[state.quad].label}</button>` : ''}
    </div>
    ${
      shown.length
        ? `<ul class="task-list">${shown.map(item).join('')}</ul>`
        : `<div class="empty">
            <div class="empty-art"></div>
            <p>${tasks.length ? 'Rien à afficher ici.' : 'Aucune tâche pour le moment.'}</p>
            <p class="muted">Appuie sur le micro et dicte tes tâches, en les séparant par « puis » ou « ensuite ».</p>
          </div>`
    }
    ${state.filter !== 'todo' && doneCount ? `<button class="link center" data-act="clear-done">Mettre les tâches terminées à la corbeille</button>` : ''}
  `;

  root.onclick = (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      state.filter = f.dataset.filter;
      lsSet('proello.list', state);
      return ctx.rerender();
    }
    const q = e.target.closest('[data-quad]');
    if (q) {
      state.quad = state.quad === q.dataset.quad ? null : q.dataset.quad;
      lsSet('proello.list', state);
      return ctx.rerender();
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'clear-done') return ctx.clearDone();
    const id = btn.closest('[data-id]')?.dataset.id;
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (btn.dataset.act === 'detail') {
      opened.has(id) ? opened.delete(id) : opened.add(id);
      return ctx.rerender();
    }
    if (btn.dataset.act === 'done') ctx.update(id, { done: !t.done });
    if (btn.dataset.act === 'urgent') ctx.update(id, { urgent: !t.urgent });
    if (btn.dataset.act === 'important') ctx.update(id, { important: !t.important });
    if (btn.dataset.act === 'edit') ctx.openEditor(id);
  };
}
