// Devine la catégorie d'une tâche d'après ses mots (sans IA).
// Chaque catégorie a des débuts de mots typiques ; les mots du nom de la catégorie comptent aussi,
// ce qui fait marcher les catégories que l'utilisateur crée lui-même (« Jardin » → « tailler la haie du jardin »).

const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ');

// identifiant de catégorie → débuts de mots (sans accents). Une entrée avec un espace = expression.
const KEYWORDS = {
  administratif: ['factur', 'impot', 'papier', 'dossier', 'formulaire', 'declar', 'banque', 'bancaire', 'assuranc', 'contrat', 'courrier', 'mutuelle', 'caf', 'urssaf', 'administr', 'attestation', 'carte grise', 'passeport', 'prefecture', 'mairie', 'resili', 'abonnement', 'releve', 'paperasse', 'cheque', 'virement'],
  'quotidien-maison': ['menage', 'linge', 'lessive', 'repassage', 'vaisselle', 'aspirateur', 'poubelle', 'ranger', 'rangement', 'bricol', 'repar', 'jardin', 'plombier', 'electricien', 'maison', 'appart', 'frigo', 'courses', 'cuisine', 'nettoy', 'tondre', 'demenag', 'garage', 'voiture', 'pressing', 'cave', 'grenier'],
  'temps-pour-moi': ['lire', 'lecture', 'livre', 'sieste', 'medit', 'yoga', 'massage', 'detente', 'repos', 'balade', 'promenade', 'cinema', 'serie', 'film', 'bain', 'spa', 'coiffeur', 'souffler', 'me reposer', 'pour moi'],

  creation: ['compos', 'ecrire', 'ecriture', 'maquette', 'demo', 'idee', 'creer', 'creation', 'morceau', 'chanson', 'texte', 'paroles', 'dessin', 'croquis', 'beat', 'instru', 'melodie', 'toile', 'peindre', 'sculpt'],
  'realisation-production': ['mix', 'master', 'enregistr', 'studio', 'tournage', 'tourner', 'montage', 'monter', 'produire', 'production', 'realis', 'clip', 'pressage', 'arrange', 'prise de son'],
  'practice-routine': ['practice', 'routine', 'repet', 'gamme', 'entrain', 'exercice', 'echauff', 'travailler mon', 'travailler la', 'technique', 'dechiffr', 'metronome', 'solfege', 'vocalise'],
  'demarchage-diffusion': ['demarch', 'label', 'programmat', 'booker', 'booking', 'diffus', 'distrib', 'playlist', 'presse', 'candidat', 'tourneur', 'manager', 'radio', 'curateur', 'envoyer ma demo', 'salle de concert'],
  'concerts-evenements': ['concert', 'scene', 'festival', 'live', 'residence', 'spectacle', 'evenement', 'soiree', 'tournee', 'balance', 'showcase', 'vernissage', 'expo'],
  'communication-reseaux': ['post', 'publi', 'instagram', 'insta', 'facebook', 'tiktok', 'youtube', 'reseau', 'newsletter', 'communique', 'site', 'story', 'stories', 'teaser', 'photo', 'visuel', 'bio'],

  clients: ['client', 'devis', 'livraison', 'livrer', 'commande', 'rdv client', 'satisfaction'],
  prospection: ['prospect', 'relanc', 'demarch', 'appel d offre', 'lead', 'salon pro', 'rendez-vous commercial'],
  'projets-production': ['projet', 'livrable', 'production', 'produire', 'developp', 'maquette', 'prototype'],
  'communication-marketing': ['marketing', 'pub', 'campagne', 'site', 'post', 'reseau', 'newsletter', 'linkedin', 'instagram', 'logo', 'plaquette', 'seo'],
  'finances-factures': ['factur', 'paiement', 'payer', 'compta', 'tresor', 'budget', 'encaiss', 'tva', 'urssaf', 'impaye', 'banque', 'expert comptable'],
  formation: ['formation', 'former', 'cours ', 'tuto', 'apprendre', 'certif', 'webinaire', 'atelier'],

  projets: ['projet', 'livrable', 'planning', 'roadmap', 'jalon', 'specification', 'cahier des charges'],
  reunions: ['reunion', 'meeting', 'call', 'visio', 'point hebdo', 'comite', 'ordre du jour', 'compte rendu', 'seminaire'],
  'equipe-management': ['equipe', 'collaborat', 'entretien annuel', 'manager', 'recrut', 'onboard', 'one to one', 'stagiaire', 'conges'],
  reporting: ['reporting', 'rapport', 'kpi', 'tableau de bord', 'dashboard', 'bilan', 'synthese', 'indicateur', 'chiffres'],
  'clients-partenaires': ['client', 'partenaire', 'fournisseur', 'prestataire', 'devis'],
  'formation-carriere': ['formation', 'carriere', 'cv', 'entretien', 'certif', 'linkedin', 'evolution', 'candidature'],

  'mecenat-financement': ['mecen', 'sponsor', 'subvention', 'financ', 'donateur', 'dons', 'collecte', 'crowdfunding', 'fondation'],
  evenements: ['evenement', 'soiree', 'festival', 'salon', 'fete', 'tombola', 'concert', 'spectacle', 'kermesse', 'loto', 'brocante', 'vide grenier'],
  'adherents-benevoles': ['adherent', 'adhesion', 'benevol', 'cotisation', 'membre', 'inscription', 'licence'],
  partenariats: ['partenari', 'partenaire', 'convention'],
  communication: ['communication', 'post', 'publi', 'affiche', 'flyer', 'newsletter', 'site', 'reseau', 'facebook', 'instagram', 'presse'],
  'reunions-ag': ['reunion', 'assemblee', 'ag', 'bureau', 'conseil d administration', 'comite', 'ordre du jour', 'proces verbal', 'pv'],
  'administratif-compta': ['compta', 'factur', 'banque', 'statut', 'prefecture', 'assuranc', 'declar', 'budget', 'bilan financier', 'tresor', 'releve'],

  cours: ['cours ', 'td', 'tp', 'amphi', 'lecon', 'prof'],
  'devoirs-revisions': ['devoir', 'revis', 'exercice', 'fiche', 'dissert', 'expose'],
  examens: ['exam', 'partiel', 'controle', 'oral', 'concours', 'bac', 'soutenance', 'qcm'],
  'projets-stages': ['stage', 'projet', 'memoire', 'alternance', 'rapport de stage', 'these'],
  'vie-associative': ['asso', 'bde', 'club', 'gala', 'soiree etudiante'],
  'job-budget': ['job', 'budget', 'loyer', 'bourse', 'caf', 'salaire', 'baby sitting', 'shift'],

  enfants: ['enfant', 'bebe', 'couche', 'gouter', 'nounou', 'baby', 'fils', 'fille', 'petit', 'creche'],
  'ecole-activites': ['ecole', 'creche', 'college', 'lycee', 'maitresse', 'cantine', 'devoirs', 'judo', 'foot', 'danse', 'piscine', 'activite', 'kermesse', 'sortie scolaire', 'reunion parents'],
  'courses-repas': ['course', 'repas', 'menu', 'frigo', 'supermarche', 'marche', 'diner', 'dejeuner', 'cuisine', 'drive', 'liste de course'],
  sante: ['medecin', 'docteur', 'dentiste', 'pharmac', 'vaccin', 'ordonnance', 'kine', 'sante', 'ophtalmo', 'pediatre', 'orthophon', 'hopital', 'analyse', 'radio'],
  'sorties-loisirs': ['sortie', 'cinema', 'parc', 'musee', 'vacances', 'week end', 'loisir', 'anniversaire', 'zoo', 'piscine'],
  'budget-administratif': ['budget', 'factur', 'impot', 'banque', 'assuranc', 'papier', 'caf', 'administr', 'mutuelle', 'inscription'],

  entrainement: ['entrain', 'seance', 'footing', 'running', 'muscu', 'fractionne', 'sortie velo', 'natation', 'cardio', 'coach', 'salle'],
  competitions: ['competition', 'match', 'tournoi', 'championnat', 'marathon', 'trail', 'semi', 'dossard', 'course de'],
  nutrition: ['nutrition', 'regime', 'proteine', 'diet', 'menu', 'repas', 'hydrat', 'complement'],
  'recuperation-sante': ['recup', 'kine', 'etirement', 'sommeil', 'massage', 'osteo', 'blessure', 'medecin', 'cryo', 'repos'],
  materiel: ['materiel', 'chaussure', 'raquette', 'velo', 'equipement', 'tenue', 'montre', 'sac'],
  'objectifs-suivi': ['objectif', 'suivi', 'bilan', 'plan', 'programme', 'stats', 'progression', 'chrono', 'test'],

  travail: ['travail', 'boulot', 'bureau', 'reunion', 'collegue', 'client', 'projet', 'patron', 'mail pro'],
  courses: ['course', 'supermarche', 'acheter', 'marche', 'drive', 'pain', 'frigo'],
  'sante-sport': ['medecin', 'docteur', 'dentiste', 'sport', 'salle', 'footing', 'yoga', 'pharmac', 'kine', 'piscine', 'velo'],
  'famille-amis': ['famille', 'ami', 'maman', 'papa', 'parents', 'frere', 'soeur', 'anniversaire', 'mamie', 'papi', 'cousin', 'tante', 'oncle'],
  loisirs: ['loisir', 'cinema', 'concert', 'voyage', 'vacances', 'jeu', 'musee', 'expo', 'restaurant', 'resto', 'weekend', 'week end'],
  finances: ['banque', 'budget', 'epargne', 'impot', 'factur', 'virement', 'credit', 'placement', 'assurance', 'pret'],
};

