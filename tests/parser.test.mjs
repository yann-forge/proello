// Tests de l'analyseur de dictée : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictation } from '../js/parser.js';

// Lundi 23 novembre 2026
const NOW = new Date(2026, 10, 23, 10, 0);
const p = (s) => parseDictation(s, NOW);

test('découpe une dictée en plusieurs tâches', () => {
  const r = p("il faut que j'appelle le plombier puis acheter du pain ensuite envoyer le devis à Marc");
  assert.deepEqual(r.map((t) => t.title), ['Appeler le plombier', 'Acheter du pain', 'Envoyer le devis à Marc']);
});

test('remet le verbe à l’infinitif après « il faut que je »', () => {
  const said = [
    "il faut que je prépare le dossier", "il faut que j'envoie le colis", "il faut que je finisse le rapport",
    "il faut que j'achète des timbres", "il faut que je complète le formulaire", "il faut que je fasse les courses",
    "faut que j'aille à la poste", "il faut que je rappelle maman",
  ].join(' puis ');
  assert.deepEqual(p(said).map((t) => t.title), [
    'Préparer le dossier', 'Envoyer le colis', 'Finir le rapport', 'Acheter des timbres',
    'Compléter le formulaire', 'Faire les courses', 'Aller à la poste', 'Rappeler maman',
  ]);
});

test('détecte urgent et important', () => {
  const [a, b, c] = p("préparer la réunion c'est urgent et important. ranger le garage pas urgent. payer la facture urgent");
  assert.equal(a.title, 'Préparer la réunion');
  assert.deepEqual([a.urgent, a.important], [true, true]);
  assert.equal(b.title, 'Ranger le garage');
  assert.deepEqual([b.urgent, b.important], [false, false]);
  assert.deepEqual([c.urgent, c.important], [true, false]);
});

test('détecte les dates', () => {
  const [a, b, c, d, e] = p('appeler Paul demain puis réserver le restaurant pour vendredi puis dentiste le 3 décembre puis rapport dans 2 semaines puis courses après-demain');
  assert.equal(a.title, 'Appeler Paul');
  assert.deepEqual([a.start, a.end], ['2026-11-24', '2026-11-24']);
  assert.equal(b.title, 'Réserver le restaurant');
  assert.deepEqual([b.start, b.end], ['2026-11-23', '2026-11-27']);
  assert.equal(c.title, 'Dentiste');
  assert.equal(c.end, '2026-12-03');
  assert.equal(d.end, '2026-12-07');
  assert.equal(e.title, 'Courses');
  assert.equal(e.end, '2026-11-25');
});

test('ne coupe pas en plusieurs tâches sur les nombres ni les virgules', () => {
  const r = p('acheter 3 pommes, du lait et des œufs');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Acheter 3 pommes');
  assert.equal(r[0].notes, 'Acheter 3 pommes, du lait et des œufs.');
  assert.equal(r[0].end, null);
});

test('résume en 5 mots maximum et garde le texte dicté en détail', () => {
  const cases = [
    ["il faut que j'appelle le plombier parce que l'évier de la cuisine fuit depuis hier", 'Appeler le plombier'],
    ['envoyer le devis à Marc pour la rénovation de la salle de bain', 'Envoyer devis à Marc'],
    ["réserver une table au restaurant italien pour l'anniversaire de Léa", 'Réserver table au restaurant italien'],
    ['préparer la présentation pour le client Dupont avec les chiffres du trimestre', 'Préparer présentation pour client Dupont'],
    ['faire un point avec toute mon équipe sur les objectifs commerciaux', 'Faire point avec équipe'],
  ];
  for (const [said, title] of cases) {
    const [t] = p(said);
    assert.equal(t.title, title);
    assert.ok(t.title.split(' ').length <= 5);
    assert.ok(t.notes.length > t.title.length);
  }
});

test('pas de détail quand la tâche est déjà courte', () => {
  const [t] = p('appeler Paul demain urgent');
  assert.equal(t.title, 'Appeler Paul');
  assert.equal(t.notes, '');
});

test('ignore les fragments vides', () => {
  assert.deepEqual(p('premièrement'), []);
  assert.deepEqual(p('  '), []);
});
