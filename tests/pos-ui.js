// Test de la caisse (pos.html : le VRAI fichier) dans JSDOM, avec un faux serveur.
const { JSDOM } = require('jsdom');                      // npm i jsdom (voir tests/README.md)
const fs = require('fs'); const path = require('path');
const FILE = process.env.POS_HTML || path.resolve(__dirname, '..', 'pos.html');
const HTML = fs.readFileSync(FILE, 'utf8');
const API = 'https://ndsgpay-backend.vercel.app/api';
const log = console.log.bind(console);
const flush = () => new Promise((r) => setTimeout(r, 25));

const groups = []; let G; let total = 0; let ok = 0;
const group = (n) => { G = { n, pass: 0, fails: [] }; groups.push(G); };
const check = (name, cond, detail) => { total++; if (cond) { ok++; G.pass++; } else G.fails.push(name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

// ── Opérateurs tels que le serveur les renvoie ────────────────────────────────
const L = (min, max, decimals = 0) => ({ min, max, decimals });
const O = (correspondent, name, country, countryName, flag, callingCode, currency, deposit, payout, keepLeadingZero = false) =>
  ({ correspondent, name, country, countryName, flag, callingCode, keepLeadingZero, currency, deposit, payout });
const OPS = [
  O('MOOV_BEN', 'Moov Money', 'BEN', 'Bénin', '🇧🇯', '229', 'XOF', L(100, 2000000), L(100, 2000000), true),
  O('MTN_MOMO_CMR', 'MTN MoMo', 'CMR', 'Cameroun', '🇨🇲', '237', 'XAF', L(1, 1000000), L(1, 1000000)),
  O('ORANGE_CMR', 'Orange Money', 'CMR', 'Cameroun', '🇨🇲', '237', 'XAF', L(1, 1000000), L(1, 1000000)),
  O('MTN_MOMO_CIV', 'MTN MoMo', 'CIV', "Côte d'Ivoire", '🇨🇮', '225', 'XOF', L(1, 2000000), L(1, 2000000), true),
  O('AIRTEL_GAB', 'Airtel Money', 'GAB', 'Gabon', '🇬🇦', '241', 'XAF', L(100, 500000), L(100, 500000)),
  O('MOOV_GAB', 'Moov Money', 'GAB', 'Gabon', '🇬🇦', '241', 'XAF', L(100, 495000), L(100, 495000)),
  O('MPESA_KEN', 'M-Pesa', 'KEN', 'Kenya', '🇰🇪', '254', 'KES', L(1, 250000), L(10, 250000)),
  O('AIRTEL_COD', 'Airtel Money', 'COD', 'RD Congo', '🇨🇩', '243', 'CDF', L(100, 6250000), L(100, 6250000)),
  O('AIRTEL_COD', 'Airtel Money', 'COD', 'RD Congo', '🇨🇩', '243', 'USD', L(1, 5000, 2), L(1, 5000, 2)),
  O('ORANGE_COD', 'Orange Money', 'COD', 'RD Congo', '🇨🇩', '243', 'CDF', L(10, 1000000), null),
  O('ORANGE_SEN', 'Orange Money', 'SEN', 'Sénégal', '🇸🇳', '221', 'XOF', L(2, 100000000), null),   // collecte seule : pas de payout
];

function load({ cfg = {}, storage = {}, search = '?key=sk_pos_test123' } = {}) {
  const timers = []; const calls = [];
  const c = { scope: { deposit: true, payout: false }, opsStatus: 200, ops: OPS, opsSource: 'live', opsStale: false, deposit: { status: 200, body: { success: true, depositId: 'dep-1' } },
    payout: { status: 200, body: { success: true, payoutId: 'pay-1' } }, statuses: [], noScopeField: false, ...cfg };
  const dom = new JSDOM(HTML, {
    url: 'https://ndsgpay.ndsgservices.com/pos.html' + search, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(win) {
      win.scrollTo = () => {};
      Object.entries(storage).forEach(([k, v]) => win.localStorage.setItem(k, v));
      win.fetch = async (url, opts = {}) => {
        const call = { method: opts.method || 'GET', url, body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} };
        calls.push(call);
        let r;
        if (/\/pos\/validate$/.test(url)) r = { status: 200, body: { success: true, label: 'Caisse 1', merchantName: 'Boutique', posKeyId: 'k1', ...(c.noScopeField ? {} : { scope: c.scope }) } };
        else if (/\/pos\/operators$/.test(url)) r = c.opsStatus === 0 ? 'network' : c.opsStatus === 200 ? { status: 200, body: { success: true, source: c.opsSource, stale: c.opsStale, operators: c.ops } } : { status: c.opsStatus, body: { success: false } };
        else if (/\/pay\/deposits$/.test(url)) r = c.deposit;
        else if (/\/pay\/payouts$/.test(url)) r = c.payout;
        else if (/\/(deposits|payouts)\//.test(url)) r = c.statuses.length > 1 ? c.statuses.shift() : c.statuses[0] || { status: 200, body: { success: true, deposit: { status: 'INITIATED' } } };
        else if (/pos-keys/.test(url)) r = { status: 401, body: { success: false, error: 'Token invalide' } };
        else r = { status: 404, body: { success: false } };
        if (r === 'network') throw new TypeError('Failed to fetch');
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
      };
      win.setInterval = (fn, ms) => { timers.push({ fn, ms, active: true }); return timers.length; };
      win.clearInterval = (id) => { if (timers[id - 1]) timers[id - 1].active = false; };
    },
  });
  const win = dom.window; const doc = win.document; const $ = (id) => doc.getElementById(id);
  const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
  const api = {
    win, doc, $, calls, timers, cfg: c,
    visible: (id) => $(id).style.display !== 'none',
    select: (id, value) => { $(id).value = value; fire($(id), 'change'); },
    type: (v) => { $('msisdn-input').value = v; fire($('msisdn-input'), 'input'); },
    keys: (s) => { for (const k of String(s)) win.numpad(k === ',' ? 'extra' : k); },
    amount: () => $('amount-display').textContent,
    toast: () => $('toast').textContent,
    badge: () => $('operator-badge').textContent,
    opts: (id) => [...$(id).options].map((o) => o.text),
    pay: async () => { $('pos-btn').click(); await flush(); },
    last: (re) => calls.filter((x) => re.test(x.url)).pop(),
    poll: async () => { for (const t of timers.filter((x) => x.active && x.ms === 3000)) t.fn(); await flush(); },
    choose: (iso, key) => { api.select('country-select', iso); if (key) api.select('operator-select', key); },
    storage: (k) => win.localStorage.getItem(k),
  };
  return api;
}
async function ready(opts) { const p = load(opts); await flush(); await flush(); return p; }
const body = (p) => (p.last(/\/pay\/(deposits|payouts)$/) || {}).body;

(async () => {
  group('A. Session, clé et onglet payout');
  let p = await ready();
  check('la page vérifie la clé puis charge la liste avec la clé de caisse', p.calls[0].url === API + '/pos/validate' && p.calls[0].headers.Authorization === 'Bearer sk_pos_test123' && p.calls.some((c) => c.url === API + '/pos/operators' && c.headers.Authorization === 'Bearer sk_pos_test123'), p.calls.map((c) => c.url));
  check('écran de caisse affiché avec le nom de la caisse et du marchand', p.$('screen-pos').classList.contains('active') && p.$('pos-label').textContent === 'Caisse 1' && p.$('pos-merchant').textContent === 'Boutique');
  check('clé « collecte seule » : onglet Payout caché', p.visible('tab-payout') === false);
  p = await ready({ cfg: { scope: { deposit: true, payout: true } } });
  check('clé avec payout : l\'onglet Payout apparaît (permission lue chez le serveur)', p.visible('tab-payout') === true);
  check('…et la permission est mémorisée sur l\'appareil', JSON.parse(p.storage('ndsgpos_scope')).payout === true);
  p = await ready({ cfg: { noScopeField: true } });
  check('ancien serveur sans permissions : collecte seule par défaut, pas d\'erreur', p.visible('tab-payout') === false && p.$('screen-pos').classList.contains('active'));
  p = await ready({ search: '', storage: { ndsgpos_key: 'sk_pos_saved', ndsgpos_label: 'Caisse', ndsgpos_scope: '{"deposit":true,"payout":false}' }, cfg: { scope: { deposit: true, payout: true } } });
  check('caisse déjà configurée : les permissions sont rafraîchies au démarrage (payout activé depuis)', p.visible('tab-payout') === true && JSON.parse(p.storage('ndsgpos_scope')).payout === true);
  p = await ready({ search: '', storage: { ndsgpos_key: 'sk_pos_saved', ndsgpos_scope: '{"deposit":true,"payout":true}' }, cfg: { scope: { deposit: true, payout: false } } });
  check('permission retirée depuis : l\'onglet Payout disparaît', p.visible('tab-payout') === false);
  p = await ready({ cfg: { scope: { deposit: true, payout: true } } }); p.win.setMode('payout');
  check('mode payout actif : le bouton propose « Envoyer »', p.$('pos-btn').textContent === 'Envoyer');
  p.cfg.scope = { deposit: true, payout: false }; await p.win.refreshSession(); await flush();
  check('permission payout retirée pendant la session : retour en collecte, onglet caché', p.visible('tab-payout') === false && p.$('pos-btn').textContent === 'Encaisser', [p.visible('tab-payout'), p.$('pos-btn').textContent]);

  group('B. Pays, opérateurs et devises');
  p = await ready();
  check('pays proposés dans l\'ordre du serveur, avec drapeau et indicatif', JSON.stringify(p.opts('country-select')) === JSON.stringify(['🇧🇯 Bénin (+229)', '🇨🇲 Cameroun (+237)', "🇨🇮 Côte d'Ivoire (+225)", '🇬🇦 Gabon (+241)', '🇰🇪 Kenya (+254)', '🇨🇩 RD Congo (+243)', '🇸🇳 Sénégal (+221)']), p.opts('country-select'));
  check('Gabon sélectionné par défaut, avec Airtel et Moov', p.$('country-select').value === 'GAB' && JSON.stringify(p.opts('operator-select')) === JSON.stringify(['Airtel Money · XAF', 'Moov Money · XAF']), p.opts('operator-select'));
  check('indicatif +241, devise XAF et limites affichés', p.$('calling-code').textContent === '+241' && p.$('amount-currency').textContent === 'XAF' && /min 100 · max 500 000 XAF/.test(p.badge().replace(/\u202f|\u00a0/g, ' ')), p.badge());
  p.choose('COD');
  check('RD Congo : Airtel en CDF ET en USD, Orange en CDF', JSON.stringify(p.opts('operator-select')) === JSON.stringify(['Airtel Money · CDF', 'Airtel Money · USD', 'Orange Money · CDF']), p.opts('operator-select'));
  check('RD Congo : indicatif +243 et devise du premier opérateur (CDF)', p.$('calling-code').textContent === '+243' && p.$('amount-currency').textContent === 'CDF');
  p.select('operator-select', 'AIRTEL_COD|USD');
  check('choix de l\'USD : la devise affichée passe à USD', p.$('amount-currency').textContent === 'USD');
  check('USD : la touche du clavier devient « , » (centimes)', p.$('numpad-extra').textContent === ',');
  p.select('operator-select', 'AIRTEL_COD|CDF'); check('retour au CDF : la touche redevient « 000 »', p.$('numpad-extra').textContent === '000' && p.$('amount-currency').textContent === 'CDF');
  p.choose('CIV'); check('Côte d\'Ivoire : XOF et +225', p.$('amount-currency').textContent === 'XOF' && p.$('calling-code').textContent === '+225');
  p.choose('KEN'); check('Kenya : KES et +254', p.$('amount-currency').textContent === 'KES' && p.$('calling-code').textContent === '+254');
  p = await ready({ cfg: { ops: OPS.map((o) => (o.correspondent === 'MOOV_GAB' ? { ...o, name: '<img src=x onerror="window.__pwned=1">' } : o)) } });
  check('nom d\'opérateur hostile : affiché comme texte, aucun élément injecté', p.opts('operator-select').includes('<img src=x onerror="window.__pwned=1"> · XAF') && p.doc.querySelectorAll('#operator-select img').length === 0 && !p.win.__pwned);
  p = await ready({ cfg: { ops: OPS.filter((o) => o.country !== 'GAB') } });
  check('sans le Gabon dans la liste : on prend le premier pays proposé', p.$('country-select').value === 'BEN');
  p = await ready({ cfg: { ops: [] } });
  check('liste vide reçue : repli sur la liste de secours (Gabon, Cameroun)', JSON.stringify([...new Set(p.opts('country-select'))]) === JSON.stringify(['🇬🇦 Gabon (+241)', '🇨🇲 Cameroun (+237)']), p.opts('country-select'));

  group('C. Liste du serveur indisponible ou non vérifiée');
  for (const [label, cfg] of [['erreur serveur (500)', { opsStatus: 500 }], ['route inconnue d\'un ancien serveur (404)', { opsStatus: 404 }], ['coupure réseau', { opsStatus: 0 }]]) {
    p = await ready({ cfg });
    check(`${label} : liste de secours (Gabon et Cameroun), avertissement affiché`, JSON.stringify([...new Set(p.opts('country-select'))]) === JSON.stringify(['🇬🇦 Gabon (+241)', '🇨🇲 Cameroun (+237)']) && /liste non vérifiée/.test(p.badge()), [p.opts('country-select'), p.badge()]);
  }
  p = await ready({ cfg: { opsSource: 'fallback' } }); check('liste complète « non vérifiée » du serveur : avertissement affiché', /liste non vérifiée/.test(p.badge()));
  p = await ready({ cfg: { opsStale: true } }); check('liste « ancienne » (prestataire en panne mais liste connue) : pas d\'avertissement inutile', !/non vérifiée/.test(p.badge()));
  p = await ready(); check('liste à jour : pas d\'avertissement', !/non vérifiée/.test(p.badge()));
  p = await ready({ cfg: { opsStatus: 500 } }); p.type('62 70 94 01'); p.keys('1000'); await p.pay();
  check('même avec la liste de secours, un encaissement Gabon part normalement (Moov présélectionné)', !!body(p) && body(p).correspondent === 'MOOV_GAB' && body(p).msisdn === '24162709401', body(p));

  group('D. Mémorisation du dernier choix');
  p = await ready(); p.choose('KEN');
  check('le choix est mémorisé sur l\'appareil', JSON.parse(p.storage('ndsgpos_choice')).country === 'KEN' && JSON.parse(p.storage('ndsgpos_choice')).correspondent === 'MPESA_KEN');
  p = await ready({ storage: { ndsgpos_choice: JSON.stringify({ country: 'COD', correspondent: 'AIRTEL_COD', currency: 'USD' }) } });
  check('à la réouverture : même pays, même opérateur, même devise', p.$('country-select').value === 'COD' && p.$('operator-select').value === 'AIRTEL_COD|USD' && p.$('amount-currency').textContent === 'USD');
  p = await ready({ storage: { ndsgpos_choice: JSON.stringify({ country: 'ZMB', correspondent: 'MTN_MOMO_ZMB', currency: 'ZMW' }) } });
  check('choix mémorisé devenu impossible (opérateur désactivé) : retour au Gabon', p.$('country-select').value === 'GAB');
  p = await ready({ storage: { ndsgpos_choice: '{pas du json' } }); check('choix mémorisé illisible : ignoré sans erreur', p.$('country-select').value === 'GAB');

  group('E. Présélection de l\'opérateur au Gabon');
  for (const [num, exp] of [['074 12 34 56', 'AIRTEL_GAB'], ['077123456', 'AIRTEL_GAB'], ['76 12 34 56', 'AIRTEL_GAB'], ['060 12 34 56', 'MOOV_GAB'], ['062 70 94 01', 'MOOV_GAB'], ['065 12 34 56', 'MOOV_GAB'], ['066 12 34 56', 'MOOV_GAB'], ['+241 66 12 34 56', 'MOOV_GAB'], ['24165123456', 'MOOV_GAB']]) {
    p = await ready(); p.type(num);
    check(`${num} → ${exp}`, p.$('operator-select').value.startsWith(exp), p.$('operator-select').value);
  }
  p = await ready(); p.select('operator-select', 'AIRTEL_GAB|XAF'); p.type('062 70 94 01');
  check('un choix explicite du caissier n\'est pas écrasé', p.$('operator-select').value === 'AIRTEL_GAB|XAF');
  p = await ready(); p.type('050 12 34 56'); check('préfixe inconnu : la sélection ne change pas', p.$('operator-select').value === 'AIRTEL_GAB|XAF');
  p = await ready(); p.choose('CMR'); const before = p.$('operator-select').value; p.type('065 12 34 56'); check('hors Gabon : aucune présélection (le caissier choisit)', p.$('operator-select').value === before && p.$('country-select').value === 'CMR');
  p = await ready(); p.type('062 70 94 01'); p.type(''); p.type('077 00 00 00'); check('la présélection suit le numéro tant que le caissier ne choisit pas', p.$('operator-select').value === 'AIRTEL_GAB|XAF');

  group('F. Numéro envoyé (indicatif et zéro national)');
  const MSISDN = [
    ['GAB', 'MOOV_GAB|XAF', '062 70 94 01', '24162709401'], ['GAB', 'MOOV_GAB|XAF', '+241 62 70 94 01', '24162709401'], ['GAB', 'MOOV_GAB|XAF', '24162709401', '24162709401'],
    ['GAB', 'MOOV_GAB|XAF', '0024162709401', '24162709401'], ['GAB', 'AIRTEL_GAB|XAF', '77 00 00 00', '24177000000'], ['GAB', 'AIRTEL_GAB|XAF', '077-00-00-00', '24177000000'],
    ['CMR', 'MTN_MOMO_CMR|XAF', '677 12 34 56', '237677123456'], ['CMR', 'ORANGE_CMR|XAF', '237655123456', '237655123456'], ['CMR', 'ORANGE_CMR|XAF', '0655 12 34 56', '237655123456'],
    ['COD', 'AIRTEL_COD|CDF', '081 234 5678', '243812345678'], ['COD', 'AIRTEL_COD|USD', '+243 81 234 5678', '243812345678'],
    ['CIV', 'MTN_MOMO_CIV|XOF', '07 12 34 56 78', '2250712345678'], ['CIV', 'MTN_MOMO_CIV|XOF', '2250712345678', '2250712345678'],
    ['BEN', 'MOOV_BEN|XOF', '01 97 12 34 56', '2290197123456'],
    ['KEN', 'MPESA_KEN|KES', '0712 345 678', '254712345678'], ['KEN', 'MPESA_KEN|KES', '+254 712 345 678', '254712345678'],
  ];
  for (const [iso, key, typed, exp] of MSISDN) {
    p = await ready(); p.choose(iso, key); p.type(typed); p.keys('1000'); await p.pay();
    check(`${iso} « ${typed} » → ${exp}`, !!body(p) && body(p).msisdn === exp, body(p) && body(p).msisdn);
  }
  for (const bad of ['123', 'abc', '62 70', '++24162709401', '']) {
    p = await ready(); p.type(bad); p.keys('1000'); const n = p.calls.length; await p.pay();
    check(`numéro invalide « ${bad} » : message, aucune requête`, /Numéro invalide/.test(p.toast()) && p.calls.length === n, p.toast());
  }

  group('G. Montants, limites et requête');
  p = await ready(); p.type('62 70 94 01'); p.keys('1000'); await p.pay();
  check('collecte : /pay/deposits avec montant, devise, opérateur et numéro', p.last(/\/pay\/deposits$/).method === 'POST' && JSON.stringify(body(p)) === JSON.stringify({ amount: 1000, currency: 'XAF', correspondent: 'MOOV_GAB', msisdn: '24162709401', description: 'Paiement NDSGPay' }), body(p));
  check('la clé de caisse accompagne la requête', p.last(/\/pay\/deposits$/).headers.Authorization === 'Bearer sk_pos_test123');
  p = await ready(); p.type('77 00 00 00'); p.keys('50'); await p.pay(); check('Airtel Gabon : 50 refusé, « Montant minimum : 100 XAF »', /Montant minimum : 100 XAF/.test(p.toast()) && !p.last(/\/pay\/deposits$/), p.toast());
  p = await ready(); p.type('77 00 00 00'); p.keys('600000'); await p.pay(); check('Airtel Gabon : 600 000 refusé, « Montant maximum »', /Montant maximum : 500.000 XAF/.test(p.toast().replace(/\u202f|\u00a0/g, '.')) && !p.last(/\/pay\/deposits$/), p.toast());
  p = await ready(); p.type('62 70 94 01'); p.keys('500000'); await p.pay(); check('Moov Gabon : 500 000 refusé (plafond 495 000)', /Montant maximum/.test(p.toast()) && !p.last(/\/pay\/deposits$/), p.toast());
  p = await ready(); p.type('62 70 94 01'); p.keys('495000'); await p.pay(); check('Moov Gabon : 495 000 accepté', !!p.last(/\/pay\/deposits$/));
  p = await ready(); p.choose('CMR', 'MTN_MOMO_CMR|XAF'); p.type('677 12 34 56'); p.keys('5'); await p.pay(); check('Cameroun : 5 XAF accepté (l\'ancien minimum fixe de 100 ne s\'applique plus)', !!p.last(/\/pay\/deposits$/) && body(p).amount === 5, body(p));
  p = await ready(); p.type('62 70 94 01'); await p.pay(); check('montant vide : « Saisissez un montant », aucune requête', /Saisissez un montant/.test(p.toast()) && !p.last(/\/pay\/deposits$/));
  p = await ready({ cfg: { ops: [] , opsStatus: 500 } }); p.win.onCountryChange(''); p.type('62 70 94 01'); p.keys('1000'); await p.pay(); check('aucun opérateur sélectionné : message clair', /Choisissez un pays et un opérateur/.test(p.toast()) && !p.last(/\/pay\/deposits$/), p.toast());
  p = await ready(); p.choose('COD', 'AIRTEL_COD|USD'); p.type('81 234 5678'); p.keys('12,5'); check('USD : « 12,5 » affiché avec une virgule', /^12,5$/.test(p.amount()), p.amount());
  p.keys('07'); check('USD : un seul chiffre après la virgule de trop est refusé (2 décimales max)', /^12,50$/.test(p.amount()), p.amount());
  await p.pay(); check('USD : montant envoyé en texte à 2 décimales « 12.50 », devise USD', body(p).amount === '12.50' && body(p).currency === 'USD' && body(p).correspondent === 'AIRTEL_COD', body(p));
  p = await ready(); p.choose('COD', 'AIRTEL_COD|USD'); p.type('81 234 5678'); p.keys(',5'); await p.pay(); check('USD : « 0,5 » refusé (minimum 1)', /Montant minimum : 1 USD/.test(p.toast()) && !p.last(/\/pay\/deposits$/), p.toast());
  p = await ready(); p.choose('COD', 'AIRTEL_COD|USD'); p.keys('12,5'); p.select('operator-select', 'AIRTEL_COD|CDF'); check('USD → CDF : les centimes saisis sont retirés', /^12$/.test(p.amount()), p.amount());
  p = await ready(); p.choose('COD', 'AIRTEL_COD|CDF'); p.type('81 234 5678'); p.keys('1000'); await p.pay(); check('RDC en CDF : devise CDF envoyée, montant entier', body(p).currency === 'CDF' && body(p).amount === 1000, body(p));
  p = await ready(); p.keys('5'); p.win.numpad('extra'); check('touche « 000 » : 5 → 5 000', p.amount().replace(/\u202f|\u00a0/g, ' ') === '5 000', p.amount());
  p.win.numpad('extra'); p.win.numpad('extra'); check('plafond de 9 chiffres respecté (pas de montant démesuré)', p.amount().replace(/\D/g, '').length <= 9, p.amount());
  p = await ready(); p.win.numpad('extra'); check('touche « 000 » sans montant : ne fait rien', p.amount() === '0');
  p = await ready({ cfg: { scope: { deposit: true, payout: true } } }); p.win.setMode('payout');
  p.choose('COD');
  check('mode payout : seuls les opérateurs autorisés en payout (Orange RDC absent)', !p.opts('operator-select').some((t) => /Orange/.test(t)) && p.opts('operator-select').length === 2, p.opts('operator-select'));
  p = await ready({ cfg: { scope: { deposit: true, payout: true } } });
  check('collecte : le Sénégal (collecte seule) est proposé', p.opts('country-select').some((t) => /Sénégal/.test(t)));
  p.choose('COD', 'ORANGE_COD|CDF'); p.win.setMode('payout');
  check('bascule en payout : le pays réservé à la collecte (Sénégal) disparaît tout de suite', !p.opts('country-select').some((t) => /Sénégal/.test(t)), p.opts('country-select'));
  check('bascule en payout : l\'opérateur collecte-seule (Orange RDC) n\'est plus sélectionné ni proposé', !p.opts('operator-select').some((t) => /Orange/.test(t)) && p.$('country-select').value === 'GAB', [p.$('country-select').value, p.opts('operator-select')]);
  p.win.setMode('collect'); check('retour en collecte : le Sénégal réapparaît', p.opts('country-select').some((t) => /Sénégal/.test(t)));
  p = await ready({ cfg: { scope: { deposit: true, payout: true } } }); p.win.setMode('payout');
  p.choose('KEN'); check('mode payout Kenya : limites du payout (minimum 10)', /min 10 /.test(p.badge().replace(/\u202f|\u00a0/g, ' ')), p.badge());
  p.choose('GAB', 'MOOV_GAB|XAF'); p.type('62 70 94 01'); p.keys('1000'); await p.pay(); check('payout : /pay/payouts avec le libellé « Virement NDSGPay »', p.last(/\/pay\/payouts$/).method === 'POST' && body(p).description === 'Virement NDSGPay' && body(p).msisdn === '24162709401', body(p));
  p = await ready({ cfg: { deposit: { status: 400, body: { success: false, error: 'Numéro invalide' } } } }); p.type('62 70 94 01'); p.keys('1000'); await p.pay();
  check('refus du serveur : son message s\'affiche et le bouton redevient utilisable', /Numéro invalide/.test(p.toast()) && p.$('pos-btn').disabled === false && p.$('pos-btn').textContent === 'Encaisser', [p.toast(), p.$('pos-btn').textContent]);

  group('H. Suivi du paiement et historique par devise');
  const done = (id, status) => ({ status: 200, body: { success: true, deposit: { status, failureMessage: 'refusé' } } });
  p = await ready({ cfg: { statuses: [done('dep-1', 'COMPLETED')] } }); p.choose('COD', 'AIRTEL_COD|USD'); p.type('81 234 5678'); p.keys('12,5'); await p.pay();
  check('écran d\'attente : montant avec sa devise, opérateur, numéro', p.$('screen-status').classList.contains('active') && /12,5 USD/.test(p.$('status-amount').textContent) && /Airtel Money/.test(p.$('detail-operator').textContent) && p.$('detail-msisdn').textContent === '243812345678', [p.$('status-amount').textContent, p.$('detail-msisdn').textContent]);
  check('consultation du bon paiement avec la clé de caisse', p.timers.some((t) => t.active && t.ms === 3000));
  await p.poll();
  check('paiement confirmé : écran de succès', /Paiement reçu/.test(p.$('status-title').textContent) && p.$('status-new-btn').style.display === 'block', p.$('status-title').textContent);
  p.win.newTransaction(); check('« Nouvelle transaction » : montant et numéro remis à zéro, choix conservé', p.amount() === '0' && p.$('msisdn-input').value === '' && p.$('operator-select').value === 'AIRTEL_COD|USD');
  // trois transactions réussies en deux devises + une échouée, puis le total par devise
  const run = async (iso, key, num, amt, statusCfg) => { p.choose(iso, key); p.type(num); p.keys(amt); await p.pay(); p.cfg.statuses.splice(0, p.cfg.statuses.length, statusCfg); await p.poll(); p.win.newTransaction(); };
  await run('GAB', 'MOOV_GAB|XAF', '62 70 94 01', '1000', done('d', 'COMPLETED'));
  await run('GAB', 'AIRTEL_GAB|XAF', '77 00 00 00', '500', done('d', 'COMPLETED'));
  await run('GAB', 'AIRTEL_GAB|XAF', '77 00 00 00', '300', done('d', 'FAILED'));
  p.win.showHistory(); await flush(); await flush();
  const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ');
  check('total encaissé : un total par devise, une ligne chacun', norm($t(p, 'history-total-collect')) === '12,5 USD\n1 500 XAF', $t(p, 'history-total-collect'));
  check('le paiement échoué n\'est pas compté dans les totaux', !/300/.test($t(p, 'history-total-collect')));
  check('total envoyé vide : « 0 »', $t(p, 'history-total-payout') === '0');
  check('4 transactions comptées, lignes avec montant, devise et statut', /4 transactions/.test($t(p, 'history-count')) && p.doc.querySelectorAll('#history-list > div').length === 4 && /✗/.test($t(p, 'history-list')) && /✓/.test($t(p, 'history-list')));
  check('l\'historique du serveur est tenté, refusé (401), et la liste de la session s\'affiche quand même', p.calls.some((c) => /pos-keys\/k1\/transactions/.test(c.url)) && p.doc.querySelectorAll('#history-list > div').length === 4);
  p = await ready({ cfg: { scope: { deposit: true, payout: true }, statuses: [done('d', 'COMPLETED')] } });
  await (async () => { p.win.setMode('payout'); p.choose('KEN', 'MPESA_KEN|KES'); p.type('0712 345 678'); p.keys('250'); await p.pay(); p.cfg.statuses.splice(0, 1, { status: 200, body: { success: true, payout: { status: 'COMPLETED' } } }); await p.poll(); p.win.showHistory(); await flush(); await flush(); })();
  check('payout en KES : total envoyé « 250 KES », total encaissé « 0 »', norm($t(p, 'history-total-payout')) === '250 KES' && $t(p, 'history-total-collect') === '0', [$t(p, 'history-total-payout'), $t(p, 'history-total-collect')]);
  const evil = '<img src=x onerror="window.__pwned=1">';
  p = await ready({ cfg: { statuses: [done('d', 'COMPLETED')] } }); p.win.addToHistory({ amount: 100, currency: 'XAF', msisdn: evil, operator: evil, createdAt: new Date().toISOString(), status: 'COMPLETED', mode: 'collect' }); p.win.showHistory(); await flush(); await flush();
  check('numéro et opérateur hostiles dans l\'historique : texte seulement, aucun élément injecté', p.doc.querySelectorAll('#history-list img').length === 0 && !p.win.__pwned && $t(p, 'history-list').includes(evil), $t(p, 'history-list'));

  group('I. Contrôles du code de la page');
  check('aucune injection de HTML (innerHTML, outerHTML, insertAdjacentHTML, document.write, eval)', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(HTML));
  check('l\'ancienne détection par préfixe pour tous les pays a disparu', !/detectOperator|\bOPERATORS\b/.test(HTML));
  check('la permission payout n\'est plus écrite en dur au démarrage', !/posScope\s*=\s*\{ deposit: true, payout: false \};\n\s*\n/.test(HTML) && /data\.scope \?/.test(HTML));
  check('contrat avec le serveur : le faux serveur de ce test et la liste de secours de la page portent les champs que le serveur envoie', JSON.stringify(Object.keys(OPS[0]).sort()) === JSON.stringify(['callingCode', 'correspondent', 'country', 'countryName', 'currency', 'deposit', 'flag', 'keepLeadingZero', 'name', 'payout']), Object.keys(OPS[0]).sort());
  check('adresse du serveur inchangée', HTML.includes("const API = 'https://ndsgpay-backend.vercel.app/api';"));
  check('plus de montant minimum fixe de 100 pour toutes les devises', !/amount < 100/.test(HTML) && !/Montant minimum : 100['"]/.test(HTML));
  check('la page ne parle jamais du prestataire de paiement', !/pawapay/i.test(HTML));

  for (const g of groups) log(`${g.fails.length ? '✗' : '✓'} ${g.n.padEnd(60)} ${g.pass} réussis${g.fails.length ? ', ' + g.fails.length + ' ÉCHEC(S)' : ''}`);
  log(`\n${ok} / ${total} vérifications réussies`);
  if (ok !== total) { log('\nÉCHECS :'); groups.forEach((g) => g.fails.forEach((f) => log(`  ✗ [${g.n}] ${f}`))); }
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { log('ERREUR DE TEST :', (e && e.stack) || e); process.exit(2); });
function $t(p, id) { return p.$(id).textContent; }
