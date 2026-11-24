# Test de la page de démo Canopé (`canope.html`)

Charge le VRAI fichier dans JSDOM, avec un faux serveur : saisie du numéro de série, affichage du boîtier, données
hostiles affichées comme du texte, durée / opérateur / numéro, contenu de la demande de paiement (jamais de montant),
attente et résultats (succès, échec, délai dépassé, coupures réseau), reprise après rechargement, espace Canopé.

```
mkdir /tmp/jsdom && cd /tmp/jsdom && npm i jsdom        # une fois, hors du dépôt
cd <ce dépôt>
NODE_PATH=/tmp/jsdom/node_modules node tests/canope-ui.js
```
Sous Windows (cmd) : `set NODE_PATH=C:\temp\jsdom\node_modules` puis `node tests\canope-ui.js`.

Ce test ne remplace pas un essai sur un vrai téléphone avec un vrai paiement.

---

# Test de la caisse (`pos.html`)

`tests/pos-ui.js` charge le VRAI fichier dans JSDOM, avec un faux serveur : clé et permissions (onglet Payout), choix du pays,
de l'opérateur et de la devise à partir de la liste du serveur, liste de secours, dernier choix mémorisé, présélection de
l'opérateur au Gabon, numéro envoyé pour chaque pays (indicatif, zéro national), montants, limites et centimes (USD),
contenu des requêtes, suivi du paiement, historique totalisé par devise, données hostiles affichées comme du texte.

```
NODE_PATH=/tmp/jsdom/node_modules node tests/pos-ui.js
```
Les champs envoyés par le serveur (`GET /api/pos/operators`) sont décrits dans `ndsgpay-backend/src/lib/pos-operators.js` ;
chaque dépôt contrôle ces champs de son côté (« contrat avec la caisse » / « contrat avec le serveur »).

---

# Test du QR code et du panneau « Caisses POS » (`app.html`)

`tests/qr-ui.js` charge le VRAI `app.html` dans JSDOM : le QR d'activation d'une caisse est dessiné **dans la page**
(bibliothèque copiée dans `vendor/`), puis **relu avec un décodeur** : il doit redonner exactement le lien d'activation. Le test
vérifie aussi qu'aucune requête ne part vers un autre site (le lien contient la clé secrète), la fidélité du dessin case par case,
la zone blanche, les cas d'échec (rôle sans droit, clé inactive, réseau coupé, bibliothèque absente) et que les textes venus du
serveur ne sont jamais injectés comme du HTML.

```
cd /tmp/jsdom && npm i jsdom jsqr                       # une fois, hors du dépôt
NODE_PATH=/tmp/jsdom/node_modules node tests/qr-ui.js
```
Sans `jsqr`, seul le contrôle de relecture du QR est ignoré. La provenance de la bibliothèque est dans `vendor/README.md`.

## Page admin : soldes marchands

`tests/admin-ui.js` charge le VRAI `admin.html` dans JSDOM avec une fausse réponse de `/admin/merchants/balances` :
une ligne par opérateur et par devise (« AIRTEL_COD · USD », jamais la clé technique `AIRTEL_COD|USD`), centimes conservés pour l'USD,
montants entiers pour les autres devises, solde négatif en rouge. Lancer l'ancienne page (`ADMIN_HTML=<ancien fichier>`) doit échouer.

```
NODE_PATH=/tmp/jsdom/node_modules node tests/admin-ui.js
```