const SKIP = new Set(['et', 'des', 'les', 'pour', 'moi', 'de', 'du', 'la', 'le', 'vie', 'a']);

/** Mots tirés du nom de la catégorie : début de mot si long (« Mécénat » → mecena), mot exact si court (« Cours »). */
function nameStems(name) {
  return fold(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !SKIP.has(w))
    .map((w) => (w.length > 6 ? w.slice(0, 6) : { exact: w.replace(/[sx]$/, '') }));
}

/**
 * @param {string} text  titre + détail de la tâche
 * @param {{id:string,name:string}[]} categories  catégories du profil actif, dans l'ordre
 * @returns {string|null} identifiant de la catégorie la plus probable
 */
export function categorize(text, categories) {
  const t = ` ${fold(text).replace(/[^a-z0-9]+/g, ' ')} `;
  const tokens = t.trim().split(' ');
  let best = null;
  let bestScore = 0;
  const hit = (k) => (k.includes(' ') ? t.includes(` ${k}`) : k.length <= 3 ? tokens.includes(k) : tokens.some((w) => w.startsWith(k)));
  for (const c of categories) {
    let score = 0;
    // mots-clés : un mot plus long est plus précis (« partiel » pèse plus que « revis »)
    for (const k of KEYWORDS[c.id] || []) if (hit(k)) score += 1 + k.length / 10;
    // le nom de la catégorie compte double : c'est ce qui fait marcher les catégories créées par l'utilisateur
    for (const k of nameStems(c.name)) {
      const ok = typeof k === 'string' ? hit(k) : tokens.some((w) => w === k.exact || w === k.exact + 's' || w === k.exact + 'x');
      if (ok) score += 2;
    }
    if (score > bestScore) {
      best = c.id;
      bestScore = score;
    }
  }
  return best;
}
