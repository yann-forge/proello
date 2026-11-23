// Point d'entrée : navigation entre les vues, dictée, dialogues, installation PWA.

import { store } from './store.js';
import { parseDictation } from './parser.js';
import { startDictation, voiceSupported, VOICE_ERRORS } from './voice.js';
import { QUADS, quadrantOf } from './tasks.js';
import { relLabel, todayISO } from './dates.js';
import { $, esc, lsGet, lsSet } from './util.js';
import { renderList } from './views/list.js';
import { renderGantt } from './views/gantt.js';
import { renderMatrix } from './views/matrix.js';

export const VERSION = '0.1.0';

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
  VIEWS[current]($('#view'), store.all(), ctx);
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

/* ---------- Ajout rapide au clavier ---------- */

$('#quickAdd').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#quickInput');
  const items = parseDictation(input.value);
  if (!items.length) return;
  store.add(items);
  input.value = '';
  toast(`${plural(items.length, 'tâche')} ajoutée${items.length > 1 ? 's' : ''}`);
});

/* ---------- Dictée ---------- */

let session = null;
let lastHeard = '';

$('#micBtn').addEventListener('click', () => {
  if (!voiceSupported) {
    toast("La dictée n'est pas disponible dans ce navigateur. Essaie Chrome, Edge ou Safari — ou utilise le micro du clavier.");
    $('#quickInput').focus();
    return;
  }
  openRecorder();
});

function openRecorder() {
  const rec = $('#recorder');
  const out = $('#recText');
  out.innerHTML = '<span class="muted">Parle maintenant</span>';
  lastHeard = '';
  rec.hidden = false;
  document.body.classList.add('recording');
  try {
    session = startDictation({
      onUpdate: (final, interim) => {
        lastHeard = `${final} ${interim}`.trim();
        out.innerHTML = `${esc(final)} <span class="interim">${esc(interim)}</span>`;
        out.scrollTop = out.scrollHeight;
      },
      onError: (code) => {
        closeRecorder();
        toast(VOICE_ERRORS[code] || `Erreur de dictée (${code}).`);
      },
    });
  } catch (err) {
    closeRecorder();
    toast("Impossible de démarrer la dictée.");
  }
}

function closeRecorder() {
  $('#recorder').hidden = true;
  document.body.classList.remove('recording');
}

$('#recCancel').addEventListener('click', () => {
  session?.cancel();
  session = null;
  closeRecorder();
});

$('#recStop').addEventListener('click', async () => {
  const s = session;
  session = null;
  $('#recStop').disabled = true;
  const text = s ? await Promise.race([s.stop(), new Promise((r) => setTimeout(() => r(null), 2500))]) : '';
  const finalText = text || lastHeard;
  $('#recStop').disabled = false;
  closeRecorder();
  const items = parseDictation(finalText || '');
  if (!items.length) return toast("Je n'ai rien compris. Réessaie en parlant près du micro.");
  openReview(items, finalText);
});

/* ---------- Validation des tâches dictées ---------- */

function reviewRow(t) {
  const li = document.createElement('li');
  li.dataset.start = t.start || '';
  li.dataset.end = t.end || '';
  li.innerHTML = `
    <input class="rv-title" value="${esc(t.title)}" aria-label="Intitulé" />
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

function openReview(items, raw) {
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

$('#review').addEventListener('close', () => {
  if ($('#review').returnValue !== 'save') return;
  const items = [...$('#reviewList').children].map((li) => ({
    title: li.querySelector('.rv-title').value,
    urgent: li.querySelector('[data-flag=urgent]').classList.contains('on'),
    important: li.querySelector('[data-flag=important]').classList.contains('on'),
    start: li.dataset.start || null,
    end: li.dataset.end || null,
  }));
  const created = store.add(items);
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
  updateQuadHint();
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
  };
  if (form.done.checked !== t.done) patch.done = form.done.checked;
  store.update(editingId, patch);
});

$('#editorDelete').addEventListener('click', () => {
  const removed = store.remove(editingId);
  $('#editor').close();
  if (removed) toast('Tâche supprimée', { label: 'Annuler', run: () => store.restore(removed) });
});

/* ---------- Menu ---------- */

$('#menuBtn').addEventListener('click', () => $('#menu').showModal());
$('#versionLabel').textContent = `Version ${VERSION}.`;

function clearDone() {
  const before = store.all();
  const n = store.clearDone();
  if (n) toast(n > 1 ? `${n} tâches terminées effacées` : '1 tâche terminée effacée', { label: 'Annuler', run: () => store.replaceAll(before) });
}

$('#clearDoneBtn').addEventListener('click', () => {
  $('#menu').close();
  clearDone();
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
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
