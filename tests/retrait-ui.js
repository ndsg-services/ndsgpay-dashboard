// Test du formulaire de retrait et du tableau « Correspondants disponibles » (Clés API) de app.html (le VRAI fichier), dans JSDOM.
const { JSDOM, VirtualConsole } = require('jsdom');          // npm i jsdom (voir tests/README.md)
const fs = require('fs'); const path = require('path');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'app.html');
const HTML = fs.readFileSync(FILE, 'utf8');
const API = 'https://ndsgpay-backend.vercel.app/api';
const log = console.log.bind(console); const flush = () => new Promise((r) => setTimeout(r, 30));
const norm = (t) => String(t).replace(/[\u202f\u00a0]/g, ' ');

const groups = []; let G; let total = 0; let ok = 0;
const group = (n) => { G = { n, pass: 0, fails: [] }; groups.push(G); };
const check = (name, cond, detail) => { total++; if (cond) { ok++; G.pass++; } else G.fails.push(name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

// ── Opérateurs tels que le serveur les renvoie ───────────────────────────────
const L = (min, max, decimals = 0) => ({ min, max, decimals });
const O = (correspondent, name, country, countryName, flag, callingCode, currency, deposit, payout, keepLeadingZero = false) => ({ correspondent, name, country, countryName, flag, callingCode, keepLeadingZero, currency, deposit, payout });
const OPS = [
  O('MTN_MOMO_CIV', 'MTN MoMo', 'CIV', "Côte d'Ivoire", '🇨🇮', '225', 'XOF', L(1, 2000000), L(1, 2000000), true),
  O('AIRTEL_GAB', 'Airtel Money', 'GAB', 'Gabon', '🇬🇦', '241', 'XAF', L(100, 500000), L(100, 500000)),
  O('MOOV_GAB', 'Moov Money', 'GAB', 'Gabon', '🇬🇦', '241', 'XAF', L(100, 495000), L(100, 495000)),
  O('MPESA_KEN', 'M-Pesa', 'KEN', 'Kenya', '🇰🇪', '254', 'KES', L(1, 250000), L(10, 250000)),
  O('AIRTEL_COD', 'Airtel Money', 'COD', 'RD Congo', '🇨🇩', '243', 'CDF', L(100, 6250000), L(100, 6250000)),
  O('AIRTEL_COD', 'Airtel Money', 'COD', 'RD Congo', '🇨🇩', '243', 'USD', L(0.1, 2500, 2), L(0.1, 2500, 2)),
  O('VODACOM_MPESA_COD', 'Vodacom M-Pesa', 'COD', 'RD Congo', '🇨🇩', '243', 'CDF', L(500, 1000000), L(1000, 1000000)),
  O('VODACOM_MPESA_COD', 'Vodacom M-Pesa', 'COD', 'RD Congo', '🇨🇩', '243', 'USD', L(0.5, 2500, 2), L(0.5, 2500, 2)),
  O('ORANGE_SEN', 'Orange Money', 'SEN', 'Sénégal', '🇸🇳', '221', 'XOF', L(2, 100000000), null),   // collecte seule : pas de retrait possible
];
const STATS = { success: true, stats: { currencies: ['XAF', 'USD'], balancesByCurrency: { XAF: { currency: 'XAF', availableBalance: 250000 }, USD: { currency: 'USD', availableBalance: 12.5 } }, balancesByCorrespondent: {}, correspondents: [] } };

function load({ cfg = {} } = {}) {
  const calls = []; const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation to another Document/.test(e.message)) errors.push(e.message); });
  const state = { opsStatus: 200, ops: OPS, source: 'live', stale: false, max: { success: true, max: 100000 }, withdraw: { status: 200, body: { success: true } }, ...cfg };
  const dom = new JSDOM(HTML, {
    url: 'https://ndsgpay.ndsgservices.com/app.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) {
      win.scrollTo = () => {};
      win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      win.fetch = async (url, opts = {}) => {
        const call = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null }; calls.push(call);
        let r;
        if (/\/pos\/operators$/.test(url)) r = state.opsStatus === 0 ? 'network' : state.opsStatus === 200 ? { status: 200, body: { success: true, source: state.source, stale: state.stale, operators: state.ops } } : { status: state.opsStatus, body: { success: false } };
        else if (/\/stats$/.test(url)) r = { status: 200, body: STATS };
        else if (/\/merchant\/withdrawals$/.test(url)) r = { status: 200, body: { success: true, withdrawals: [] } };
        else if (/\/merchant\/withdrawal-max/.test(url)) r = state.max === 'network' ? 'network' : { status: 200, body: state.max };
        else if (/\/merchant\/withdrawal$/.test(url) && call.method === 'POST') r = state.withdraw;
        else r = { status: 401, body: { success: false } };
        if (r === 'network') throw new TypeError('Failed to fetch');
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
      };
    },
  });
  const win = dom.window; const doc = win.document; const $ = (id) => doc.getElementById(id);
  win.eval("jwtToken = 'tok-test'");
  const api = {
    win, doc, $, calls, state, errors,
    open: async () => { win.eval("jwtToken = 'tok-test'"); await win.loadRetraitPanel(); await flush(); },   // la page vérifie sa session au démarrage puis se déconnecte (401 simulé) : on réaffirme le jeton avant chaque action
    apiCorr: async () => { win.eval("jwtToken = 'tok-test'"); await win.loadApiCorrespondents(); await flush(); },
    pick: (key) => { $('retrait-correspondent').value = key; $('retrait-correspondent').dispatchEvent(new win.Event('change', { bubbles: true })); },
    fill: (msisdn, amount) => { $('retrait-msisdn').value = msisdn; $('retrait-amount').value = amount; },
    submit: async () => { win.eval("jwtToken = 'tok-test'"); await win.submitRetrait(); await flush(); },
    all: async () => { win.eval("jwtToken = 'tok-test'"); await win.retraitToutRetirer(); await flush(); },
    err: () => ($('retrait-error').style.display === 'none' ? '' : $('retrait-error').textContent),
    last: (re, method) => calls.filter((c) => re.test(c.url) && (!method || c.method === method)).pop(),
    opts: () => [...$('retrait-correspondent').querySelectorAll('option')].filter((o) => o.value).map((o) => o.textContent),
    groups: () => [...$('retrait-correspondent').querySelectorAll('optgroup')].map((g) => g.label),
  };
  return api;
}

