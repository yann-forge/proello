// Rapport d'erreur : texte dicté + ce que l'app a compris + ce qui était attendu.
// Le rapport s'ouvre comme une fiche GitHub déjà remplie dans le dépôt privé ; un bloc JSON
// à la fin sert à créer automatiquement un test (voir tools/import-reports.mjs).

import { parseDictation } from './parser.js';
import { relLabel, toLocalStamp } from './dates.js';
import { $, esc } from './util.js';
import { VERSION, REPORTS_REPO } from './version.js';

const PROBLEM_LABELS = {
  decoupage: 'Séparation des tâches',
  titre: 'Titre',
  dates: 'Dates / période',
  priorite: 'Urgent / important',
  voix: 'Mots mal entendus',
  autre: 'Autre',
};

let notify = () => {};
let at = new Date();
let expectedTouched = false;
const form = $('#reportForm');

export function initReport({ toast }) {
  notify = toast;
}

const dateText = (t) => (t.end ? (t.start && t.start !== t.end ? `${relLabel(t.start)} → ${relLabel(t.end)}` : relLabel(t.end)) : 'sans date');

function understood() {
  return parseDictation(form.input.value, at).map(({ title, start, end, urgent, important }) => ({ title, start, end, urgent, important }));
}

function renderUnderstood(list) {
  $('#reportUnderstood').innerHTML = list.length
    ? list
        .map(
          (t) => `<li><b>${esc(t.title)}</b><span>${esc(dateText(t))}${t.urgent ? ' · urgent' : ''}${t.important ? ' · important' : ''}</span></li>`
        )
        .join('')
    : '<li class="muted">Aucune tâche comprise</li>';
}

function expectedRow(t = {}) {
  const li = document.createElement('li');
  li.innerHTML = `
    <input class="rv-title" value="${esc(t.title || '')}" placeholder="Titre attendu" aria-label="Titre attendu" />
    <div class="row2 small-dates">
      <label class="field"><span>Début</span><input type="date" class="ex-start" value="${t.start || ''}" /></label>
      <label class="field"><span>Fin</span><input type="date" class="ex-end" value="${t.end || ''}" /></label>
    </div>
    <div class="rv-meta">
      <button type="button" class="pill pill-u ${t.urgent ? 'on' : ''}" data-flag="urgent" aria-pressed="${!!t.urgent}">Urgent</button>
      <button type="button" class="pill pill-i ${t.important ? 'on' : ''}" data-flag="important" aria-pressed="${!!t.important}">Important</button>
      <button type="button" class="rv-del" aria-label="Retirer">✕</button>
    </div>`;
  return li;
}

function readExpected() {
  return [...$('#reportExpected').children].map((li) => {
    const start = li.querySelector('.ex-start').value || null;
    const end = li.querySelector('.ex-end').value || start;
    return {
      title: li.querySelector('.rv-title').value.trim(),
      start: start || end || null,
      end: end || null,
      urgent: li.querySelector('[data-flag=urgent]').classList.contains('on'),
      important: li.querySelector('[data-flag=important]').classList.contains('on'),
    };
  });
}

function refresh() {
  const list = understood();
  renderUnderstood(list);
  if (!expectedTouched) $('#reportExpected').replaceChildren(...list.map(expectedRow));
}

export function openReport({ input = '', at: when = new Date() } = {}) {
  at = when instanceof Date && !isNaN(when) ? when : new Date();
  expectedTouched = false;
  form.reset();
  form.input.value = input;
  refresh();
  const dlg = $('#report');
  dlg.returnValue = '';
  dlg.showModal();
}

let timer;
form.input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(refresh, 300);
});

$('#reportExpected').addEventListener('input', () => (expectedTouched = true));
$('#reportExpected').addEventListener('click', (e) => {
  const flag = e.target.closest('[data-flag]');
  if (flag) {
    expectedTouched = true;
    const on = !flag.classList.contains('on');
    flag.classList.toggle('on', on);
    flag.setAttribute('aria-pressed', on);
  }
  if (e.target.closest('.rv-del')) {
    expectedTouched = true;
    e.target.closest('li').remove();
  }
});
$('#reportAddRow').addEventListener('click', () => {
  expectedTouched = true;
  $('#reportExpected').appendChild(expectedRow());
});

/* ---------- construction du rapport ---------- */

function collect() {
  return {
    app: 'proello',
    version: VERSION,
    now: toLocalStamp(at),
    input: form.input.value.trim(),
    problems: [...form.querySelectorAll('[name=problem]:checked')].map((c) => c.value),
    understood: understood(),
    expected: readExpected(),
    comment: form.comment.value.trim(),
  };
}

const row = (t) =>
  `| ${(t.title || '—').replace(/\|/g, '/')} | ${t.start || '—'} | ${t.end || '—'} | ${t.urgent ? 'oui' : ''} | ${t.important ? 'oui' : ''} |`;
const table = (list) =>
  list.length ? ['| Titre | Début | Fin | Urgent | Important |', '|---|---|---|---|---|', ...list.map(row)].join('\n') : '_aucune tâche_';

function issueBody(data, compact = false) {
  const parts = [
    '### Texte dicté',
    `> ${data.input.replace(/\n/g, '\n> ') || '_(vide)_'}`,
    '',
    `**Problèmes :** ${data.problems.map((p) => PROBLEM_LABELS[p]).join(', ') || 'non précisé'}`,
  ];
  if (data.comment) parts.push('', `**Commentaire :** ${data.comment}`);
  if (!compact) parts.push('', "### Compris par l'app", table(data.understood), '', '### Attendu', table(data.expected));
  parts.push('', `<sub>Dicté le ${data.now} · Proello ${data.version}</sub>`, '', '```json', JSON.stringify(data), '```');
  return parts.join('\n');
}

function issueUrl(data) {
  const title = `Rapport : ${data.input.slice(0, 70) || 'sans texte'}${data.input.length > 70 ? '…' : ''}`;
  const make = (body) =>
    `https://github.com/${REPORTS_REPO}/issues/new?labels=rapport&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  const url = make(issueBody(data));
  return url.length < 7800 ? url : make(issueBody(data, true));
}

function validate(data) {
  if (!data.input && !data.comment) {
    notify('Indique au moins le texte dicté ou un commentaire.');
    return false;
  }
  return true;
}

$('#reportCopy').addEventListener('click', async () => {
  const data = collect();
  if (!validate(data)) return;
  try {
    await navigator.clipboard.writeText(issueBody(data));
    notify('Rapport copié. Tu peux le coller dans la conversation avec Claude.');
  } catch {
    notify('Impossible de copier sur cet appareil.');
  }
});

$('#report').addEventListener('close', () => {
  if ($('#report').returnValue !== 'send') return;
  const data = collect();
  if (!validate(data)) {
    $('#report').returnValue = '';
    return $('#report').showModal();
  }
  window.open(issueUrl(data), '_blank', 'noopener');
  notify('Fiche GitHub ouverte : appuie sur « Create » / « Submit new issue » pour l’envoyer.');
});
