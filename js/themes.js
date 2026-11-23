// Thème commun à plusieurs tâches d'une même dictée.
//
// Exemple : « Envoyer 50 mails pour trouver des mécènes… Puis un bilan et rapport aux membres. »
//   → « Envoyer 50 mails mécénat » et « Bilan rapport mécénat »
//
// Deux règles, sans IA :
//  1. Un thème connu (lexique ci-dessous) est ajouté au titre de sa tâche quand le résumé l'a coupé
//     et qu'il reste de la place (4 mots maximum).
//  2. Une tâche de suivi (bilan, rapport, compte rendu, relance…) qui ne dit pas de quoi elle parle
//     reprend le thème de la tâche précédente : son thème connu, sinon l'objet de son titre.

import { MAX_WORDS } from './summarize.js';

const fold = (w) =>
  String(w || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

// Début de mot (sans accents) → thème affiché
const LEXICON = [
  ['mecen', 'mécénat'],
  ['sponsor', 'sponsoring'],
  ['partenari', 'partenariats'],
  ['partenaire', 'partenariats'],
  ['subvention', 'subventions'],
  ['benevol', 'bénévolat'],
  ['adherent', 'adhésions'],
  ['adhesion', 'adhésions'],
  ['donateur', 'dons'],
  ['cotisation', 'cotisations'],
  ['recrut', 'recrutement'],
  ['candidat', 'recrutement'],
  ['budget', 'budget'],
  ['comptabilit', 'comptabilité'],
  ['newsletter', 'newsletter'],
  ['inscription', 'inscriptions'],
  ['demenag', 'déménagement'],
  ['assembleegenerale', 'AG'],
];

// Noms qui annoncent une tâche de suivi
const FOLLOW_UP = new Set(
  ['bilan', 'bilans', 'rapport', 'rapports', 'compterendu', 'cr', 'suivi', 'relance', 'relances', 'synthese', 'recap', 'recapitulatif', 'debrief', 'debriefing', 'retour', 'retours', 'point'].map(fold)
);
const FOLLOW_VERBS = new Set(['faire', 'rediger', 'ecrire', 'preparer', 'presenter', 'envoyer', 'transmettre', 'dresser', 'etablir', 'organiser'].map(fold));
const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'l', 'et', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'notre', 'nos'].map(fold));
const PREPS = new Set(['de', 'du', 'des', 'd', 'a', 'au', 'aux', 'pour', 'avec', 'sur', 'en', 'dans', 'par', 'chez'].map(fold));
// Compléments qui ne sont pas un sujet (« rapport aux membres », « bilan de l'équipe »)
const GENERIC = new Set(['membres', 'equipe', 'association', 'asso', 'bureau', 'gens', 'personnes', 'tous', 'tout', 'moi', 'lui', 'eux'].map(fold));