(async () => {
  group('A. Liste des opérateurs du retrait');
  let p = load(); await p.open();
  check('la page se charge sans erreur', p.errors.length === 0, p.errors.slice(0, 2));
  check('la liste vient du serveur, avec la session de l\'utilisateur', p.last(/\/pos\/operators$/) && p.last(/\/pos\/operators$/).headers.Authorization === 'Bearer tok-test', p.calls.map((c) => c.url));
  check('opérateurs regroupés par pays, dans l\'ordre du serveur', JSON.stringify(p.groups()) === JSON.stringify(["🇨🇮 Côte d'Ivoire", '🇬🇦 Gabon', '🇰🇪 Kenya', '🇨🇩 RD Congo']), p.groups());
  check('RD Congo : Airtel et Vodacom en CDF ET en USD', JSON.stringify([...p.$('retrait-correspondent').querySelectorAll('optgroup')].find((g) => /RD Congo/.test(g.label)) && [...[...p.$('retrait-correspondent').querySelectorAll('optgroup')].find((g) => /RD Congo/.test(g.label)).children].map((o) => o.textContent)) === JSON.stringify(['Airtel Money · CDF', 'Airtel Money · USD', 'Vodacom M-Pesa · CDF', 'Vodacom M-Pesa · USD']), p.opts());
  check('un opérateur sans payout (Orange Sénégal, collecte seule) n\'est pas proposé', !p.opts().some((t) => /Orange/.test(t)) && !p.groups().some((g) => /Sénégal/.test(g)));
  check('plus de liste écrite à la main (Moov Gabon seulement une fois, valeur « code|devise »)', p.opts().filter((t) => /Moov Money · XAF/.test(t)).length === 1 && p.$('retrait-correspondent').querySelector('option[value="MOOV_GAB|XAF"]'));
  check('l\'ancienne route des limites (une seule devise par opérateur) n\'est plus appelée', !p.calls.some((c) => /correspondent-limits/.test(c.url)));
  for (const [label, cfg] of [['erreur serveur (500)', { opsStatus: 500 }], ['route inconnue (404)', { opsStatus: 404 }], ['coupure réseau', { opsStatus: 0 }]]) {
    p = load({ cfg }); await p.open(); p.pick('AIRTEL_GAB|XAF');
    check(`${label} : liste de secours (Gabon, Cameroun), avertissement affiché`, JSON.stringify(p.groups()) === JSON.stringify(['🇬🇦 Gabon', '🇨🇲 Cameroun']) && /liste non vérifiée/.test(p.$('retrait-limits').textContent), [p.groups(), p.$('retrait-limits').textContent]);
  }
  p = load({ cfg: { ops: [O('ORANGE_SEN', 'Orange Money', 'SEN', 'Sénégal', '🇸🇳', '221', 'XOF', L(2, 9), null)] } }); await p.open();
  check('aucun opérateur avec payout dans la liste : repli sur la liste de secours', JSON.stringify(p.groups()) === JSON.stringify(['🇬🇦 Gabon', '🇨🇲 Cameroun']), p.groups());
  p = load({ cfg: { source: 'fallback' } }); await p.open(); p.pick('AIRTEL_GAB|XAF'); check('liste complète « non vérifiée » du serveur : avertissement affiché', /liste non vérifiée/.test(p.$('retrait-limits').textContent));
  p = load({ cfg: { stale: true } }); await p.open(); p.pick('AIRTEL_GAB|XAF'); check('liste « ancienne » : pas d\'avertissement inutile', !/non vérifiée/.test(p.$('retrait-limits').textContent));
  const evil = '<img src=x onerror="window.__pwned=1">';
  p = load({ cfg: { ops: OPS.map((o) => (o.correspondent === 'MOOV_GAB' ? { ...o, name: evil, countryName: evil } : o)) } }); await p.open();
  check('noms hostiles : affichés comme texte, aucun élément injecté', p.opts().some((t) => t.includes(evil)) && p.doc.querySelectorAll('#retrait-correspondent img').length === 0 && !p.win.__pwned);

  group('B. Devise, limites, indicatif et solde suivent l\'opérateur');
  p = load(); await p.open();
  check('au départ : « Choisissez un opérateur »', /Choisissez un opérateur/.test(p.$('retrait-limits').textContent) && p.$('retrait-amount-label').textContent === 'Montant (XAF)');
  p.pick('AIRTEL_COD|USD');
  check('USD : libellé « Montant (USD) »', p.$('retrait-amount-label').textContent === 'Montant (USD)');
  check('USD : limites 0,1 à 2 500 USD', norm(p.$('retrait-limits').textContent) === 'Min : 0,1 USD — Max : 2 500 USD', p.$('retrait-limits').textContent);
  check('USD : le champ accepte les centimes (pas 0,01) avec min et max', p.$('retrait-amount').step === '0.01' && p.$('retrait-amount').min === '0.1' && p.$('retrait-amount').max === '2500', [p.$('retrait-amount').step, p.$('retrait-amount').min, p.$('retrait-amount').max]);
  check('RDC : indicatif +243 rappelé', /\+243/.test(p.$('retrait-msisdn-hint').textContent) && p.$('retrait-msisdn').placeholder.startsWith('243'));
  check('solde affiché dans la devise choisie (USD)', norm(p.$('retrait-selected-balance').textContent) === 'Solde disponible en USD : 12,5', p.$('retrait-selected-balance').textContent);
  p.pick('AIRTEL_COD|CDF'); check('CDF : devise, entiers seulement, limites 100 à 6 250 000', p.$('retrait-amount-label').textContent === 'Montant (CDF)' && p.$('retrait-amount').step === '1' && /Min : 100 CDF — Max : 6 250 000 CDF/.test(norm(p.$('retrait-limits').textContent)), p.$('retrait-limits').textContent);
  check('CDF : aucun solde en CDF → message clair', /Aucun solde disponible en CDF/.test(p.$('retrait-selected-balance').textContent), p.$('retrait-selected-balance').textContent);
  p.pick('AIRTEL_GAB|XAF'); check('XAF : solde 250 000 affiché', norm(p.$('retrait-selected-balance').textContent) === 'Solde disponible en XAF : 250 000', p.$('retrait-selected-balance').textContent);
  p.pick('MPESA_KEN|KES'); check('Kenya : KES et minimum du payout (10), pas celui de la collecte (1)', p.$('retrait-amount-label').textContent === 'Montant (KES)' && /Min : 10 KES/.test(p.$('retrait-limits').textContent), p.$('retrait-limits').textContent);
  p.pick(''); check('retour à « Choisir » : libellé, limites et solde remis à zéro', p.$('retrait-amount-label').textContent === 'Montant (XAF)' && /Choisissez/.test(p.$('retrait-limits').textContent) && p.$('retrait-selected-balance').textContent === '');
  p.pick('AIRTEL_COD|USD'); await p.open(); check('rechargement du panneau : le choix d\'opérateur est conservé', p.$('retrait-correspondent').value === 'AIRTEL_COD|USD' && p.$('retrait-amount-label').textContent === 'Montant (USD)');

  group('C. « Tout retirer » dans la devise choisie');
  p = load({ cfg: { max: { success: true, max: 12.347 } } }); await p.open(); p.pick('AIRTEL_COD|USD'); await p.all();
  check('USD : demande le maximum avec currency=USD et le bon opérateur', /currency=USD/.test(p.last(/withdrawal-max/).url) && /correspondent=AIRTEL_COD/.test(p.last(/withdrawal-max/).url) && !/currency=XAF/.test(p.last(/withdrawal-max/).url), p.last(/withdrawal-max/).url);
  check('USD : 12,347 → 12.34 (arrondi vers le bas au centime, jamais au-dessus du solde)', p.$('retrait-amount').value === '12.34', p.$('retrait-amount').value);
  p = load({ cfg: { max: { success: true, max: 600000 } } }); await p.open(); p.pick('AIRTEL_GAB|XAF'); await p.all();
  check('XAF : le maximum est plafonné à celui de l\'opérateur (500 000)', p.$('retrait-amount').value === '500000', p.$('retrait-amount').value);
  p = load({ cfg: { max: { success: true, max: 1234.9 } } }); await p.open(); p.pick('MOOV_GAB|XAF'); await p.all();
  check('XAF : 1234,9 → 1234 (entier)', p.$('retrait-amount').value === '1234', p.$('retrait-amount').value);
  p = load(); await p.open(); await p.all(); check('sans opérateur : message, aucune requête', /Choisissez d'abord un opérateur/.test(p.err()) && !p.last(/withdrawal-max/), p.err());
  p = load({ cfg: { max: { success: true, max: 0 } } }); await p.open(); p.pick('MOOV_GAB|XAF'); await p.all(); check('maximum nul : « Solde insuffisant », champ vide', /Solde insuffisant/.test(p.err()) && p.$('retrait-amount').value === '', p.err());
  p = load({ cfg: { max: { success: false, error: 'Solde introuvable' } } }); await p.open(); p.pick('MOOV_GAB|XAF'); await p.all(); check('erreur du serveur : son message s\'affiche', /Solde introuvable/.test(p.err()));
  p = load({ cfg: { max: 'network' } }); await p.open(); p.pick('MOOV_GAB|XAF'); await p.all(); check('réseau coupé : « Erreur réseau », aucune exception', /Erreur réseau/.test(p.err()) && p.errors.length === 0);

  group('D. Envoi du retrait');
  const cases = [
    ['MOOV_GAB|XAF', '062 70 94 01', '5000', { amount: '5000', currency: 'XAF', correspondent: 'MOOV_GAB', msisdn: '24162709401' }],
    ['MOOV_GAB|XAF', '+241 62 70 94 01', '5000', { msisdn: '24162709401' }], ['MOOV_GAB|XAF', '24162709401', '5000', { msisdn: '24162709401' }], ['AIRTEL_GAB|XAF', '77000000', '100', { amount: '100', correspondent: 'AIRTEL_GAB', msisdn: '24177000000' }],
    ['AIRTEL_COD|USD', '081 234 5678', '12.5', { amount: '12.50', currency: 'USD', correspondent: 'AIRTEL_COD', msisdn: '243812345678' }],
    ['AIRTEL_COD|CDF', '081 234 5678', '1000', { amount: '1000', currency: 'CDF', correspondent: 'AIRTEL_COD', msisdn: '243812345678' }],
    ['VODACOM_MPESA_COD|USD', '+243 99 123 4567', '0.5', { amount: '0.50', currency: 'USD', correspondent: 'VODACOM_MPESA_COD' }],
    ['MTN_MOMO_CIV|XOF', '07 12 34 56 78', '5', { amount: '5', currency: 'XOF', msisdn: '2250712345678' }],
    ['MPESA_KEN|KES', '0712 345 678', '10', { currency: 'KES', msisdn: '254712345678' }],
  ];
  for (const [key, num, amt, exp] of cases) {
    p = load(); await p.open(); p.pick(key); p.fill(num, amt); await p.submit(); const b = (p.last(/\/merchant\/withdrawal$/, 'POST') || {}).body;
    check(`${key} « ${num} » ${amt} → ${JSON.stringify(exp)}`, !!b && Object.entries(exp).every(([k, v]) => b[k] === v) && b.description === 'Retrait NDSGPay', b);
  }
  p = load(); await p.open(); p.pick('MOOV_GAB|XAF'); p.fill('62 70 94 01', '5000'); p.$('retrait-description').value = 'Salaires'; await p.submit();
  check('la description saisie est envoyée avec la session de l\'utilisateur', p.last(/\/merchant\/withdrawal$/, 'POST').body.description === 'Salaires' && p.last(/\/merchant\/withdrawal$/, 'POST').headers.Authorization === 'Bearer tok-test');
  const refusals = [
    [null, '62 70 94 01', '5000', /Choisissez un opérateur/], ['MOOV_GAB|XAF', '', '5000', /Numéro mobile requis/], ['MOOV_GAB|XAF', 'abc', '5000', /Numéro invalide/], ['MOOV_GAB|XAF', '123', '5000', /Numéro invalide/],
    ['MOOV_GAB|XAF', '62 70 94 01', '', /Saisissez un montant/], ['MOOV_GAB|XAF', '62 70 94 01', '0', /Saisissez un montant/],
    ['MOOV_GAB|XAF', '62 70 94 01', '50', /Montant minimum : 100 XAF/], ['MOOV_GAB|XAF', '62 70 94 01', '500000', /Montant maximum : 495 000 XAF/],
    ['MOOV_GAB|XAF', '62 70 94 01', '5000.5', /Montant entier requis en XAF/], ['AIRTEL_COD|CDF', '81 234 5678', '99', /Montant minimum : 100 CDF/],
    ['AIRTEL_COD|USD', '81 234 5678', '0.05', /Montant minimum : 0,1 USD/], ['AIRTEL_COD|USD', '81 234 5678', '3000', /Montant maximum : 2 500 USD/], ['AIRTEL_COD|USD', '81 234 5678', '1.234', /Au plus 2 décimales en USD/],
  ];
  for (const [key, num, amt, re] of refusals) {
    p = load(); await p.open(); if (key) p.pick(key); p.fill(num, amt); const n = p.calls.length; await p.submit();
    check(`refusé : ${key || 'sans opérateur'} « ${num} » « ${amt} » → ${re}`, re.test(norm(p.err())) && !p.last(/\/merchant\/withdrawal$/, 'POST') && p.calls.length === n, p.err());
  }
  p = load(); await p.open(); p.pick('MTN_MOMO_CIV|XOF'); p.fill('07 12 34 56 78', '5'); await p.submit(); check('minimum de 100 supprimé : 5 XOF acceptés (minimum de l\'opérateur : 1)', !!p.last(/\/merchant\/withdrawal$/, 'POST') && p.err() === '');
  p = load(); await p.open(); p.pick('MOOV_GAB|XAF'); p.fill('62 70 94 01', '5000'); const stats0 = p.calls.filter((c) => /\/stats$/.test(c.url)).length; await p.submit();
  check('succès : bouton « Retrait initié ✓ », champs vidés, soldes rechargés', p.$('retrait-btn').textContent === 'Retrait initié ✓' && p.$('retrait-msisdn').value === '' && p.$('retrait-amount').value === '' && p.calls.filter((c) => /\/stats$/.test(c.url)).length === stats0 + 1, p.$('retrait-btn').textContent);
  p = load({ cfg: { withdraw: { status: 400, body: { success: false, error: 'Solde insuffisant : maximum 1 000 USD' } } } }); await p.open(); p.pick('AIRTEL_COD|USD'); p.fill('81 234 5678', '12.5'); await p.submit();
  check('refus du serveur : son message s\'affiche, bouton redevenu utilisable', /Solde insuffisant : maximum 1 000 USD/.test(p.err()) && p.$('retrait-btn').disabled === false && p.$('retrait-btn').textContent === 'Initier le retrait', [p.err(), p.$('retrait-btn').textContent]);
  p = load({ cfg: { withdraw: { status: 400, body: { success: false, error: evil } } } }); await p.open(); p.pick('MOOV_GAB|XAF'); p.fill('62 70 94 01', '5000'); await p.submit(); check('message d\'erreur hostile du serveur : texte seulement', p.$('retrait-error').textContent === evil && p.$('retrait-error').querySelectorAll('img').length === 0 && !p.win.__pwned);

  group('E. Clés API → « Correspondants disponibles »');
  p = load(); await p.apiCorr();
  const headers = [...p.$('api-corr-head').querySelectorAll('th')].map((t) => t.textContent); const rows = [...p.$('api-corr-body').querySelectorAll('tr')];
  check('requête avec la session de l\'utilisateur', p.last(/\/pos\/operators$/).headers.Authorization === 'Bearer tok-test');
  check('en-têtes : pays, opérateur, code, devise, limites de collecte et de payout', JSON.stringify(headers) === JSON.stringify(['Pays', 'Opérateur', 'Code correspondent', 'Devise', 'Collecte (min – max)', 'Payout (min – max)']), headers);
  check('une ligne par opérateur et par devise (9), dont les 4 lignes de la RDC', rows.length === 9 && rows.filter((r) => /RD Congo/.test(r.textContent)).length === 4, rows.length);
  const usd = rows.find((r) => /AIRTEL_COD/.test(r.textContent) && /USD/.test(r.children[3].textContent));
  check('RDC en USD présente, avec ses limites', !!usd && norm(usd.children[4].textContent) === '0,1 – 2 500' && norm(usd.children[5].textContent) === '0,1 – 2 500', usd && [...usd.children].map((c) => c.textContent));
  const sen = rows.find((r) => /ORANGE_SEN/.test(r.textContent)); check('opérateur en collecte seule : payout « non disponible »', !!sen && sen.children[5].textContent === 'non disponible' && /2 – 100 000 000/.test(norm(sen.children[4].textContent)), sen && [...sen.children].map((c) => c.textContent));
  check('le code d\'opérateur est en police à chasse fixe', rows.every((r) => r.children[2].classList.contains('td-mono')));
  check('mention : opérateurs activés sur votre compte', /activés sur votre compte, avec leurs limites/.test(p.$('api-corr-note').textContent), p.$('api-corr-note').textContent);
  p = load({ cfg: { source: 'fallback' } }); await p.apiCorr(); check('liste complète non vérifiée : la page le dit', /activation sur votre compte n.a pas pu être vérifiée/.test(p.$('api-corr-note').textContent), p.$('api-corr-note').textContent);
  p = load({ cfg: { stale: true } }); await p.apiCorr(); check('liste ancienne : la page le dit', /dernière liste connue/.test(p.$('api-corr-note').textContent));
  const staticRows = (() => { const q = load(); return q.$('api-corr-body').querySelectorAll('tr').length; })();
  for (const [label, cfg] of [['erreur serveur', { opsStatus: 500 }], ['réseau coupé', { opsStatus: 0 }]]) {
    p = load({ cfg }); await p.apiCorr();
    check(`${label} : le tableau écrit dans la page reste affiché (${staticRows} lignes) avec une mention`, p.$('api-corr-body').querySelectorAll('tr').length === staticRows && staticRows >= 20 && /Liste générale NDSGPay/.test(p.$('api-corr-note').textContent) && p.errors.length === 0, [p.$('api-corr-body').querySelectorAll('tr').length, p.$('api-corr-note').textContent]);
  }
  p = load({ cfg: { ops: OPS.map((o) => (o.correspondent === 'MOOV_GAB' ? { ...o, name: evil, countryName: evil, correspondent: evil } : o)) } }); await p.apiCorr();
  check('noms hostiles dans le tableau : texte seulement, aucun élément injecté', p.doc.querySelectorAll('#api-corr-body img').length === 0 && !p.win.__pwned && p.$('api-corr-body').textContent.includes(evil));

  group('F. Contrôles du code');
  const fn = HTML.slice(HTML.indexOf('async function loadRetraitOperators'), HTML.indexOf('function exportRetraitCSV'));
  check('les nouvelles fonctions n\'injectent aucun HTML venu du serveur (ni innerHTML ni outerHTML)', fn.length > 3000 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(fn));
  check('plus de devise XAF écrite en dur dans l\'envoi ni dans le calcul du maximum', !/currency:\s*'XAF',\s*correspondent/.test(HTML) && !/currency=XAF/.test(HTML));
  check('plus de minimum fixe de 100 XAF dans l\'envoi', !/parseFloat\(amount\)\s*<\s*100/.test(HTML) && !/Montant minimum : 100 XAF\./.test(HTML.slice(HTML.indexOf('async function submitRetrait'), HTML.indexOf('async function loadApiCorrespondents'))));
  check('l\'ouverture du panneau « Clés API » charge la liste', /if \(name === 'apikeys'\) loadApiCorrespondents\(\);/.test(HTML));
  check('la liste de secours du retrait reste en XAF (Gabon, Cameroun) comme avant', (HTML.match(/currency: 'XAF', payout:/g) || []).length === 4);

  for (const g of groups) log(`${g.fails.length ? '✗' : '✓'} ${g.n.padEnd(58)} ${g.pass} réussis${g.fails.length ? ', ' + g.fails.length + ' ÉCHEC(S)' : ''}`);
  log(`\n${ok} / ${total} vérifications réussies`);
  if (ok !== total) { log('\nÉCHECS :'); groups.forEach((g) => g.fails.forEach((f) => log(`  ✗ [${g.n}] ${f}`))); }
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { log('ERREUR DE TEST :', (e && e.stack) || e); process.exit(2); });
