// Thème commun entre tâches d'une même dictée (rapport #2) : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictation } from '../js/parser.js';

const NOW = new Date(2026, 10, 23, 17, 47);
const titles = (s) => parseDictation(s, NOW).map((t) => t.title);

test('rapport #2 reconstitué : le thème « mécénat » reste sur les deux tâches', () => {
  const r = parseDictation(
    "Envoyer 50 mails pour trouver des mécènes pour les activités de l'association avant le 4 décembre. " +
      "Puis un bilan et rapport devra être fait et rapporter aux membres de l'association le 4 décembre.",
    NOW
  );
  assert.deepEqual(
    r.map((t) => [t.title, t.start, t.end]),
    [
      ['Envoyer 50 mails mécénat', '2026-11-23', '2026-12-04'],
      ['Bilan rapport mécénat', '2026-12-04', '2026-12-04'],
    ]
  );
  // le détail garde la phrase dictée complète
  assert.match(r[1].notes, /bilan et rapport devra être fait/i);
});

test("une tâche de suivi reprend l'objet de la tâche précédente", () => {
  assert.deepEqual(titles('Préparer le salon du livre entre lundi et mercredi. Ensuite faire le bilan.'), [
    'Préparer salon du livre',
    'Bilan salon du livre',
  ]);
  assert.deepEqual(titles('Organiser la tombola de Noël puis rédiger le compte rendu'), [
    'Organiser tombola de Noël',
    'Compte-rendu tombola de Noël',
  ]);
  assert.deepEqual(titles('Lancer la campagne de sponsoring puis relance la semaine prochaine'), [
    'Lancer campagne de sponsoring',
    'Relance sponsoring',
  ]);
});

test('pas de thème ajouté quand ce n’est pas une tâche de suivi ou que le sujet est déjà dit', () => {
  assert.deepEqual(titles('Appeler le plombier puis acheter du pain'), ['Appeler le plombier', 'Acheter du pain']);
  assert.deepEqual(titles('Préparer le salon du livre puis faire le bilan de la saison'), [
    'Préparer salon du livre',
    'Faire bilan de saison',
  ]);
  // « finir le rapport » n'est pas un suivi de la tâche d'avant
  assert.deepEqual(titles("envoyer le colis puis finir le rapport"), ['Envoyer le colis', 'Finir le rapport']);
  // première tâche de la dictée : pas de tâche précédente
  assert.deepEqual(titles('Faire le bilan'), ['Faire le bilan']);
});

test('un thème connu n’est ajouté que s’il manque et qu’il reste de la place', () => {
  // le thème est déjà dans le titre (« mécènes »)
  assert.deepEqual(titles('Trouver des mécènes pour le festival'), ['Trouver mécènes pour festival']);
  // « comptable » (une personne) n'est pas le thème « comptabilité »
  assert.deepEqual(titles('La facture du traiteur doit être envoyée à la comptable'), ['Facture du traiteur']);
  assert.deepEqual(titles('Envoyer les relances de cotisations aux adhérents en retard de paiement'), ['Envoyer relances de cotisations']);
});
