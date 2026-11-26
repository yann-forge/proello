// Import de tâches en nombre : tableau CSV / collage Excel, liste de texte, sauvegarde JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readImport, parseTable, parseDateCell, parseTimeCell, withoutDuplicates, templateCSV, decodeBytes } from '../js/importer.js';

const now = new Date(2026, 10, 26, 10, 0); // jeudi 26 novembre 2026
const cats = [
  { id: 'administratif', name: 'Administratif' },
  { id: 'quotidien-maison', name: 'Quotidien & maison' },
  { id: 'creation', name: 'Création' },
];

test('tableau Excel français (point-virgule, guillemets, accents)', () => {
  const csv = 'Titre;Urgent;Important;Début;Échéance;Heure;Catégorie;Détail;Terminée\r\n' +
    'Appeler le comptable;oui;x;;27/11/2026;10h30;administratif;"Questions ; TVA";\r\n' +
    'Ranger;;;;;;Quotidien & maison;;oui\r\n';
  const r = readImport(csv, { categories: cats, now });
  assert.equal(r.kind, 'table');
  assert.equal(r.tasks.length, 2);
  const [a, b] = r.tasks;
  assert.deepEqual(
    { title: a.title, urgent: a.urgent, important: a.important, start: a.start, end: a.end, time: a.time, category: a.category, notes: a.notes },
    { title: 'Appeler le comptable', urgent: true, important: true, start: '2026-11-27', end: '2026-11-27', time: '10:30', category: 'administratif', notes: 'Questions ; TVA' }
  );
  assert.equal(b.done, true);
  assert.equal(b.category, 'quotidien-maison');
});

test('cellules collées depuis Excel / Sheets (tabulations), noms de colonnes variés', () => {
  const r = readImport('Tâche\tPriorité\tDate\nAppeler Marie\turgent et important\t3/12\nRelancer Paul\tplanifier\tdemain\n', { now });
  assert.equal(r.kind, 'table');
  assert.deepEqual(r.tasks.map((t) => [t.title, t.urgent, t.important, t.start]), [
    ['Appeler Marie', true, true, '2026-12-03'],
    ['Relancer Paul', false, true, '2026-11-27'],
  ]);
});

test('période en début / échéance ; le titre du tableau est gardé tel quel', () => {
  const r = readImport('titre,debut,echeance\nTrouver un lieu de tournage « ambiance mariage »,1/12/2026,5/12/2026\n', { now });
  const [t] = r.tasks;
  assert.equal(t.start, '2026-12-01');
  assert.equal(t.end, '2026-12-05');
  assert.equal(t.title, 'Trouver un lieu de tournage « ambiance mariage »');
});

test('rétroplanning : répétitions, « en continu » et tâches « pour chaque prestation »', () => {
  const csv = 'Titre;Début;Échéance;Heure;Détails\n' +
    'Candidature hebdomadaire;07/12/2026;Chaque semaine;Lundi matin;1 candidature par semaine\n' +
    'Publier 2 vidéos courtes par semaine;22/12/2026;30/09/2027;Mardi et vendredi;\n' +
    'Répondre dans la journée;07/12/2026;En continu;;\n' +
    'Brief avec les mariés;J-30 avant chaque date;J-15 avant chaque date;;\n' +
    'Demander un avis;Après chaque date;J+7 après chaque date;;\n' +
    'Bilan de saison;01/10/2027;31/10/2027;;\n' +
    'Point hebdo;;;Lundi;\n';
  const r = readImport(csv, { now });
  const [cand, pub, rep, brief, avis, , point] = r.tasks;
  assert.deepEqual(r.skipped, []);
  // chaque lundi 9h à partir du lundi 7 décembre, sans fin
  assert.deepEqual([cand.start, cand.time, cand.repeat.freq, cand.repeat.days, cand.repeat.until], ['2026-12-07', '09:00', 'week', [1], undefined]);
  assert.equal(cand.notes, '1 candidature par semaine');
  // chaque mardi et vendredi du 22/12/2026 au 30/09/2027
  assert.deepEqual([pub.start, pub.repeat.days, pub.repeat.until], ['2026-12-22', [2, 5], '2027-09-30']);
  // en continu : jusqu'à la dernière date du rétroplanning
  assert.deepEqual([rep.start, rep.end, rep.repeat], ['2026-12-07', '2027-10-31', undefined]);
  // modèles « pour chaque prestation »
  assert.deepEqual([brief.perEvent, brief.start], [{ from: -30, to: -15 }, null]);
  assert.deepEqual(avis.perEvent, { from: 1, to: 7 });
  // un jour sans date ni répétition : chaque lundi
  assert.deepEqual([point.repeat.freq, point.repeat.days, point.start], ['week', [1], '2026-11-30']);
});

