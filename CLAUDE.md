# Proello

To-do list dictée à la voix, en français, triée par urgence et importance (liste, Gantt, matrice d'Eisenhower).
PWA sans dépendance ni build (HTML/CSS/JS), publiée sur GitHub Pages à chaque push sur `main` :
https://yann-forge.github.io/proello/

L'utilisateur écrit en français : répondre en français, et garder l'interface en français (tutoiement).

## Règles de travail

- Après chaque modification : lancer `node --test tests/`, puis commit et push sur `main` (le site se met à jour seul).
- À chaque changement de fichiers servis : incrémenter `VERSION` dans `js/version.js` et `CACHE` dans `sw.js`,
  et ajouter tout nouveau fichier JS à la liste `ASSETS` de `sw.js`.
- Tout reste gratuit et local : pas d'IA ni de serveur sans accord explicite de l'utilisateur.

## Où est quoi

- `js/parser.js` : découpe une dictée en tâches, urgent / important, rattache les phrases de précision, reprises de dictée.
- `js/when.js` : dates, périodes (« entre A et B », « du A au B »), échéances (« avant vendredi »), durées,
  et horaires (`extractTime` : « à 14h », « de 9h à 11h », « pendant 1h30 »).
- `js/views/day.js` : vue journée du planning (agenda heure par heure + colonne « Sans horaire »).
- `js/summarize.js` : titre court (4 mots maximum).
- `js/themes.js` : thème commun entre tâches d'une même dictée (lexique de thèmes + tâches de suivi « bilan », « rapport »…).
- `js/profiles.js` : les 8 profils prédéfinis et leurs catégories ; profils modifiés ou créés par l'utilisateur.
- `js/categorize.js` : catégorie devinée d'après les mots de la tâche (mots-clés par catégorie + nom de la catégorie).
- `js/profile-ui.js` : écran d'accueil, fenêtre « Profil et catégories », filtre et pastilles de catégorie.
- `js/importer.js` : import en nombre (tableau CSV / cellules collées, liste de texte via `parseDictation`, sauvegarde JSON),
  doublons, modèle CSV ; fenêtre « Importer des tâches » dans `app.js`.
- `js/repeat.js` : tâches répétées (`repeat` : jour / semaine / mois, jours, `until` ; `start` = prochaine occurrence,
  cochée → occurrence suivante dans `store.update`) et modèles `perEvent` copiés pour chaque tâche `event` (prestation).
- `js/report.js` : formulaire « Signaler une erreur » → fiche GitHub pré-remplie dans le dépôt privé.
- `tests/` : `parser`, `periods`, `themes`, `categories`, `store`, `import`, `repeat`, `conflicts` (phrases pièges entre règles)
  et `reports.test.mjs` (alimenté par `tests/reports.json`). Toute nouvelle règle doit garder `conflicts.test.mjs` au vert.

## Traiter les rapports d'erreur

Les rapports envoyés depuis l'app arrivent comme issues (label `rapport`) dans le dépôt privé
`yann-forge/proello-retours`. Chaque issue se termine par un bloc JSON : `now` (moment de la dictée),
`input` (texte dicté), `understood` (ce que l'app a compris), `expected` (ce que l'utilisateur attendait),
`problems` et `comment`.

Quand l'utilisateur demande de traiter les rapports :

1. `node tools/import-reports.mjs` : ajoute les nouveaux rapports à `tests/reports.json`.
2. `node --test tests/` : les rapports non résolus échouent et montrent l'écart compris / attendu.
3. Corriger `parser.js`, `when.js` ou `summarize.js` de façon générale (pas de cas particulier codé en dur),
   sans casser les autres tests. Si l'attente semble ambiguë ou discutable, demander à l'utilisateur.
   Un rapport « Mots mal entendus » relève de la reconnaissance vocale : le signaler à l'utilisateur.
4. Commit + push, puis commenter et fermer chaque issue traitée :
   `gh issue close <n> -R yann-forge/proello-retours -c "Corrigé dans <commit> (version X.Y.Z)"` et ajouter le label `corrigé`.
5. Résumer à l'utilisateur ce qui a été corrigé et ce qui reste ouvert.