const words = (s) => String(s || '').split(/\s+/).filter(Boolean);
const normWord = (w) => fold(w.replace(/^(?:l|d|j|qu|m|t|s|n|c)['’]/i, ''));
const isVerb = (w) => /(?:er|ir|re|oir)$/.test(fold(w)) && !FOLLOW_UP.has(fold(w));

/** Thème connu présent dans un texte : { label, word } ou null. */
export function lexiconTheme(text) {
  const list = words(text).map(normWord);
  const joined = list.join('');
  for (const [stem, label] of LEXICON) {
    if (stem === 'assembleegenerale') {
      if (joined.includes(stem)) return { label, stem };
      continue;
    }
    const w = list.find((x) => x.startsWith(stem));
    if (w) return { label, stem };
  }
  return null;
}

/** Le titre commence-t-il par un mot de suivi (éventuellement après un verbe : « Faire le bilan ») ? */
function followUpHead(title) {
  const ws = words(joinCompteRendu(title));
  let i = 0;
  const verb = ws[0] && isVerb(ws[0]) ? ws[0] : null;
  if (verb) i = 1;
  while (ws[i] && ARTICLES.has(normWord(ws[i]))) i++;
  if (!ws[i] || !FOLLOW_UP.has(normWord(ws[i]))) return null;
  // groupe de noms de suivi : « bilan et rapport », « compte-rendu »
  const nouns = [];
  while (ws[i] && (FOLLOW_UP.has(normWord(ws[i])) || normWord(ws[i]) === 'et')) {
    if (normWord(ws[i]) !== 'et') nouns.push(ws[i]);
    i++;
  }
  return { verb, nouns, rest: ws.slice(i) };
}

/** La phrase précise-t-elle déjà son sujet (« bilan de la campagne », « rapport sur le salon ») ? */
function hasOwnTopic(full) {
  const ws = words(joinCompteRendu(full));
  let i = ws.findIndex((w) => FOLLOW_UP.has(normWord(w)));
  if (i < 0) return false;
  while (ws[i] && (FOLLOW_UP.has(normWord(ws[i])) || normWord(ws[i]) === 'et')) i++;
  const w = ws[i];
  if (!w) return false;
  // « bilan d'activité » : le mot collé au « d' » est le sujet
  if (/^d['’]/i.test(w)) return !GENERIC.has(normWord(w));
  if (!['de', 'du', 'des', 'sur', 'concernant'].includes(fold(w))) return false;
  // premier mot plein après « de / sur » : générique (« de l'association ») ou vrai sujet ?
  let j = i + 1;
  while (ws[j] && ARTICLES.has(fold(ws[j]))) j++;
  return !!ws[j] && !GENERIC.has(normWord(ws[j]));
}

const joinCompteRendu = (s) => String(s || '').replace(/compte[-\s]rendu/giu, 'compte-rendu');

/** Objet d'un titre : le titre sans son verbe (« Préparer salon du livre » → « salon du livre »). */
function objectOf(title) {
  const ws = words(title);
  const rest = ws[0] && isVerb(ws[0]) ? ws.slice(1) : ws;
  while (rest[0] && ARTICLES.has(normWord(rest[0]))) rest.shift();
  return rest.length ? rest.join(' ') : null;
}

function fit(parts) {
  // parts : listes de mots, par ordre de priorité de suppression inverse
  let all = parts.flat();
  if (all.length <= MAX_WORDS) return all.join(' ');
  // retirer les petits mots du thème
  all = all.filter((w, i) => i === 0 || !PREPS.has(normWord(w)));
  return all.slice(0, MAX_WORDS).join(' ');
}

/**
 * Applique les règles de thème à la liste des tâches d'une même dictée (modifiée en place).
 * Chaque tâche : { title, full } où `full` est la phrase nettoyée avant résumé.
 */
export function applyThemes(tasks) {
  for (const t of tasks) t.theme = lexiconTheme(t.full);

  tasks.forEach((t, i) => {
    // règle 2 : tâche de suivi sans sujet → thème de la tâche précédente
    const head = followUpHead(t.title);
    if (head && i > 0 && !t.theme && !hasOwnTopic(t.full)) {
      const prev = tasks[i - 1];
      // l'objet de la tâche précédente n'est repris que pour une vraie tournure de suivi
      // (« puis le bilan », « faire / rédiger le compte rendu »), pas « finir le rapport »
      const followVerb = !head.verb || FOLLOW_VERBS.has(fold(head.verb));
      const theme = prev.theme ? prev.theme.label : followVerb ? objectOf(prev.title) : null;
      if (theme) {
        const themeWords = words(theme);
        let title = fit([head.verb ? [head.verb] : [], head.nouns.slice(0, 2), themeWords]);
        if (head.verb && words(title).length >= MAX_WORDS && words([...head.nouns.slice(0, 2), ...themeWords].join(' ')).length <= MAX_WORDS) {
          title = [...head.nouns.slice(0, 2), ...themeWords].join(' ');
        }
        t.title = title[0].toLocaleUpperCase('fr-FR') + title.slice(1);
        t.themed = true;
        return;
      }
    }
    // règle 1 : thème connu coupé par le résumé → on l'ajoute s'il reste de la place
    if (t.theme && words(t.title).length < MAX_WORDS) {
      const already = words(t.title).some((w) => normWord(w).startsWith(t.theme.stem) || fold(w) === fold(t.theme.label));
      if (!already) {
        t.title = `${t.title} ${t.theme.label}`;
        t.themed = true;
      }
    }
  });
  return tasks;
}