test('ligne sans titre ignorée, date incomprise signalée mais tâche gardée', () => {
  const r = readImport('Titre;Échéance\n;27/11/2026\nAppeler Paul;bientôt peut-être\n', { now });
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].start, null);
  assert.deepEqual(r.skipped.map((s) => [s.line, !!s.kept]), [[2, false], [3, true]]);
});

test('liste de texte : une tâche par ligne, comprise comme une dictée', () => {
  const r = readImport('- Appeler Paul demain urgent\n- [x] Payer la facture\n\n3. Ranger le garage samedi', { now });
  assert.equal(r.kind, 'text');
  assert.deepEqual(r.tasks.map((t) => [t.title, t.start, t.urgent, t.done]), [
    ['Appeler Paul', '2026-11-27', true, false],
    ['Payer facture', null, false, true],
    ['Ranger garage', '2026-11-28', false, false],
  ]);
});

test('sauvegarde Proello (.json)', () => {
  const json = JSON.stringify({ app: 'proello', tasks: [{ id: 'a', title: 'Tâche A' }, { id: 'b', title: 'Jetée', deletedAt: 1 }] });
  const r = readImport(json, { name: 'proello-2026-11-26.json', now });
  assert.equal(r.kind, 'backup');
  assert.deepEqual(r.tasks.map((t) => t.id), ['a']);
  assert.throws(() => readImport('{pas du json', { name: 'x.json', now }));
});

test('doublons : déjà présentes ou répétées dans le fichier', () => {
  const existing = [{ id: 'a', title: 'Appeler Paul', start: '2026-11-27', end: '2026-11-27' }];
  const incoming = [
    { title: 'appeler paul', start: '2026-11-27', end: '2026-11-27' },
    { title: 'Appeler Paul', start: '2026-11-28', end: '2026-11-28' },
    { title: 'Ranger' },
    { title: 'Ranger' },
  ];
  const { fresh, duplicates } = withoutDuplicates(incoming, existing);
  assert.equal(fresh.length, 2);
  assert.equal(duplicates, 2);
});

test('cellules de date et d’heure', () => {
  assert.deepEqual(parseDateCell('2026-12-24', now), { start: '2026-12-24', end: '2026-12-24' });
  assert.deepEqual(parseDateCell('24/12/26', now), { start: '2026-12-24', end: '2026-12-24' });
  assert.deepEqual(parseDateCell('15/01', now), { start: '2027-01-15', end: '2027-01-15' }); // sans année : la prochaine
  assert.deepEqual(parseDateCell('du 5 au 7 décembre', now), { start: '2026-12-05', end: '2026-12-07' });
  assert.equal(parseDateCell('31/02/2026', now), null);
  assert.deepEqual(parseTimeCell('14h-16h'), { time: '14:00', endTime: '16:00' });
  assert.deepEqual(parseTimeCell('9:05'), { time: '09:05', endTime: null });
  assert.deepEqual(parseTimeCell('de 9h à 11h30'), { time: '09:00', endTime: '11:30' });
  assert.equal(parseTimeCell('bientôt'), null);
});

test('le modèle téléchargeable se réimporte tel quel', () => {
  const csv = templateCSV(cats, now);
  assert.ok(csv.startsWith('﻿Titre;Urgent;Important'));
  const r = readImport(csv, { categories: cats, now });
  assert.equal(r.kind, 'table');
  assert.equal(r.tasks.length, 5);
  assert.equal(r.skipped.length, 0);
});

test('fichiers CSV en UTF-8 ou en Windows-1252 (ancien Excel)', () => {
  assert.equal(decodeBytes(new TextEncoder().encode('﻿Échéance')), 'Échéance');
  assert.equal(decodeBytes(new Uint8Array([0xc9, 0x63, 0x68, 0xe9, 0x61, 0x6e, 0x63, 0x65])), 'Échéance');
  assert.deepEqual(parseTable('a;"b\nc";d\n'), [['a', 'b\nc', 'd']]);
});

test('les lignes vides ne décalent pas les numéros de ligne signalés', () => {
  const r = readImport('Titre;Échéance\nA;\n;\nB;jamais de la vie\n', { now });
  assert.deepEqual(r.skipped.map((x) => x.line), [4]);
});
