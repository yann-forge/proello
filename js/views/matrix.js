// Vue 3 : matrice d'Eisenhower. Glisser-déposer d'un cadran à l'autre (poignée ⋮⋮ sur mobile, carte entière à la souris).

import { QUADS, quadrantOf, sortTasks } from '../tasks.js';
import { esc } from '../util.js';
import { dateChip, detailMark } from './list.js';
import { catChip, catDot } from '../profile-ui.js';
import { relLabel, todayISO, fmtTime } from '../dates.js';

let suppressClick = false;

/** Date courte pour les petites cartes du téléphone : « Auj. », « Dem. », « Jeu. », « 12 déc. » */
function shortDate(t) {
  if (!t.end) return t.time ? `<span class="mx-date">${fmtTime(t.time)}</span>` : '';
  const late = !t.done && t.end < todayISO();
  const label = relLabel(t.end)
    .replace("Aujourd'hui", 'Auj.')
    .replace('Demain', 'Dem.')
    .replace('Hier', 'Hier')
    .replace(/^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)$/, (w) => w.slice(0, 3) + '.');
  return `<span class="mx-date ${late ? 'late' : ''}">${late ? '⚠ ' : ''}${label}${t.time ? ' ' + fmtTime(t.time) : ''}</span>`;
}

const card = (t) => `<li class="mx-card" data-id="${t.id}">
  <button class="check" data-act="done" aria-label="Marquer comme terminée"></button>
  <button class="mx-title" data-act="edit"><span class="mx-text">${esc(t.title)}</span>${
    t.end || t.time || t.notes || t.category
      ? `<span class="mx-meta">${catChip(t)}${detailMark(t)}${dateChip(t)}</span><span class="mx-mini">${catDot(t)}${shortDate(t)}</span>`
      : ''
  }</button>
  <span class="grip" aria-label="Déplacer" title="Glisser vers un autre cadran"></span>
</li>`;

export function renderMatrix(root, tasks, ctx) {
  const by = { do: [], plan: [], delegate: [], later: [] };
  sortTasks(tasks.filter((t) => !t.done)).forEach((t) => by[quadrantOf(t)].push(t));

  const quad = (k) => `<section class="quad q-${k}" data-quad="${k}">
    <header><div><h3>${QUADS[k].label}</h3><p>${QUADS[k].sub}</p></div><span class="count">${by[k].length}</span></header>
    ${by[k].length ? `<ul class="mx-list">${by[k].map(card).join('')}</ul>` : `<p class="mx-empty">${QUADS[k].empty}</p>`}
  </section>`;

  root.innerHTML = `
    <div class="matrix">
      <div></div><div class="ax ax-top">Urgent</div><div class="ax ax-top">Pas urgent</div>
      <div class="ax ax-side"><span>Important</span></div>${quad('do')}${quad('plan')}
      <div class="ax ax-side"><span>Pas important</span></div>${quad('delegate')}${quad('later')}
    </div>
    <p class="hint">Glisse une tâche vers un autre cadran pour changer sa priorité.</p>`;
  fitToScreen(root);

  root.onclick = (e) => {
    if (suppressClick) return;
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    if (btn.dataset.act === 'done') ctx.update(id, { done: true });
    if (btn.dataset.act === 'edit') ctx.openEditor(id);
  };

  root.onpointerdown = (ev) => {
    const el = ev.target.closest('.mx-card');
    if (!el || ev.button > 0 || ev.target.closest('.check')) return;
    const onGrip = !!ev.target.closest('.grip');
    if (ev.pointerType !== 'mouse' && !onGrip) return;
    if (onGrip) ev.preventDefault();

    const id = el.dataset.id;
    const rect = el.getBoundingClientRect();
    const offX = ev.clientX - rect.left;
    const offY = ev.clientY - rect.top;
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let ghost = null;
    let target = null;

    const onMove = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
        ghost = el.cloneNode(true);
        ghost.classList.add('mx-ghost');
        ghost.style.width = rect.width + 'px';
        document.body.appendChild(ghost);
        el.classList.add('placeholder');
      }
      e.preventDefault();
      ghost.style.transform = `translate(${e.clientX - offX}px, ${e.clientY - offY}px) rotate(-2deg)`;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.quad');
      if (over !== target) {
        target?.classList.remove('drop-hover');
        target = over;
        target?.classList.add('drop-hover');
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!ghost) return;
      ghost.remove();
      el.classList.remove('placeholder');
      target?.classList.remove('drop-hover');
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 50);
      const k = target?.dataset.quad;
      if (k) {
        const t = tasks.find((x) => x.id === id);
        if (quadrantOf(t) !== k) ctx.update(id, { urgent: QUADS[k].urgent, important: QUADS[k].important });
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
}

/** Sur téléphone : la matrice occupe exactement l'espace libre au-dessus de la barre d'onglets. */
function fitToScreen(root) {
  const m = root.querySelector('.matrix');
  if (!m) return;
  if (window.innerWidth > 760) {
    m.style.height = '';
    return;
  }
  const nav = document.querySelector('.tabs');
  const bottom = nav ? nav.getBoundingClientRect().top - 8 : window.innerHeight - 8;
  const top = m.getBoundingClientRect().top + window.scrollY;
  m.style.height = Math.max(320, bottom - top) + 'px';
}
