// Phrases pièges : vérifient que les règles ne se contredisent pas entre elles (`node --test tests/`).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = { addEventListener: () => {} };
const { parseDictation } = await import('../js/parser.js');
const { PRESETS } = await import('../js/profiles.js');
const { categorize } = await import('../js/categorize.js');

const NOW = new Date(2026, 10, 24, 10, 0); // mardi 24 novembre 2026
const p = (s) => parseDictation(s, NOW).map((t) => (t.start ? `${t.title} [${t.start}→${t.end}]` : t.title));

test('« pour finir / pour commencer » + complément : un but, pas une nouvelle tâche', () => {
  assert.deepEqual(p('réserver une salle pour finir le montage du clip'), ['Réserver salle']);
  assert.deepEqual(p('acheter du bois pour commencer la cabane'), ['Acheter du bois']);
  // en début de phrase ou devant un verbe, ils séparent toujours
  assert.deepEqual(p('ranger le studio. pour finir appeler Paul'), ['Ranger studio', 'Appeler Paul']);
  assert.deepEqual(p("d'abord appeler le notaire puis signer"), ['Appeler notaire', 'Signer']);
});

test('« d’abord », « en parallèle », « enfin » au milieu d’une idée ne coupent pas', () => {
  assert.deepEqual(p("appeler d'abord Paul puis Marie"), ['Appeler Paul', 'Appeler Marie']);
  assert.deepEqual(p('travailler en parallèle sur les deux projets').length, 1);
  assert.deepEqual(p('enfin bref ranger le bureau'), ['Ranger bureau']);
});

test('jours non consécutifs : une tâche par jour ; consécutifs : une période', () => {
  assert.deepEqual(p('sport lundi et jeudi'), ['Sport [2026-11-30→2026-11-30]', 'Sport [2026-12-03→2026-12-03]']);
  assert.deepEqual(p('piscine lundi, mercredi et vendredi'), [
    'Piscine [2026-11-30→2026-11-30]',
    'Piscine [2026-12-02→2026-12-02]',
    'Piscine [2026-12-04→2026-12-04]',
  ]);
  assert.deepEqual(p('répéter jeudi et vendredi'), ['Répéter [2026-11-26→2026-11-27]']);
  assert.deepEqual(p('cours le 3 et le 10'), ['Cours [2026-12-03→2026-12-03]', 'Cours [2026-12-10→2026-12-10]']);
  // « entre » reste une période même si les jours ne se suivent pas
  assert.deepEqual(p('vacances entre lundi et jeudi'), ['Vacances [2026-11-30→2026-12-03]']);
});

test('le thème n’écrase pas un destinataire', () => {
  assert.deepEqual(p('préparer le salon du livre puis envoyer le rapport à Paul'), ['Préparer salon du livre', 'Envoyer rapport à Paul']);
  assert.deepEqual(p('préparer le salon du livre puis faire le point avec Paul'), ['Préparer salon du livre', 'Faire point avec Paul']);
  // sans destinataire, le thème est repris
  assert.deepEqual(p('préparer le salon du livre puis faire le bilan'), ['Préparer salon du livre', 'Bilan salon du livre']);
});

test('une durée n’est pas un horaire', () => {
  assert.deepEqual(p('répéter demain 2 heures'), ['Répéter 2 heures [2026-11-25→2026-11-25]']);
  assert.deepEqual(p('appeler Paul demain à 10 heures'), ['Appeler Paul [2026-11-25→2026-11-25]']);
  assert.deepEqual(p('rendre le dossier vendredi 15h'), ['Rendre dossier [2026-11-27→2026-11-27]']);
});

test('mots-clés courts : « poste » n’est pas « post », « livre » n’est pas « live »', () => {
  const cats = PRESETS.artiste.categories;
  const name = (s) => cats.find((c) => c.id === categorize(s, cats))?.name ?? null;
  assert.notEqual(name('passer à la poste'), 'Communication & réseaux');
  assert.equal(name('acheter un livre'), 'Temps pour moi');
  assert.equal(name('faire un post sur Instagram'), 'Communication & réseaux');
  assert.equal(name('mixer le titre'), 'Réalisation & production');
  assert.equal(name('préparer le live de samedi'), 'Concerts & événements');
});

test('phrase sans verbe : on reprend le verbe de la tâche précédente', () => {
  assert.deepEqual(p('appeler Paul puis Marie'), ['Appeler Paul', 'Appeler Marie']);
  assert.deepEqual(p('acheter du pain puis du lait et ensuite de la farine'), ['Acheter du pain', 'Acheter du lait', 'Acheter farine']);
  assert.deepEqual(p('écrire à Paul puis à Marie Dupont'), ['Écrire à Paul', 'Écrire à Marie Dupont']);
  assert.deepEqual(p('appeler Paul puis Marie jeudi'), ['Appeler Paul', 'Appeler Marie [2026-11-26→2026-11-26]']);
  // pas de reprise : un nom commun, une phrase avec son propre verbe, ou pas de verbe avant
  assert.deepEqual(p('appeler Paul puis la réunion'), ['Appeler Paul', 'Réunion']);
  assert.deepEqual(p('préparer le dossier puis Dupont valide'), ['Préparer dossier', 'Dupont valide']);
  assert.deepEqual(p('réunion lundi puis Marie'), ['Réunion [2026-11-30→2026-11-30]', 'Marie']);
});
