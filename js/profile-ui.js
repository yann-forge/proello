// Interface des profils et catégories : écran d'accueil, fenêtre « Profil et catégories »,
// barre de filtre, listes de choix et pastilles affichées dans les vues.

import { profiles, PRESETS, COLORS, newCategoryId } from './profiles.js';
import { categorize } from './categorize.js';
import { $, esc, lsGet, lsSet } from './util.js';

let notify = () => {};
let rerender = () => {};
let countFor = () => 0;

/* ---------- utilitaires partagés avec les vues ---------- */

export const categoryOf = (t) => (t.category ? profiles.category(t.category) : null);

export function catChip(t) {
  const c = categoryOf(t);
  return c ? `<span class="cat-chip" style="--c:${c.color}">${esc(c.name)}</span>` : '';
}

export function catDot(t) {
  const c = categoryOf(t);
  return c ? `<i class="cat-dot" style="--c:${c.color}" title="${esc(c.name)}"></i>` : '';
}

/** Options d'une liste de choix de catégorie. */
export function categoryOptions(selected) {
  const cats = profiles.categories();
  const known = cats.some((c) => c.id === selected);
  return (
    `<option value="">Sans catégorie</option>` +
    cats.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('') +
    (selected && !known ? `<option value="${esc(selected)}" selected>(catégorie d'un autre profil)</option>` : '')
  );
}

/** Ajoute la catégorie devinée à chaque tâche issue de la dictée. */
export function withCategories(items) {
  const cats = profiles.categories();
  return items.map((t) => ({ ...t, category: t.category ?? categorize(`${t.title} ${t.notes || ''} ${t.source || ''}`, cats) }));
}

/* ---------- filtre par catégorie (toutes les vues) ---------- */

let filter = lsGet('proello.catFilter', '');

export function filterTasks(tasks) {
  if (!filter) return tasks;
  if (filter === '__none') return tasks.filter((t) => !categoryOf(t));
  return tasks.filter((t) => t.category === filter);
}

export function renderCatFilter(tasks) {
  const bar = $('#catFilter');
  const cats = profiles.categories();
  if (filter && filter !== '__none' && !cats.some((c) => c.id === filter)) filter = '';
  bar.hidden = !cats.length;
  if (!cats.length) return;
  const open = tasks.filter((t) => !t.done);
  const n = (id) => open.filter((t) => t.category === id).length;
  const none = open.filter((t) => !categoryOf(t)).length;
  bar.innerHTML =
    `<button data-cat="" class="${!filter ? 'on' : ''}">Toutes</button>` +
    cats
      .map(
        (c) =>
          `<button data-cat="${c.id}" class="${filter === c.id ? 'on' : ''}" style="--c:${c.color}"><i class="cat-dot"></i>${esc(c.name)}${n(c.id) ? ` <small>${n(c.id)}</small>` : ''}</button>`
      )
      .join('') +
    (none ? `<button data-cat="__none" class="${filter === '__none' ? 'on' : ''}">Sans catégorie <small>${none}</small></button>` : '');
}

/* ---------- écran d'accueil ---------- */

function renderWelcome() {
  $('#welcomeProfiles').innerHTML =
    Object.values(PRESETS)
      .map(
        (p) => `<button class="profile-card" data-profile="${p.id}">
          <span class="emoji">${p.emoji}</span>
          <b>${esc(p.name)}</b>
          <span class="cats">${p.categories
            .slice(0, 6)
            .map((c) => `<i style="--c:${c.color}">${esc(c.name)}</i>`)
            .join('')}</span>
        </button>`
      )
      .join('') +
    `<button class="profile-card custom" data-profile="__new"><span class="emoji">✨</span><b>Créer mon profil</b><span class="cats"><i>Tes propres catégories</i></span></button>`;
}

export function showWelcomeIfNeeded() {
  if (profiles.active()) return;
  renderWelcome();
  $('#welcome').hidden = false;
  document.body.classList.add('welcoming');
}

$('#welcomeProfiles').addEventListener('click', (e) => {
  const card = e.target.closest('[data-profile]');
  if (!card) return;
  $('#welcome').hidden = true;
  document.body.classList.remove('welcoming');
  if (card.dataset.profile === '__new') {
    profiles.create('Mon profil');
    openProfileDialog();
    notify('Donne un nom à ton profil et ajoute tes catégories.');
    return;
  }
  profiles.choose(card.dataset.profile);
  notify(`Profil « ${profiles.active().name} » choisi. Catégories modifiables dans le menu ⋯.`);
});

/* ---------- fenêtre « Profil et catégories » ---------- */

