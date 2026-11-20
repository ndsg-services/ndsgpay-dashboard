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
