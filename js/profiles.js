// Profils d'utilisateur et leurs catégories.
// Les profils prédéfinis sont ci-dessous ; l'utilisateur peut les modifier (copie enregistrée sur l'appareil)
// ou créer les siens. L'identifiant d'une catégorie vient de son nom d'origine et ne change pas quand on la renomme,
// ce qui permet aux catégories communes (Administratif, Quotidien & maison, Temps pour moi) de suivre d'un profil à l'autre.

import { lsGet, lsSet } from './util.js';

export const COLORS = ['#FFCFA8', '#BFE6C4', '#FFE88F', '#CFE2FF', '#F5CDEA', '#DDD3FA', '#C6EDE7', '#F8CFC6', '#E3DACB', '#E2F0B8'];

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ADMIN = 'Administratif';
const HOME = 'Quotidien & maison';
const ME = 'Temps pour moi';

const DEFS = [
  ['artiste', '🎨', 'Artiste / musicien / producteur', ['Création', 'Réalisation & production', 'Practice routine', 'Démarchage & diffusion', 'Concerts & événements', 'Communication & réseaux', ADMIN, HOME, ME]],
  ['entrepreneur', '💼', 'Entrepreneur / indépendant', ['Clients', 'Prospection', 'Projets & production', 'Communication & marketing', 'Finances & factures', 'Formation', ADMIN, HOME, ME]],
  ['salarie', '🏢', 'Salarié / cadre', ['Projets', 'Réunions', 'Équipe & management', 'Reporting', 'Clients & partenaires', 'Formation & carrière', ADMIN, HOME, ME]],
  ['association', '🤝', 'Association / bénévole', ['Mécénat & financement', 'Événements', 'Adhérents & bénévoles', 'Partenariats', 'Communication', 'Réunions & AG', 'Administratif & compta', HOME, ME]],
  ['etudiant', '🎓', 'Étudiant', ['Cours', 'Devoirs & révisions', 'Examens', 'Projets & stages', 'Vie associative', 'Job & budget', ADMIN, HOME, ME]],
  ['parent', '👨‍👩‍👧', 'Parent / famille', ['Enfants', 'École & activités', 'Courses & repas', 'Santé', 'Sorties & loisirs', 'Budget', ADMIN, HOME, ME]],
  ['sportif', '🏃', 'Sportif / coach', ['Entraînement', 'Compétitions', 'Nutrition', 'Récupération & santé', 'Matériel', 'Objectifs & suivi', ADMIN, HOME, ME]],
  ['personnel', '🏠', 'Vie personnelle', ['Travail', 'Courses', 'Santé & sport', 'Famille & amis', 'Loisirs', 'Finances', ADMIN, HOME, ME]],
];

const category = (name, i) => ({ id: slug(name), name, color: COLORS[i % COLORS.length] });

export const PRESETS = Object.fromEntries(
  DEFS.map(([id, emoji, name, cats]) => [id, { id, emoji, name, preset: true, categories: cats.map(category) }])
);

export const COMMON_CATEGORIES = [ADMIN, HOME, ME];

// Nombre de catégories par profil (essai à 9, voulu par l'utilisateur)
export const MAX_CATEGORIES = 9;

const K_PROFILES = 'proello.profiles'; // profils créés ou modifiés
const K_ACTIVE = 'proello.profile.active';
const subscribers = new Set();

let stored = lsGet(K_PROFILES, {});

const emit = () => subscribers.forEach((fn) => fn());

export const profiles = {
  all() {
    const merged = { ...PRESETS, ...stored };
    return Object.values(merged);
  },
  get: (id) => stored[id] || PRESETS[id] || null,
  activeId: () => lsGet(K_ACTIVE, null),
  active() {
    const id = lsGet(K_ACTIVE, null);
    return (id && profiles.get(id)) || null;
  },
  categories: () => profiles.active()?.categories || [],
  category: (id) => profiles.categories().find((c) => c.id === id) || null,

  choose(id) {
    lsSet(K_ACTIVE, id);
    emit();
  },

  save(profile) {
    stored = { ...stored, [profile.id]: profile };
    lsSet(K_PROFILES, stored);
    emit();
  },

  /** Modifie le profil actif (crée une copie personnelle s'il s'agit d'un profil prédéfini). */
  update(fn) {
    const p = profiles.active();
    if (!p) return;
    const copy = JSON.parse(JSON.stringify(p));
    fn(copy);
    profiles.save(copy);
  },

  create(name, emoji = '✨') {
    let id = slug(name) || 'profil';
    while (profiles.get(id)) id += '-2';
    const p = { id, emoji, name: name.trim(), preset: false, categories: COMMON_CATEGORIES.map(category) };
    profiles.save(p);
    profiles.choose(id);
    return p;
  },

  /** Profil prédéfini : revient aux catégories d'origine. Profil créé : le supprime. */
  resetOrDelete(id) {
    const next = { ...stored };
    delete next[id];
    stored = next;
    lsSet(K_PROFILES, stored);
    if (!PRESETS[id] && profiles.activeId() === id) lsSet(K_ACTIVE, null);
    emit();
  },

  isModified: (id) => !!(stored[id] && PRESETS[id]),

  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};

/** Nouvel identifiant de catégorie unique dans une liste. */
export function newCategoryId(name, list) {
  const base = slug(name) || 'categorie';
  let id = base;
  let n = 2;
  while (list.some((c) => c.id === id)) id = `${base}-${n++}`;
  return id;
}

window.addEventListener('storage', (e) => {
  if (e.key === K_PROFILES) stored = lsGet(K_PROFILES, {});
  if (e.key === K_PROFILES || e.key === K_ACTIVE) emit();
});
