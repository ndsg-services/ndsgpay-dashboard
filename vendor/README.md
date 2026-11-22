# Bibliothèques tierces copiées dans le dépôt

## `qrcode-generator.js` — générateur de QR codes
- Source : paquet npm `qrcode-generator`, **version 1.4.4** (copie telle quelle du fichier `qrcode.js`, non modifiée)
- Auteur : Kazuhiko Arase — licence **MIT** (rappelée dans l'en-tête du fichier)
- SHA-256 : `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`
- Usage : dessiner le QR code d'activation d'une caisse **dans la page**. Avant, la page envoyait le lien d'activation (qui contient
  la clé secrète de la caisse) à un site extérieur pour obtenir l'image : plus rien ne sort désormais.
- Le fichier ne contient aucun appel réseau, `eval` ni `document.write` (vérifié à l'ajout).
- Pour le mettre à jour : télécharger la nouvelle version, comparer, refaire `node tests/qr-check` (voir `tests/README.md`).
