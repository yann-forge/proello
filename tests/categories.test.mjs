// Catégories devinées d'après la dictée : `node --test tests/`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// profiles.js lit le stockage du navigateur : on fournit un faux localStorage minimal
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = { addEventListener: () => {} };
const { PRESETS } = await import('../js/profiles.js');
const { categorize } = await import('../js/categorize.js');

const cat = (profile, text) => {
  const cats = PRESETS[profile].categories;
  const id = categorize(text, cats);
  return id && cats.find((c) => c.id === id).name;
};

test('chaque profil a ses catégories, avec les catégories communes', () => {
  assert.equal(Object.keys(PRESETS).length, 8);
  for (const p of Object.values(PRESETS)) {
    const names = p.categories.map((c) => c.name);
    for (const common of ['Quotidien & maison', 'Temps pour moi']) assert.ok(names.includes(common), `${p.name} : ${common}`);
    assert.equal(new Set(p.categories.map((c) => c.id)).size, names.length, `${p.name} : identifiants uniques`);
  }
  assert.ok(PRESETS.artiste.categories.some((c) => c.name === 'Practice routine'));
});

test('artiste', () => {
  assert.equal(cat('artiste', 'Composer le refrain du nouveau morceau'), 'Création');
  assert.equal(cat('artiste', 'Mixer le titre au studio'), 'Réalisation & production');
  assert.equal(cat('artiste', 'Faire mes gammes et la routine du matin'), 'Practice routine');
  assert.equal(cat('artiste', 'Envoyer la démo aux labels'), 'Démarchage & diffusion');
  assert.equal(cat('artiste', 'Préparer la balance du concert'), 'Concerts & événements');
  assert.equal(cat('artiste', 'Poster le teaser sur Instagram'), 'Communication & réseaux');
  assert.equal(cat('artiste', 'Déclarer mes droits et payer la facture'), 'Administratif');
  assert.equal(cat('artiste', 'Faire les courses pour remplir le frigo'), 'Quotidien & maison');
  assert.equal(cat('artiste', 'Lire un livre et faire une sieste'), 'Temps pour moi');
});

test('association : l’exemple du mécénat', () => {
  assert.equal(cat('association', 'Envoyer 50 mails pour trouver des mécènes'), 'Mécénat & financement');
  assert.equal(cat('association', "Préparer l'ordre du jour de l'assemblée générale"), 'Réunions & AG');
  assert.equal(cat('association', 'Relancer les cotisations des adhérents'), 'Adhérents & bénévoles');
});

test('autres profils', () => {
  assert.equal(cat('etudiant', 'Réviser le partiel de droit'), 'Examens');
  assert.equal(cat('etudiant', 'Faire les courses'), 'Quotidien & maison'); // et pas « Cours »
  assert.equal(cat('parent', 'Prendre rendez-vous chez le pédiatre'), 'Santé');
  assert.equal(cat('sportif', 'Séance de fractionné mardi'), 'Entraînement');
  assert.equal(cat('personnel', 'Appeler maman pour son anniversaire'), 'Famille & amis');
});

test('aucune catégorie quand rien ne correspond', () => {
  assert.equal(cat('artiste', 'Truc à voir'), null);
});

test('une catégorie créée par l’utilisateur est reconnue par son nom', () => {
  const cats = [...PRESETS.personnel.categories, { id: 'jardin', name: 'Jardin', color: '#000' }];
  assert.equal(categorize('Tailler la haie du jardin', cats), 'jardin');
});
