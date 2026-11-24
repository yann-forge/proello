// Point d'entrée : navigation entre les vues, dictée, dialogues, installation PWA.

import { store, TRASH_DAYS } from './store.js';
import { parseDictation } from './parser.js';
import { summarize, MAX_WORDS } from './summarize.js';
import { startDictation, voiceSupported, VOICE_ERRORS } from './voice.js';
import { QUADS, quadrantOf } from './tasks.js';
import { relLabel, todayISO, toLocalStamp } from './dates.js';
import { openReport, initReport } from './report.js';
import { $, esc, lsGet, lsSet, uid } from './util.js';
import { renderList } from './views/list.js';
import { renderGantt } from './views/gantt.js';
import { renderMatrix } from './views/matrix.js';

import { VERSION } from './version.js';
import { profiles } from './profiles.js';
import { initProfileUI, showWelcomeIfNeeded, openProfileDialog, renderCatFilter, filterTasks, withCategories, categoryOptions } from './profile-ui.js';

const VIEWS = { list: renderList, gantt: renderGantt, matrix: renderMatrix };
let current = VIEWS[lsGet('proello.view', 'list')] ? lsGet('proello.view', 'list') : 'list';

const ctx = {
  rerender: () => render(),
  update: (id, patch) => store.update(id, patch),
  openEditor: (id) => openEditor(id),
  clearDone: () => clearDone(),
};

/* ---------- Rendu ---------- */

function render() {
  renderCatFilter(store.all());
  VIEWS[current]($('#view'), filterTasks(store.all()), ctx);
  document.querySelectorAll('.tabs [data-view]').forEach((b) => {
    b.classList.toggle('on', b.dataset.view === current);
    b.setAttribute('aria-current', b.dataset.view === current ? 'page' : 'false');
  });
  document.body.dataset.view = current;
}

store.subscribe(render);

document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b || b.dataset.view === current) return;
  current = b.dataset.view;
  lsSet('proello.view', current);
  render();
  window.scrollTo({ top: 0 });
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

// Changement de jour (la ligne « aujourd'hui » et les retards se mettent à jour)
let lastDay = todayISO();
setInterval(() => {
  if (todayISO() !== lastDay) {
    lastDay = todayISO();
    render();
  }
}, 60000);

/* ---------- Toast ---------- */

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => (action.run(), (el.hidden = true));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3200);
}

const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
initReport({ toast });
initProfileUI({ toast, render: () => render(), countTasks: (id) => store.all().filter((t) => t.category === id).length });

/* ---------- Ajout rapide au clavier ---------- */

$('#quickAdd').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#quickInput');
  const at = new Date();
  const items = parseDictation(input.value, at);
  if (!items.length) return;
  store.add(withSource(withCategories(items), input.value, at));
  input.value = '';
  toast(`${plural(items.length, 'tâche')} ajoutée${items.length > 1 ? 's' : ''}`);
});

/* ---------- Dictée ---------- */

// Deux étapes : 1) j'écoute (texte en direct)  2) tu vérifies et corriges le texte, puis tu valides.

let session = null;
let lastHeard = '';
let baseText = ''; // texte déjà validé à l'étape « corriger », complété si on continue à dicter

/** Garde le texte d'origine et la date de la dictée sur chaque tâche (utile pour signaler une erreur). */
function withSource(items, source, at) {
  const dictationId = uid(); // relie entre elles les tâches issues de la même dictée
  return items.map((t) => ({ ...t, source: source.trim(), dictatedAt: toLocalStamp(at), dictationId }));
}

/** Les tâches issues de la même dictée que `t` (elle comprise). */
function siblingsOf(t) {
  if (!t.source) return [t];
  return store
    .all()
    .filter((x) => (t.dictationId ? x.dictationId === t.dictationId : x.source === t.source && x.dictatedAt === t.dictatedAt))
    .sort((a, b) => a.createdAt - b.createdAt);
}

const fmtStamp = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function renderSource(t) {
  const box = $('#editorSource');
  box.hidden = !t.source;
  if (!t.source) return;
  box.open = false;
  const sibs = siblingsOf(t);
  $('#editorSourceCount').textContent = sibs.length > 1 ? `· ${sibs.length} tâches` : '· 1 tâche';
  $('#editorSourceMeta').textContent = t.dictatedAt ? `Dictée le ${fmtStamp.format(new Date(t.dictatedAt))}` : '';
  $('#editorSourceText').textContent = t.source;
  $('#editorSiblings').innerHTML = sibs
    .map(
      (s, i) => `<li><button type="button" data-sibling="${s.id}" class="${s.id === t.id ? 'current' : ''} q-${quadrantOf(s)}" ${s.id === t.id ? 'aria-current="true"' : ''}>
        <span>${i + 1}</span>${esc(s.title)}${s.done ? ' <small>(terminée)</small>' : ''}</button></li>`
    )
    .join('');
}

