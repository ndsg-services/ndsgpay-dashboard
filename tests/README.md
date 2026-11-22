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

`tests/pos-operators.js` extrait le VRAI code de la page (liste `OPERATORS` et fonction `detectOperator`) et vérifie
quel opérateur est choisi d'après les premiers chiffres du numéro : Airtel et Moov au Gabon, MTN au Cameroun, aucun
préfixe attribué à deux opérateurs, aucun opérateur que le serveur refuserait (si le dépôt `ndsgpay-backend` est à côté).

```
node tests/pos-operators.js          # aucune dépendance
```
