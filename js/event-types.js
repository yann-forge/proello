// Types de prestation (Mariage, Concert, Séminaire…) et nom donné à ces moments selon le profil.
//
// Une tâche `event` porte un `eventType` (id d'un type, ou null). Un modèle porte `perEvent.type` :
// null = « pour chaque prestation », quel que soit son type ; sinon seulement pour ce type.

import { lsGet, lsSet, uid } from './util.js';

const K_TYPES = 'proello.eventTypes';
const K_NOUN = 'proello.eventNoun';

// Le mot qui parle à chaque profil : un artiste fait des prestations, un sportif des compétitions…
const NOUNS = {
  artiste: 'prestation',
  entrepreneur: 'mission',
  salarie: 'événement',
  association: 'événement',
  etudiant: 'examen',
  parent: 'événement',
  sportif: 'compétition',
  personnel: 'événement',
};
export const NOUN_CHOICES = ['prestation', 'événement', 'mission', 'projet', 'compétition', 'examen', 'rendez-vous'];

// Quelques types proposés en un geste, selon le mot choisi
export const TYPE_IDEAS = {
  prestation: ['Mariage', 'Concert', 'Soirée privée', 'Séminaire', 'Festival'],
  événement: ['Anniversaire', 'Réunion', 'Salon', 'Voyage'],
  mission: ['Mission courte', 'Mission longue', 'Formation donnée'],
  projet: ['Lancement', 'Livraison', 'Atelier'],
  compétition: ['Course', 'Match', 'Tournoi'],
  examen: ['Partiel', 'Oral', 'Concours'],
  'rendez-vous': ['Client', 'Médical', 'Administratif'],
};

export const eventTypes = {
  all: () => lsGet(K_TYPES, []),
  get: (id) => eventTypes.all().find((t) => t.id === id) || null,
  name: (id) => eventTypes.get(id)?.name || '',
  add(name) {
    name = String(name).trim();
    if (!name) return null;
    const list = eventTypes.all();
    const same = list.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (same) return same.id;
    const id = uid();
    lsSet(K_TYPES, [...list, { id, name }]);
    return id;
  },
  rename(id, name) {
    name = String(name).trim();
    if (name) lsSet(K_TYPES, eventTypes.all().map((t) => (t.id === id ? { ...t, name } : t)));
  },
  remove(id) {
    lsSet(K_TYPES, eventTypes.all().filter((t) => t.id !== id));
  },
  /** Type dont le nom apparaît dans le titre (« Mariage de Julie » → Mariage). */
  guess(text) {
    const s = String(text).toLowerCase();
    return eventTypes.all().find((t) => s.includes(t.name.toLowerCase()))?.id || null;
  },
};

/** « prestation », « événement »… choisi par l'utilisateur, sinon celui de son profil. */
export const eventNoun = () => lsGet(K_NOUN, null) || NOUNS[lsGet('proello.profile.active', null)] || 'événement';
/** « de prestation », « d'événement » */
export const deNoun = (w = eventNoun()) => (/^[aeiouyhéèêàâîôû]/i.test(w) ? `d’${w}` : `de ${w}`);
export const setEventNoun = (noun) => lsSet(K_NOUN, String(noun || '').trim().toLowerCase() || null);

const PLURAL_X = /(eau|au|eu)$/;
export const plural = (w) => (/[sxz]$/.test(w) ? w : PLURAL_X.test(w) ? `${w}x` : `${w}s`);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