$('#editorSiblings').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sibling]');
  if (!b || b.dataset.sibling === editingId) return;
  $('#editor').returnValue = '';
  $('#editor').close();
  openEditor(b.dataset.sibling);
});

$('#micBtn').addEventListener('click', () => {
  if (!voiceSupported) {
    toast("La dictée n'est pas disponible dans ce navigateur. Essaie Chrome, Edge ou Safari — ou utilise le micro du clavier.");
    $('#quickInput').focus();
    return;
  }
  baseText = '';
  openRecorder();
  listen();
});

function openRecorder() {
  $('#recorder').hidden = false;
  document.body.classList.add('recording');
}

function closeRecorder() {
  session?.cancel();
  session = null;
  $('#recorder').hidden = true;
  document.body.classList.remove('recording');
}

function setRecMode(mode) {
  $('#recCard').dataset.mode = mode;
  $('#recTitle').textContent = mode === 'listening' ? "Je t'écoute…" : 'Vérifie le texte';
}

function listen() {
  setRecMode('listening');
  const out = $('#recText');
  out.innerHTML = baseText ? `${esc(baseText)} <span class="muted">…</span>` : '<span class="muted">Parle maintenant</span>';
  lastHeard = '';
  try {
    session = startDictation({
      onUpdate: (final, interim) => {
        lastHeard = `${final} ${interim}`.trim();
        out.innerHTML = `${esc(baseText)} ${esc(final)} <span class="interim">${esc(interim)}</span>`;
        out.scrollTop = out.scrollHeight;
      },
      onError: (code) => {
        session = null;
        toast(VOICE_ERRORS[code] || `Erreur de dictée (${code}).`);
        showEditor(); // on garde ce qui a déjà été dit, modifiable
      },
    });
  } catch {
    session = null;
    toast('Impossible de démarrer la dictée.');
    showEditor();
  }
}

function showEditor(text = baseText) {
  setRecMode('editing');
  const ta = $('#recEdit');
  ta.value = text;
  ta.style.height = '';
  ta.style.height = Math.min(ta.scrollHeight + 4, window.innerHeight * 0.4) + 'px';
}

$('#recCancel').addEventListener('click', closeRecorder);
$('#recCancel2').addEventListener('click', closeRecorder);

$('#recStop').addEventListener('click', async () => {
  const s = session;
  session = null;
  $('#recStop').disabled = true;
  const text = s ? await Promise.race([s.stop(), new Promise((r) => setTimeout(() => r(null), 2500))]) : '';
  $('#recStop').disabled = false;
  baseText = [baseText, text || lastHeard].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  showEditor();
});

$('#recMore').addEventListener('click', () => {
  baseText = $('#recEdit').value.trim();
  listen();
});

$('#recValidate').addEventListener('click', () => {
  const text = $('#recEdit').value.trim();
  const items = parseDictation(text, new Date());
  if (!items.length) return toast("Je n'ai trouvé aucune tâche dans ce texte.");
  closeRecorder();
  openReview(withCategories(items), text);
});

/* ---------- Validation des tâches dictées ---------- */

function reviewRow(t) {
  const li = document.createElement('li');
  li.dataset.start = t.start || '';
  li.dataset.end = t.end || '';
  li.dataset.notes = t.notes || '';
  li.innerHTML = `
    <input class="rv-title" value="${esc(t.title)}" aria-label="Titre court" maxlength="80" />
    ${t.notes ? `<p class="rv-detail"><span>Détail :</span> ${esc(t.notes)}</p>` : ''}
    <select class="cat-select rv-cat" aria-label="Catégorie">${categoryOptions(t.category)}</select>
    <div class="rv-meta">
      <button type="button" class="pill pill-u ${t.urgent ? 'on' : ''}" data-flag="urgent" aria-pressed="${!!t.urgent}">Urgent</button>
      <button type="button" class="pill pill-i ${t.important ? 'on' : ''}" data-flag="important" aria-pressed="${!!t.important}">Important</button>
      ${t.end ? `<span class="date-chip">${esc(t.start && t.start !== t.end ? relLabel(t.start) + ' → ' : '')}${esc(relLabel(t.end))}</span>` : ''}
      <button type="button" class="rv-del" aria-label="Retirer">✕</button>
    </div>`;
  return li;
}

function refreshReviewCount() {
  const n = $('#reviewList').children.length;
  $('#reviewSave').textContent = n ? `Ajouter ${plural(n, 'tâche')}` : 'Fermer';
}

let reviewSource = '';
let reviewAt = new Date();

