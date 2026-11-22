// Test des opérateurs reconnus par la caisse (pos.html) d'après les premiers chiffres du numéro.
// On extrait le VRAI code de la page (liste OPERATORS + fonction detectOperator) et on l'exécute : aucune copie à tenir à jour.
// Le contrôle « le serveur accepte chaque opérateur » ne s'exécute que si le dépôt ndsgpay-backend est à côté (ou BACKEND_DIR).
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const FILE = process.env.POS_HTML || path.resolve(__dirname, '..', 'pos.html');
const log = console.log.bind(console);
const html = fs.readFileSync(FILE, 'utf8');

const start = html.indexOf('const OPERATORS = [');
const fnStart = html.indexOf('function detectOperator(msisdn) {');
if (start < 0 || fnStart < 0) { log('ERREUR : OPERATORS ou detectOperator introuvables dans pos.html (la page a changé de structure)'); process.exit(2); }
const fnEnd = html.indexOf('\n  }\n', fnStart) + 5;
const { OPERATORS, detectOperator } = vm.runInNewContext(html.slice(start, fnEnd) + '\n({ OPERATORS, detectOperator })');

const groups = []; let G; let total = 0; let ok = 0;
const group = (n) => { G = { n, pass: 0, fails: [] }; groups.push(G); };
const check = (name, cond, detail) => { total++; if (cond) { ok++; G.pass++; } else G.fails.push(name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); };
const corr = (n) => { const o = detectOperator(n); return o ? o.correspondent : null; };

group('A. Gabon : Airtel');
for (const p of ['074', '076', '077']) {
  check(`${p}… → Airtel Gabon`, corr(p + '123456') === 'AIRTEL_GAB', corr(p + '123456'));
  check(`${p}… avec l'indicatif 241 → Airtel Gabon`, corr('241' + p.slice(1) + '123456') === 'AIRTEL_GAB');
}
check('numéro saisi avec des espaces : « 077 12 34 56 »', corr('077 12 34 56') === 'AIRTEL_GAB');

group('B. Gabon : Moov (060, 062, 065, 066)');
for (const p of ['060', '062', '065', '066']) {
  check(`${p}… → Moov Gabon`, corr(p + '123456') === 'MOOV_GAB', corr(p + '123456'));
  check(`${p}… avec l'indicatif 241 → Moov Gabon`, corr('241' + p.slice(1) + '123456') === 'MOOV_GAB', corr('241' + p.slice(1) + '123456'));
  check(`${p}… avec des espaces → Moov Gabon`, corr(`${p} 12 34 56`) === 'MOOV_GAB');
}
check('le numéro de test habituel 062 70 94 01 → Moov Gabon', corr('062709401') === 'MOOV_GAB');
const moov = OPERATORS.filter((o) => o.correspondent === 'MOOV_GAB');
check('un seul opérateur Moov Gabon dans la liste', moov.length === 1, moov.map((o) => o.name));

group('C. Aucun opérateur inexistant');
check('plus d\'« Orange Gabon » dans la liste', !OPERATORS.some((o) => /Orange Gabon/i.test(o.name) || o.correspondent === 'ORANGE_GAB'), OPERATORS.map((o) => o.correspondent));
check('aucun numéro gabonais ne renvoie ORANGE_GAB', ['060', '062', '065', '066', '074', '076', '077'].every((p) => corr(p + '123456') !== 'ORANGE_GAB'));
check('la page ne contient plus le texte « Orange Gabon »', !/Orange Gabon|ORANGE_GAB/.test(html));
check('préfixe non attribué : aucune devinette (« 050 », « 099 »)', corr('050123456') === null && corr('099123456') === null);

group('D. Cameroun (comportement existant conservé)');
for (const [n, e] of [['237677123456', 'MTN_MOMO_CMR'], ['237680123456', 'MTN_MOMO_CMR'], ['237690123456', 'MTN_MOMO_CMR']]) check(`${n} → ${e}`, corr(n) === e, corr(n));

group('E. Cohérence de la liste');
const seen = {}; const dup = [];
for (const o of OPERATORS) for (const p of o.prefix) { if (seen[p]) dup.push(p); seen[p] = o.correspondent; }
check('aucun préfixe n\'est attribué à deux opérateurs', dup.length === 0, dup);
check('chaque opérateur a un nom, un code, une devise XAF et des préfixes à 3 chiffres', OPERATORS.every((o) => o.name && o.correspondent && o.currency === 'XAF' && o.prefix.length > 0 && o.prefix.every((p) => /^\d{3}$/.test(p))));
const BACKEND = process.env.BACKEND_DIR || path.resolve(__dirname, '..', '..', 'ndsgpay-backend');
const depFile = path.join(BACKEND, 'src', 'controllers', 'deposits.controller.js');
if (fs.existsSync(depFile)) {
  const accepted = new Set([...fs.readFileSync(depFile, 'utf8').matchAll(/^\s*([A-Z][A-Z0-9_]+):\s*\{\s*depositMin/gm)].map((m) => m[1]));
  const refused = OPERATORS.filter((o) => !accepted.has(o.correspondent)).map((o) => o.correspondent);
  check('chaque opérateur de la caisse est accepté par le serveur', accepted.size > 5 && refused.length === 0, refused);
} else log('  (dépôt ndsgpay-backend introuvable : contrôle « accepté par le serveur » ignoré)');

for (const g of groups) log(`${g.fails.length ? '✗' : '✓'} ${g.n.padEnd(58)} ${g.pass} réussis${g.fails.length ? ', ' + g.fails.length + ' ÉCHEC(S)' : ''}`);
log(`\n${ok} / ${total} vérifications réussies`);
if (ok !== total) { log('\nÉCHECS :'); groups.forEach((g) => g.fails.forEach((f) => log(`  ✗ [${g.n}] ${f}`))); }
process.exit(ok === total ? 0 : 1);
