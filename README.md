# Proello

Une to-do list qu'on remplit **à la voix** et qu'on organise selon l'**urgence** et l'**importance**.

👉 **Application en ligne : https://yann-forge.github.io/proello/**

## Fonctionnalités

- 🎙️ **Dictée vocale** : un bouton, on parle, et plusieurs tâches sont créées d'un coup.
  Sépare les tâches par « puis », « ensuite », « et aussi », « tâche suivante »…
  Les mots « urgent », « important », « demain », « vendredi », « le 12 décembre », « dans 2 semaines », « pour jeudi » sont reconnus automatiquement.
- ✅ **Trois vues** :
  1. **Liste** : toutes les tâches triées par priorité, avec filtres.
  2. **Planning** : un Gantt où l'on déplace et étire les tâches au doigt ou à la souris.
  3. **Matrice d'Eisenhower** : les 4 cadrans, avec glisser-déposer entre eux.
- 📱 **Installable** sur téléphone et ordinateur (PWA), fonctionne hors ligne.
- 💾 Les tâches sont enregistrées sur l'appareil ; export / import JSON depuis le menu.

## Installer l'app

- **Android / ordinateur (Chrome, Edge)** : ouvrir le lien puis cliquer sur « Installer ».
- **iPhone / iPad (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

## Développement

Aucune dépendance ni étape de build : HTML, CSS et JavaScript.

```bash
node tools/serve.mjs        # lance l'app sur http://localhost:5173
node --test tests/          # tests de l'analyseur de dictée
node tools/make-icons.mjs   # régénère les icônes
```

Chaque push sur `main` est publié automatiquement sur GitHub Pages.

### Structure

```
index.html            page unique
css/style.css         charte graphique (jaune, vert, orange pastel)
js/app.js             navigation, dictée, dialogues, installation
js/parser.js          découpe une dictée en tâches (urgence, importance, dates)
js/voice.js           reconnaissance vocale du navigateur
js/store.js           stockage local des tâches
js/views/             les 3 vues : list, gantt, matrix
sw.js                 service worker (hors ligne)
```