function openReview(items, raw) {
  reviewSource = raw || '';
  reviewAt = new Date();
  const list = $('#reviewList');
  list.replaceChildren(...items.map(reviewRow));
  $('#reviewRaw').textContent = raw || '';
  refreshReviewCount();
  const dlg = $('#review');
  dlg.returnValue = '';
  dlg.showModal();
}

$('#reviewList').addEventListener('click', (e) => {
  const flag = e.target.closest('[data-flag]');
  if (flag) {
    const on = !flag.classList.contains('on');
    flag.classList.toggle('on', on);
    flag.setAttribute('aria-pressed', on);
  }
  if (e.target.closest('.rv-del')) {
    e.target.closest('li').remove();
    refreshReviewCount();
  }
});

$('#reviewAddRow').addEventListener('click', () => {
  const li = reviewRow({ title: '' });
  $('#reviewList').appendChild(li);
  li.querySelector('input').focus();
  refreshReviewCount();
});

$('#reviewEditText').addEventListener('click', () => {
  $('#review').close();
  baseText = reviewSource;
  openRecorder();
  showEditor();
});

$('#reviewReport').addEventListener('click', () => {
  $('#review').close();
  openReport({ input: reviewSource, at: reviewAt });
});

$('#review').addEventListener('close', () => {
  if ($('#review').returnValue !== 'save') return;
  const items = [...$('#reviewList').children].map((li) => ({
    title: li.querySelector('.rv-title').value,
    urgent: li.querySelector('[data-flag=urgent]').classList.contains('on'),
    important: li.querySelector('[data-flag=important]').classList.contains('on'),
    category: li.querySelector('.rv-cat').value || null,
    start: li.dataset.start || null,
    end: li.dataset.end || null,
    notes: li.dataset.notes || '',
  }));
  const created = store.add(withSource(items, reviewSource, reviewAt));
  if (created.length) toast(`${plural(created.length, 'tâche')} ajoutée${created.length > 1 ? 's' : ''}`);
});

/* ---------- Édition ---------- */

let editingId = null;
const form = $('#editorForm');

function updateQuadHint() {
  const q = quadrantOf({ urgent: form.urgent.checked, important: form.important.checked });
  $('#editorQuad').className = `quad-hint q-${q}`;
  $('#editorQuad').textContent = `→ ${QUADS[q].label} · ${QUADS[q].sub}`;
}
form.urgent.addEventListener('change', updateQuadHint);
form.important.addEventListener('change', updateQuadHint);
form.start.addEventListener('change', () => {
  if (form.start.value && (!form.end.value || form.end.value < form.start.value)) form.end.value = form.start.value;
});

function openEditor(id) {
  const t = store.get(id);
  if (!t) return;
  editingId = id;
  form.title.value = t.title;
  form.urgent.checked = t.urgent;
  form.important.checked = t.important;
  form.start.value = t.start || '';
  form.end.value = t.end || '';
  form.notes.value = t.notes || '';
  form.done.checked = t.done;
  form.category.innerHTML = categoryOptions(t.category);
  updateQuadHint();
  renderSource(t);
  const dlg = $('#editor');
  dlg.returnValue = '';
  dlg.showModal();
}

$('#editor').addEventListener('close', () => {
  if ($('#editor').returnValue !== 'save' || !editingId) return;
  const t = store.get(editingId);
  const patch = {
    title: form.title.value.trim() || t.title,
    urgent: form.urgent.checked,
    important: form.important.checked,
    start: form.start.value || null,
    end: form.end.value || null,
    notes: form.notes.value,
    category: form.category.value || null,
  };
  if (form.done.checked !== t.done) patch.done = form.done.checked;
  store.update(editingId, patch);
});

$('#editorReport').addEventListener('click', () => {
  const t = store.get(editingId);
  $('#editor').returnValue = '';
  $('#editor').close();
  if (t) openReport({ input: t.source || t.notes || t.title, at: t.dictatedAt ? new Date(t.dictatedAt) : new Date(t.createdAt) });
});

$('#menuReport').addEventListener('click', () => {
  $('#menu').close();
  openReport({ input: '', at: new Date() });
});

$('#editorDelete').addEventListener('click', () => {
  const removed = store.remove(editingId);
  $('#editor').close();
  if (removed) toast('Tâche mise à la corbeille', { label: 'Annuler', run: () => store.untrash(removed.id) });
});

/* ---------- Menu ---------- */

$('#menuBtn').addEventListener('click', () => $('#menu').showModal());
$('#profileBtn').addEventListener('click', () => {
  $('#menu').close();
  openProfileDialog();
});
$('#versionLabel').textContent = `Version ${VERSION}.`;

