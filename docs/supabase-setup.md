# Mise en place de Supabase et de la connexion Google

Ce guide prépare la synchronisation de Proello (espace « Moi » sur tous tes appareils) et les espaces
partagés (équipe de 8 personnes maximum), avec connexion par Google. Tout reste dans les offres gratuites.

Les intitulés des écrans de Supabase et de Google changent parfois un peu : fie-toi au sens.

> ⚠️ **Ne jamais envoyer à Claude** (ni dans une conversation, ni dans le code) : le mot de passe de la base,
> la clé secrète Supabase (`service_role` / `secret`) ni le secret client Google. Ils se collent uniquement
> dans les écrans de Supabase indiqués ci-dessous.

## A. Créer le projet Supabase (≈ 5 min)

1. Va sur <https://supabase.com> → **Start your project** → connecte-toi avec **GitHub** (compte `yann-forge`).
2. **New project** :
   - Nom : `proello`
   - Mot de passe de la base : clique sur **Generate**, puis garde-le dans ton gestionnaire de mots de passe.
   - Région : **Europe (Paris ou Francfort)**.
   - Offre : **Free**.
3. Attends environ 2 minutes que le projet soit prêt.
4. Ouvre **Project Settings → API** (ou le bouton **Connect**) et note :
   - l'**URL du projet** : `https://xxxxxxxx.supabase.co`
   - la **clé publique** : *publishable* ou *anon*. C'est elle seulement que tu enverras à Claude.

## B. Créer l'identifiant Google (≈ 10 min)

5. Va sur <https://console.cloud.google.com> → crée un projet nommé **Proello**.
6. Menu **API et services → Écran de consentement OAuth** (ou **Google Auth Platform → Branding**) :
   - Nom de l'application : **Proello**
   - E-mail d'assistance et e-mail de contact : ton adresse.
   - Type d'utilisateurs (Audience) : **Externe**.
7. **Clients** (ou **Identifiants → Créer des identifiants → ID client OAuth**) :
   - Type : **Application Web**, nom : `Proello`.
   - **Origines JavaScript autorisées** : `https://yann-forge.github.io`
   - **URI de redirection autorisés** : `https://xxxxxxxx.supabase.co/auth/v1/callback`
     (remplace `xxxxxxxx` par ton projet ; Supabase affiche cette adresse exacte à l'étape 9).
   - **Créer**, puis garde la fenêtre ouverte : elle affiche l'**ID client** et le **code secret du client**.
8. **Audience** : clique sur **Publier l'application** (passage en production). Sans ça, Google n'accepte
   que les comptes ajoutés un par un comme « utilisateurs test ». Proello ne demande que le nom et l'e-mail,
   donc aucune vérification de Google n'est nécessaire.

## C. Relier Google à Supabase (≈ 2 min)

9. Dans Supabase : **Authentication → Sign In / Providers → Google** → active-le, colle l'**ID client** et
   le **code secret** de Google, puis **Save**.
10. **Authentication → URL Configuration** :
    - **Site URL** : `https://yann-forge.github.io/proello/`
    - **Redirect URLs** : ajoute `https://yann-forge.github.io/proello/` et `http://localhost:5173/`

## D. Envoyer à Claude

Seulement ces deux informations :

- l'URL du projet : `https://xxxxxxxx.supabase.co`
- la clé publique (*publishable* / *anon*)

Claude crée ensuite les tables, les règles de sécurité, la connexion Google et la synchronisation.