function renderProfileDialog() {
  const active = profiles.active();
  $('#profileSelect').innerHTML =
    (active ? '' : '<option value="">— Choisis un profil —</option>') +
    profiles
      .all()
      .map((p) => `<option value="${p.id}" ${active && p.id === active.id ? 'selected' : ''}>${p.emoji} ${esc(p.name)}</option>`)
      .join('');
  $('#profileName').value = active?.name || '';
  $('#profileName').disabled = !active;
  $('#catList').innerHTML = (active?.categories || [])
    .map(
      (c) => `<li data-id="${c.id}">
        <button type="button" class="swatch" style="--c:${c.color}" aria-label="Changer la couleur de ${esc(c.name)}"></button>
        <input class="cat-name" value="${esc(c.name)}" maxlength="40" aria-label="Nom de la catégorie" />
        ${countFor(c.id) ? `<small class="cat-count" title="Tâches dans cette catégorie">${countFor(c.id)}</small>` : ''}
        <button type="button" class="cat-del" aria-label="Supprimer ${esc(c.name)}">✕</button>
      </li>`
    )
    .join('');
  $('#catAdd').hidden = !active;
  const isPreset = active && PRESETS[active.id];
  $('#profileReset').hidden = !(isPreset && profiles.isModified(active.id));
  $('#profileDelete').hidden = !active || !!isPreset;
}

export function openProfileDialog() {
  renderProfileDialog();
  const dlg = $('#profileDlg');
  if (!dlg.open) dlg.showModal();
}

$('#profileSelect').addEventListener('change', (e) => {
  if (e.target.value) profiles.choose(e.target.value);
  renderProfileDialog();
});

$('#profileName').addEventListener('change', (e) => {
  const name = e.target.value.trim();
  if (name) profiles.update((p) => (p.name = name));
  renderProfileDialog();
});

$('#catList').addEventListener('change', (e) => {
  const input = e.target.closest('.cat-name');
  if (!input) return;
  const id = input.closest('li').dataset.id;
  const name = input.value.trim();
  if (!name) return renderProfileDialog();
  profiles.update((p) => (p.categories.find((c) => c.id === id).name = name));
});

$('#catList').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest('.swatch')) {
    profiles.update((p) => {
      const c = p.categories.find((x) => x.id === id);
      c.color = COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length];
    });
    renderProfileDialog();
  }
  if (e.target.closest('.cat-del')) {
    const before = JSON.parse(JSON.stringify(profiles.active()));
    const name = before.categories.find((c) => c.id === id)?.name;
    profiles.update((p) => (p.categories = p.categories.filter((c) => c.id !== id)));
    renderProfileDialog();
    notify(`Catégorie « ${name} » supprimée`, { label: 'Annuler', run: () => (profiles.save(before), renderProfileDialog()) });
  }
});

$('#catAdd').addEventListener('click', () => {
  profiles.update((p) => {
    const name = 'Nouvelle catégorie';
    p.categories.push({ id: newCategoryId(name, p.categories), name, color: COLORS[p.categories.length % COLORS.length] });
  });
  renderProfileDialog();
  const inputs = $('#catList').querySelectorAll('.cat-name');
  const last = inputs[inputs.length - 1];
  last?.focus();
  last?.select();
});

// Une catégorie ajoutée garde l'identifiant de son premier nom ; on le recalcule tant qu'elle s'appelle « Nouvelle catégorie »
$('#catList').addEventListener('change', (e) => {
  const input = e.target.closest('.cat-name');
  const li = input?.closest('li');
  if (!li || !li.dataset.id.startsWith('nouvelle-categorie')) return;
  const oldId = li.dataset.id;
  profiles.update((p) => {
    const c = p.categories.find((x) => x.id === oldId);
    if (!c) return;
    c.id = newCategoryId(c.name, p.categories.filter((x) => x !== c));
  });
  renderProfileDialog();
});

$('#profileReset').addEventListener('click', () => {
  const p = profiles.active();
  profiles.resetOrDelete(p.id);
  renderProfileDialog();
  notify(`Catégories d'origine rétablies pour « ${PRESETS[p.id].name} »`);
});

$('#profileDelete').addEventListener('click', () => {
  const p = profiles.active();
  profiles.resetOrDelete(p.id);
  renderProfileDialog();
  notify(`Profil « ${p.name} » supprimé. Choisis un autre profil.`, { label: 'Annuler', run: () => (profiles.save(p), profiles.choose(p.id), renderProfileDialog()) });
});

$('#newProfileBtn').addEventListener('click', () => {
  const name = $('#newProfileName').value.trim();
  if (!name) return $('#newProfileName').focus();
  profiles.create(name);
  $('#newProfileName').value = '';
  renderProfileDialog();
  notify(`Profil « ${name} » créé avec les catégories communes. Ajoute les tiennes.`);
});

/* ---------- initialisation ---------- */

export function initProfileUI({ toast, render, countTasks }) {
  notify = toast;
  rerender = render;
  countFor = countTasks;
  $('#catFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    filter = b.dataset.cat;
    lsSet('proello.catFilter', filter);
    rerender();
  });
  profiles.subscribe(() => {
    $('#profileLabel').textContent = profiles.active() ? `· ${profiles.active().emoji} ${profiles.active().name}` : '';
    rerender();
  });
  $('#profileLabel').textContent = profiles.active() ? `· ${profiles.active().emoji} ${profiles.active().name}` : '';
}