function clearDone() {
  const ids = store.clearDone();
  const n = ids.length;
  if (n) toast(n > 1 ? `${n} tâches terminées mises à la corbeille` : '1 tâche terminée mise à la corbeille', { label: 'Annuler', run: () => store.untrash(ids) });
}

/* ---------- Corbeille ---------- */

const fmtDeleted = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function renderTrash() {
  const items = store.trash();
  $('#trashCount').textContent = items.length ? `(${items.length})` : '';
  $('#trashEmpty').disabled = !items.length;
  $('#trashList').innerHTML = items.length
    ? items
        .map((t) => {
          const left = Math.max(1, TRASH_DAYS - Math.floor((Date.now() - t.deletedAt) / 86400000));
          return `<li data-id="${t.id}">
            <div class="trash-info">
              <b>${esc(t.title)}</b>
              <small>Supprimée le ${fmtDeleted.format(new Date(t.deletedAt))} · effacée dans ${left} jour${left > 1 ? 's' : ''}</small>
            </div>
            <button type="button" class="btn ghost small" data-act="restore">Restaurer</button>
            <button type="button" class="icon-btn trash-purge" data-act="purge" aria-label="Supprimer définitivement">✕</button>
          </li>`;
        })
        .join('')
    : '<li class="trash-none muted">La corbeille est vide.</li>';
}

$('#trashBtn').addEventListener('click', () => {
  $('#menu').close();
  renderTrash();
  $('#trash').showModal();
});

$('#trashList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  if (btn.dataset.act === 'restore') {
    store.untrash(id);
    toast('Tâche restaurée');
  }
  if (btn.dataset.act === 'purge') {
    // deux appuis : le premier demande confirmation
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = 'Effacer ?';
      setTimeout(() => btn.isConnected && (btn.classList.remove('confirm'), (btn.textContent = '✕')), 3000);
      return;
    }
    store.purge(id);
  }
  renderTrash();
});

$('#trashEmpty').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm');
    btn.textContent = 'Confirmer : tout effacer définitivement';
    setTimeout(() => (btn.classList.remove('confirm'), (btn.textContent = 'Vider la corbeille')), 4000);
    return;
  }
  store.purge();
  btn.classList.remove('confirm');
  btn.textContent = 'Vider la corbeille';
  renderTrash();
  toast('Corbeille vidée');
});

store.subscribe(() => $('#trash').open && renderTrash());
const refreshTrashCount = () => {
  const n = store.trash().length;
  $('#trashCount').textContent = n ? `(${n})` : '';
};
store.subscribe(refreshTrashCount);
refreshTrashCount();

$('#clearDoneBtn').addEventListener('click', () => {
  $('#menu').close();
  clearDone();
});

$('#shortenBtn').addEventListener('click', () => {
  $('#menu').close();
  const before = store.all();
  const long = before.filter((t) => t.title.split(/\s+/).length > MAX_WORDS);
  if (!long.length) return toast(`Tous les titres font déjà ${MAX_WORDS} mots ou moins.`);
  for (const t of long) {
    // si un détail existe déjà (texte dicté), on le garde tel quel ; sinon l'ancien titre devient le détail
    const notes = t.notes || t.title;
    store.update(t.id, { title: summarize(t.title), notes });
  }
  toast(`${plural(long.length, 'titre')} raccourci${long.length > 1 ? 's' : ''}`, { label: 'Annuler', run: () => store.replaceAll(before) });
});

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'proello', version: 1, exportedAt: new Date().toISOString(), tasks: store.all() }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `proello-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.tasks;
    if (!Array.isArray(list)) throw new Error();
    const before = store.all();
    store.replaceAll(list.filter((t) => t && t.title));
    $('#menu').close();
    toast(`${plural(list.length, 'tâche')} importée${list.length > 1 ? 's' : ''}`, { label: 'Annuler', run: () => store.replaceAll(before) });
  } catch {
    toast("Ce fichier n'est pas une sauvegarde Proello valide.");
  }
});

/* ---------- Installation (PWA) ---------- */

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  $('#installBtn').hidden = true;
});
window.addEventListener('appinstalled', () => ($('#installBtn').hidden = true));

if ('serviceWorker' in navigator) {
  // Mises à jour : vérifiées au lancement et à chaque retour sur l'app (une app installée reste souvent ouverte)
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {})
  );
  // Nouvelle version prête : on recharge, sauf si une fenêtre ou une dictée est en cours
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    const busy = document.querySelector('dialog[open]') || !$('#recorder').hidden;
    if (busy) return toast('Nouvelle version disponible : ferme et rouvre l’app pour en profiter.');
    reloading = true;
    location.reload();
  });
}

render();
showWelcomeIfNeeded();
