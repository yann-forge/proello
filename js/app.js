// Point d'entrée : navigation entre les vues, dictée, dialogues, installation PWA.

import { store, TRASH_DAYS } from './store.js';
import { parseDictation } from './parser.js';
import { summarize, MAX_WORDS } from './summarize.js';
import { startDictation, voiceSupported, VOICE_ERRORS } from './voice.js';
import { QUADS, quadrantOf } from './tasks.js';
import { relLabel, todayISO, toLocalStamp, fmtTime, fmtShort as fmtShortDate } from './dates.js';
import { openReport, initReport } from './report.js';
import { $, esc, lsGet, lsSet, uid } from './util.js';
import { renderList } from './views/list.js';
import { renderGantt } from './views/gantt.js';
import { renderMatrix } from './views/matrix.js';

import { VERSION } from './version.js';
import { readImport, withoutDuplicates, templateCSV, decodeBytes } from './importer.js';
import { placeRepeat, missingForEvent, staleForEvent, appliesTo, fromTemplate, EVENT_WORDS, describeRepeat, describeOffsets } from './repeat.js';
import { eventTypes, eventNoun, deNoun, setEventNoun, cap, NOUN_CHOICES, TYPE_IDEAS } from './event-types.js';
import { dateChip } from './views/list.js';
import { profiles } from './profiles.js';
import { initProfileUI, showWelcomeIfNeeded, openProfileDialog, renderCatFilter, filterTasks, withCategories, categoryOptions } from './profile-ui.js';

const VIEWS = { list: renderList, gantt: renderGantt, matrix: renderMatrix };
let current = VIEWS[lsGet('proello.view', 'list')] ? lsGet('proello.view', 'list') : 'list';

const ctx = {
  rerender: () => render(),
  update: (id, patch) => {
    const before = store.get(id);
    const after = store.update(id, patch);
    // tâche répétée cochée : elle passe à la fois suivante
    if (patch.done && before?.repeat && after && !after.done) toast(`Fait ! Prochaine fois : ${relLabel(after.start).toLowerCase()}${after.time ? ' ' + fmtTime(after.time) : ''}`);
    return after;
  },
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
  const created = store.add(withSource(withCategories(items), input.value, at));
  input.value = '';
  toast(`${plural(items.length, 'tâche')} ajoutée${items.length > 1 ? 's' : ''}`);
  suggestEvent(created);
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
  li.dataset.time = t.time || '';
  li.dataset.endTime = t.endTime || '';
  li.dataset.notes = t.notes || '';
  li.dataset.repeat = t.repeat ? JSON.stringify(t.repeat) : '';
  li.innerHTML = `
    <input class="rv-title" value="${esc(t.title)}" aria-label="Titre court" maxlength="80" />
    ${t.notes ? `<p class="rv-detail"><span>Détail :</span> ${esc(t.notes)}</p>` : ''}
    <select class="cat-select rv-cat" aria-label="Catégorie">${categoryOptions(t.category)}</select>
    <div class="rv-meta">
      <button type="button" class="pill pill-u ${t.urgent ? 'on' : ''}" data-flag="urgent" aria-pressed="${!!t.urgent}">Urgent</button>
      <button type="button" class="pill pill-i ${t.important ? 'on' : ''}" data-flag="important" aria-pressed="${!!t.important}">Important</button>
      ${dateChip(t)}
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
    time: li.dataset.time || null,
    endTime: li.dataset.endTime || null,
    notes: li.dataset.notes || '',
    repeat: li.dataset.repeat ? JSON.parse(li.dataset.repeat) : null,
  }));
  const created = store.add(withSource(items, reviewSource, reviewAt));
  if (created.length) toast(`${plural(created.length, 'tâche')} ajoutée${created.length > 1 ? 's' : ''}`);
  suggestEvent(created);
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
  form.time.value = t.time || '';
  form.endTime.value = t.endTime || '';
  form.notes.value = t.notes || '';
  form.done.checked = t.done;
  form.repeat.value = t.repeat?.freq || '';
  form.until.value = t.repeat?.until || '';
  renderKindOptions(t.perEvent ? 'template' : t.event ? 'event' : '');
  renderTypeOptions(t.perEvent ? t.perEvent.type : t.eventType);
  form.newType.value = '';
  setMoreOpen(false);
  form.tplFrom.value = t.perEvent?.from ?? -7;
  form.tplTo.value = t.perEvent?.to ?? t.perEvent?.from ?? -1;
  refreshEditorMode();
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
    time: form.time.value || null,
    endTime: form.time.value && form.endTime.value > form.time.value ? form.endTime.value : null,
    notes: form.notes.value,
    category: form.category.value || null,
    event: form.kind.value === 'event',
  };
  // type de prestation choisi (ou créé à la volée)
  let type = form.eventType.value || null;
  if (type === '__new') type = eventTypes.add(form.newType.value);
  patch.eventType = patch.event ? type : null;
  // modèle « pour chaque prestation » : pas de date, un décalage en jours
  if (form.kind.value === 'template') {
    const a = Number(form.tplFrom.value) || 0;
    const b = form.tplTo.value === '' ? a : Number(form.tplTo.value) || 0;
    Object.assign(patch, { perEvent: { from: Math.min(a, b), to: Math.max(a, b), type }, start: null, end: null, repeat: null, event: false });
  } else {
    patch.perEvent = null;
    // répétition : la tâche est placée sur sa prochaine occurrence à partir de la date de début
    const freq = form.repeat.value;
    if (freq) {
      const keepDays = t.repeat?.freq === 'week' && freq === 'week' && t.repeat.days && (!patch.start || patch.start === t.start);
      const rule = { freq, ...(keepDays ? { days: t.repeat.days } : {}) };
      Object.assign(patch, placeRepeat(rule, { start: patch.start || todayISO(), end: form.until.value || null }));
    } else patch.repeat = null;
  }
  if (form.done.checked !== t.done) patch.done = form.done.checked;
  const datesMoved = t.start !== patch.start || t.end !== patch.end;
  const saved = ctx.update(editingId, patch);
  if (saved && (saved.event || t.event)) syncEvent(saved, datesMoved || saved.eventType !== t.eventType);
  if (saved?.perEvent && (!t.perEvent || t.perEvent.type !== saved.perEvent.type)) syncAllEvents();
});

/* ---------- Réglages avancés de la fiche (🔧) : répétition, prestation, modèle ---------- */

function setMoreOpen(open) {
  $('#editorMore').hidden = !open;
  $('#editorMoreBtn').setAttribute('aria-expanded', String(open));
}
$('#editorMoreBtn').addEventListener('click', () => setMoreOpen($('#editorMore').hidden));

function renderKindOptions(kind) {
  const n = eventNoun();
  form.kind.innerHTML = [
    ['', 'Tâche simple'],
    ['event', `★ Date ${deNoun(n)}`],
    ['template', `📋 À faire pour chaque ${n}`],
  ]
    .map(([v, l]) => `<option value="${v}">${esc(l)}</option>`)
    .join('');
  form.kind.value = kind;
}

function renderTypeOptions(selected) {
  const types = eventTypes.all();
  form.eventType.innerHTML =
    '<option value=""></option>' +
    types.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('') +
    '<option value="__new">+ Nouveau type…</option>';
  form.eventType.value = types.some((t) => t.id === selected) ? selected : '';
}

/** N'affiche que les champs utiles, et résume les réglages sur le bouton 🔧. */
function refreshEditorMode() {
  const kind = form.kind.value;
  const tpl = kind === 'template';
  const n = eventNoun();
  $('#editorDates').hidden = tpl;
  $('#editorRepeat').hidden = tpl;
  $('#editorTpl').hidden = !tpl;
  $('#editorTypeRow').hidden = !kind;
  $('#editorUntil').hidden = !form.repeat.value;
  $('#editorNewType').hidden = form.eventType.value !== '__new';
  $('#editorTypeLabel').textContent = `Type ${deNoun(n)}`;
  // l'option vide change de sens selon le genre de tâche
  form.eventType.options[0].textContent = tpl ? 'Tous les types' : 'Sans type';
  const typeName = form.eventType.value === '__new' ? form.newType.value.trim() : eventTypes.name(form.eventType.value);
  $('#editorKindHint').textContent =
    kind === 'event'
      ? `Les tâches « à faire pour chaque ${n} » ${typeName ? `du type ${typeName} et de tous les types` : 'de tous les types'} seront créées et datées autour de cette date.`
      : tpl
        ? `Cette tâche sera copiée et datée pour chaque date ${deNoun(n)}${typeName ? ` du type ${typeName}` : ''}. Du jour −30 au jour −15 : entre 30 et 15 jours avant.`
        : '';
  const bits = [];
  if (form.repeat.value && !tpl) bits.push(`↻ ${form.repeat.selectedOptions[0].textContent.toLowerCase()}`);
  if (kind === 'event') bits.push(`★ ${typeName || cap(n)}`);
  if (tpl) bits.push(`📋 pour chaque ${typeName ? typeName.toLowerCase() : n}`);
  $('#editorMoreSum').textContent = bits.length ? bits.join(' · ') : `Répétition, date ${deNoun(n)}, tâche à préparer`;
  $('#editorMoreBtn').classList.toggle('has-settings', bits.length > 0);
}
form.kind.addEventListener('change', refreshEditorMode);
form.repeat.addEventListener('change', refreshEditorMode);
form.eventType.addEventListener('change', () => {
  refreshEditorMode();
  if (form.eventType.value === '__new') form.newType.focus();
});
form.newType.addEventListener('input', refreshEditorMode);
$('#editorTypesBtn').addEventListener('click', () => openTypesDialog());

/* ---------- Types de prestation et mot utilisé (prestation, événement, mission…) ---------- */

function openTypesDialog() {
  renderTypesDialog();
  $('#typesDlg').showModal();
}
$('#typesMenuBtn').addEventListener('click', () => {
  $('#menu').close();
  openTypesDialog();
});
$('#typesDlg').addEventListener('close', () => {
  // la fiche ouverte dessous reprend les nouveaux noms
  if ($('#editor').open) {
    renderKindOptions(form.kind.value);
    renderTypeOptions(form.eventType.value);
    refreshEditorMode();
  }
  refreshNounLabels();
  render();
});

function renderTypesDialog() {
  const n = eventNoun();
  $('#nounInput').value = n;
  $('#nounChoices').innerHTML = NOUN_CHOICES.map((w) => `<option value="${w}"></option>`).join('');
  $('#typesTitle').textContent = `Types ${deNoun(n)}`;
  $('#typesHelp').textContent = `Chaque type a ses propres tâches à préparer (dans la fiche d’une tâche : 🔧 Réglages avancés → « À faire pour chaque ${n} »). Celles réglées sur « Tous les types » servent pour toutes.`;
  const all = store.all();
  const types = eventTypes.all();
  $('#typesList').innerHTML = types.length
    ? types
        .map((t) => {
          const tpls = all.filter((x) => x.perEvent?.type === t.id).length;
          const evs = all.filter((x) => x.event && x.eventType === t.id).length;
          return `<li data-type="${t.id}">
            <input value="${esc(t.name)}" aria-label="Nom du type" />
            <small>${plural(tpls, 'tâche')} à préparer · ${plural(evs, 'date')}</small>
            <button type="button" class="icon-btn" data-del-type="${t.id}" aria-label="Supprimer ce type">✕</button>
          </li>`;
        })
        .join('')
    : `<li class="muted small">Aucun type pour l’instant : toutes tes tâches à préparer servent pour chaque ${n}.</li>`;
  const have = new Set(types.map((t) => t.name.toLowerCase()));
  const ideas = (TYPE_IDEAS[n] || []).filter((x) => !have.has(x.toLowerCase()));
  $('#typeIdeas').innerHTML = ideas.length
    ? `<small class="muted">Idées :</small>${ideas.map((x) => `<button type="button" class="chip-btn" data-idea="${esc(x)}">+ ${esc(x)}</button>`).join('')}`
    : '';
}

$('#nounInput').addEventListener('change', () => {
  setEventNoun($('#nounInput').value);
  renderTypesDialog();
});
$('#typesList').addEventListener('change', (e) => {
  const li = e.target.closest('[data-type]');
  if (li && e.target.matches('input')) eventTypes.rename(li.dataset.type, e.target.value);
});
$('#typesList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-type]');
  if (!del) return;
  const id = del.dataset.delType;
  if (!confirm(`Supprimer le type « ${eventTypes.name(id)} » ? Ses tâches à préparer serviront alors pour tous les types.`)) return;
  for (const t of store.all()) {
    if (t.perEvent?.type === id) store.update(t.id, { perEvent: { ...t.perEvent, type: null } });
    if (t.eventType === id) store.update(t.id, { eventType: null });
  }
  eventTypes.remove(id);
  renderTypesDialog();
});
const addType = (name) => eventTypes.add(name) && renderTypesDialog();
$('#typeAdd').addEventListener('click', () => {
  addType($('#typeNew').value);
  $('#typeNew').value = '';
});
$('#typeNew').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  $('#typeAdd').click();
});
$('#typeIdeas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-idea]');
  if (b) addType(b.dataset.idea);
});

function refreshNounLabels() {
  $('#typesMenuBtn').textContent = `★ Types ${deNoun()} et tâches à préparer`;
}
refreshNounLabels();

/* ---------- Prestations : copies datées des modèles « pour chaque prestation » ---------- */

/** Crée les tâches manquantes d'une prestation ; déplace celles qui existent si sa date a changé. */
function syncEvent(ev, moved = false) {
  if (!ev) return 0;
  const all = store.all();
  // type changé ou plus une prestation : les tâches préparées (pas encore faites) qui ne vont plus partent à la corbeille
  const stale = staleForEvent(ev, all);
  if (stale.length) {
    const ids = stale.map((c) => c.id);
    store.removeMany(ids);
    const s = stale.length > 1 ? 's' : '';
    toast(`${plural(stale.length, 'tâche')} préparée${s} retirée${s} de « ${ev.title} »`, { label: 'Annuler', run: () => store.untrash(ids) });
  }
  if (!ev.event) return 0;
  if (moved) {
    for (const c of all.filter((x) => x.forEvent === ev.id && !x.done)) {
      const tpl = all.find((x) => x.id === c.fromTemplate);
      if (tpl) {
        const { start, end } = fromTemplate(tpl, ev);
        store.update(c.id, { start, end });
      }
    }
  }
  const missing = missingForEvent(ev, all);
  if (!missing.length) return 0;
  store.add(withCategories(missing));
  toast(`${plural(missing.length, 'tâche')} préparée${missing.length > 1 ? 's' : ''} pour « ${ev.title} »`);
  return missing.length;
}

/** Après l'ajout de modèles : les prestations à venir reçoivent leurs tâches. */
function syncAllEvents() {
  for (const ev of store.all().filter((t) => t.event && t.start && t.end >= todayISO())) syncEvent(ev);
}

/** Nouvelle tâche datée qui ressemble à une prestation, alors que des modèles existent : on propose. */
function suggestEvent(created) {
  const tpls = store.all().filter((t) => t.perEvent && !t.deletedAt);
  if (!tpls.length) return;
  const typeWords = eventTypes.all().map((t) => t.name.toLowerCase());
  const looksLike = (t) => {
    const s = `${t.title} ${t.source || ''}`;
    return EVENT_WORDS.test(s) || typeWords.some((w) => s.toLowerCase().includes(w));
  };
  const ev = created.find((t) => t.start && !t.repeat && !t.perEvent && looksLike(t));
  if (!ev) return;
  const eventType = eventTypes.guess(`${ev.title} ${ev.source || ''}`);
  const n = tpls.filter((tpl) => appliesTo(tpl, { eventType })).length;
  if (!n) return;
  const label = eventType ? eventTypes.name(eventType).toLowerCase() : `date ${deNoun()}`;
  setTimeout(
    () =>
      toast(`« ${ev.title} » : ${label} ? ${plural(n, 'tâche')} à préparer`, {
        label: 'Oui',
        run: () => syncEvent(store.update(ev.id, { event: true, eventType })),
      }),
    1600
  );
}

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
  download(blob, `proello-${todayISO()}.json`);
});

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Retirer des tâches ajoutées récemment ---------- */

// Les tâches créées dans les mêmes secondes forment un « ajout » (un import, une dictée, des tâches de prestation).
const fmtWhen = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let recentBatches = [];

function batchesOf(list) {
  const since = Date.now() - 14 * 86400000;
  const recent = list.filter((t) => t.createdAt >= since).sort((a, b) => b.createdAt - a.createdAt);
  const out = [];
  for (const t of recent) {
    const last = out[out.length - 1];
    if (last && last.from - t.createdAt < 5000) {
      last.tasks.push(t);
      last.from = t.createdAt;
    } else out.push({ from: t.createdAt, at: t.createdAt, tasks: [t] });
  }
  return out.slice(0, 25);
}

function renderRecent() {
  recentBatches = batchesOf(store.all());
  const list = $('#recentList');
  if (!recentBatches.length) {
    list.innerHTML = '<li class="muted">Aucune tâche ajoutée ces 14 derniers jours.</li>';
    return refreshRecentCount();
  }
  list.innerHTML = recentBatches
    .map((b, i) => {
      const titles = b.tasks.slice(0, 3).map((t) => esc(t.title)).join(' · ') + (b.tasks.length > 3 ? ' …' : '');
      const ago = Math.round((Date.now() - b.at) / 60000);
      const when = ago < 60 ? `il y a ${ago < 1 ? 'moins d’1' : ago} min` : fmtWhen.format(new Date(b.at));
      return `<li><label>
        <input type="checkbox" data-batch="${i}" />
        <span><span><b>${plural(b.tasks.length, 'tâche')}</b> · ${when}</span><small>${titles}</small></span>
      </label></li>`;
    })
    .join('');
  refreshRecentCount();
}

function refreshRecentCount() {
  const ids = selectedRecentIds();
  const go = $('#recentGo');
  go.disabled = !ids.length;
  go.textContent = ids.length ? `Mettre ${plural(ids.length, 'tâche')} à la corbeille` : 'Mettre à la corbeille';
}

const selectedRecentIds = () =>
  [...$('#recentList').querySelectorAll('[data-batch]:checked')].flatMap((c) => recentBatches[c.dataset.batch].tasks.map((t) => t.id));

$('#recentBtn').addEventListener('click', () => {
  $('#menu').close();
  renderRecent();
  $('#recentDlg').showModal();
});

$('#recentList').addEventListener('change', (e) => {
  const box = e.target.closest('[data-batch]');
  if (!box) return;
  // cocher un ajout coche aussi tous les ajouts plus récents (« l'import et tout ce qui a suivi »)
  if (box.checked) $('#recentList').querySelectorAll('[data-batch]').forEach((c) => Number(c.dataset.batch) < Number(box.dataset.batch) && (c.checked = true));
  refreshRecentCount();
});

$('#recentGo').addEventListener('click', () => {
  const ids = selectedRecentIds();
  if (!ids.length) return;
  store.removeMany(ids);
  $('#recentDlg').close();
  toast(`${plural(ids.length, 'tâche')} mise${ids.length > 1 ? 's' : ''} à la corbeille`, { label: 'Annuler', run: () => store.untrash(ids) });
});

/* ---------- Import de tâches en nombre (tableau CSV, liste, sauvegarde) ---------- */

let pending = []; // tâches prêtes à être ajoutées
let importName = '';

$('#importBtn').addEventListener('click', () => {
  $('#menu').close();
  $('#importText').value = '';
  $('#importFileName').textContent = 'ou colle ta liste ou tes cellules ci-dessous';
  importName = '';
  previewImport();
  $('#importDlg').showModal();
});

$('#importTemplate').addEventListener('click', () => {
  download(new Blob([templateCSV(profiles.categories())], { type: 'text/csv;charset=utf-8' }), 'proello-modele.csv');
});

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  importName = file.name;
  $('#importFileName').textContent = file.name;
  $('#importText').value = decodeBytes(await file.arrayBuffer());
  previewImport();
});

let previewTimer = 0;
$('#importText').addEventListener('input', () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(previewImport, 250);
});

const KIND_LABEL = { table: 'Tableau', text: 'Liste (comprise comme une dictée)', backup: 'Sauvegarde Proello' };

function previewImport() {
  const box = $('#importPreview');
  const go = $('#importGo');
  pending = [];
  let result;
  try {
    result = readImport($('#importText').value, { name: importName, categories: profiles.categories(), now: new Date() });
  } catch {
    box.innerHTML = '<p class="import-warn">Ce fichier JSON n’est pas une sauvegarde Proello lisible.</p>';
    go.disabled = true;
    go.textContent = 'Ajouter';
    return;
  }
  const { fresh, duplicates } = withoutDuplicates(result.tasks, store.all());
  pending = result.kind === 'backup' ? fresh : withCategories(fresh);
  go.disabled = !pending.length;
  go.textContent = pending.length ? `Ajouter ${plural(pending.length, 'tâche')}` : 'Ajouter';
  if (!result.tasks.length && !result.skipped.length) return (box.innerHTML = '');
  const cats = Object.fromEntries(profiles.categories().map((c) => [c.id, c.name]));
  const notRead = result.skipped.filter((s) => s.kept);
  const dropped = result.skipped.filter((s) => !s.kept);
  const row = (t) => {
    const bits = [
      t.perEvent ? `Pour chaque ${t.perEvent.type ? eventTypes.name(t.perEvent.type).toLowerCase() : eventNoun()} (${describeOffsets(t.perEvent)})` : '',
      t.repeat ? `↻ ${describeRepeat(t)} dès ${relLabel(t.start).toLowerCase()}${t.repeat.until ? ` jusqu'au ${fmtShortDate(t.repeat.until)}` : ''}` : '',
      t.start && !t.repeat ? (t.start !== t.end ? `${relLabel(t.start)} → ${relLabel(t.end)}` : relLabel(t.end)) : '',
      t.time ? fmtTime(t.time, t.endTime) : '',
      cats[t.category] || '',
      t.urgent ? 'Urgent' : '',
      t.important ? 'Important' : '',
      t.done ? 'Terminée' : '',
    ].filter(Boolean);
    return `<li class="q-${quadrantOf(t)}"><b>${esc(t.title)}</b>${bits.length ? `<small>${esc(bits.join(' · '))}</small>` : ''}</li>`;
  };
  box.innerHTML = `
    <p><b>${KIND_LABEL[result.kind]}</b> : ${plural(pending.length, 'tâche')} à ajouter${
      duplicates ? `, ${plural(duplicates, 'doublon')} ignoré${duplicates > 1 ? 's' : ''}` : ''
    }.</p>
    ${pending.length ? `<ul>${pending.map(row).join('')}</ul>` : ''}
    ${
      result.skipped.length
        ? `${notRead.length ? `<p class="import-note">${plural(notRead.length, 'info')} sans date ou heure précise (répétition, « en continu »…) : gardée${notRead.length > 1 ? 's' : ''} telle${notRead.length > 1 ? 's' : ''} quelle${notRead.length > 1 ? 's' : ''} dans le détail de la tâche.</p>
            <ul class="import-notes">${notRead.map((s) => `<li>Ligne ${s.line} : ${esc(s.reason)}</li>`).join('')}</ul>` : ''}
          ${dropped.length ? `<ul class="import-warn">${dropped.map((s) => `<li>Ligne ${s.line} ignorée : ${esc(s.reason)}</li>`).join('')}</ul>` : ''}`
        : ''
    }`;
}

$('#importGo').addEventListener('click', () => {
  if (!pending.length) return;
  const before = store.all();
  const added = store.add(pending);
  $('#importDlg').close();
  if (added.some((t) => t.perEvent)) setTimeout(syncAllEvents, 2500);
  toast(`${plural(added.length, 'tâche')} importée${added.length > 1 ? 's' : ''}`, { label: 'Annuler', run: () => store.replaceAll(before) });
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
