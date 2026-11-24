// Test de la page admin « Soldes marchands » (admin.html : le VRAI fichier) dans JSDOM.
// Une ligne par opérateur ET par devise ; les centimes de l'USD sont conservés, les autres devises restent entières.
const { JSDOM, VirtualConsole } = require('jsdom');          // npm i jsdom (voir tests/README.md)
const fs = require('fs'); const path = require('path');
const FILE = process.env.ADMIN_HTML || path.resolve(__dirname, '..', 'admin.html');
const HTML = fs.readFileSync(FILE, 'utf8');
const log = console.log.bind(console); const flush = () => new Promise((r) => setTimeout(r, 30));
const groups = []; let G; let total = 0; let ok = 0;
const group = (n) => { G = { n, pass: 0, fails: [] }; groups.push(G); };
const check = (name, cond, detail) => { total++; if (cond) { ok++; G.pass++; } else G.fails.push(name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

const line = (correspondent, currency, o = {}) => ({ correspondent, country: 'RDC', flag: '🇨🇩', currency, depositVolume: 0, payoutVolume: 0, fees: 0, withdrawals: 0, availableBalance: 0, ...o });
async function render(merchants) {
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation to another Document|Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(HTML, { url: 'https://ndsgpay.ndsgservices.com/admin.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) { win.scrollTo = () => {}; win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, merchants, wallets: [] }) }); } });
  const win = dom.window; win.eval("adminKey = 'k'"); await win.loadBalances(); await flush();
  const rows = [...win.document.querySelectorAll('#balances-body tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
  return { rows, html: win.document.getElementById('balances-body').innerHTML, errors };
}
const NB = /[  ]/g;   // espaces fines de l'affichage français
const norm = (s) => s.replace(NB, ' ');

(async () => {
  group('A. Une ligne par opérateur et par devise');
  const m = { id: 'm1', name: 'Marchand RDC', email: 'rdc@test', isActive: true, totalTransactions: 3, currencies: ['CDF', 'USD'], correspondents: ['AIRTEL_COD', 'AIRTEL_COD|USD'],
    balancesByCurrency: {}, balancesByCorrespondent: {
      AIRTEL_COD: line('AIRTEL_COD', 'CDF', { depositVolume: 1000, fees: 30, availableBalance: 970 }),
      'AIRTEL_COD|USD': line('AIRTEL_COD', 'USD', { depositVolume: 25.6, payoutVolume: 10, fees: 0.97, availableBalance: 14.63 }),
    } };
  let r = await render([m]); const out = r.rows.map((x) => x.map(norm));
  check('aucune erreur dans la page', r.errors.length === 0, r.errors);
  check('3 lignes : le marchand puis ses deux lignes d\'opérateur', out.length === 3, out);
  const cdf = out[1], usd = out[2];
  check('ligne CDF : code de l\'opérateur sans la clé technique, montants entiers', /AIRTEL_COD/.test(cdf[1]) && !/\|/.test(cdf[1]) && cdf[2] === '1 000 CDF' && cdf[4] === '30 CDF' && cdf[6] === '970 CDF', cdf);
  check('ligne USD : « AIRTEL_COD · USD » (jamais « AIRTEL_COD|USD »)', /AIRTEL_COD · USD/.test(cdf[1] === usd[1] ? '' : usd[1]) && !/\|/.test(usd[1]), usd[1]);
  check('USD : les centimes sont conservés (25,60 / 10,00 / 0,97 / 14,63)', usd[2] === '25,60 USD' && usd[3] === '10,00 USD' && usd[4] === '0,97 USD' && usd[6] === '14,63 USD', usd);
  check('CDF : pas de décimales ajoutées', !/,\d/.test(cdf.join(' ')), cdf);

  group('B. Cas limites d\'affichage');
  const m2 = { ...m, balancesByCorrespondent: { MOOV_GAB: line('MOOV_GAB', 'XAF', { flag: '🇬🇦', depositVolume: 50000, fees: 1500, availableBalance: 48500 }), 'AIRTEL_COD|USD': line('AIRTEL_COD', 'USD', { availableBalance: -0.3 }) } };
  r = await render([m2]); const o2 = r.rows.map((x) => x.map(norm));
  check('un opérateur à une seule devise : code seul, sans suffixe de devise', /MOOV_GAB/.test(o2[1][1]) && !/·/.test(o2[1][1]) && o2[1][6] === '48 500 XAF', o2[1]);
  check('solde USD négatif : affiché avec ses centimes et en rouge', o2[2][6] === '-0,30 USD' && /var\(--danger\)/.test(r.html), o2[2][6]);
  check('montant à zéro : « 0 USD » grisé, sans décimales', o2[2][2] === '0 USD', o2[2][2]);
  const m3 = { ...m, balancesByCorrespondent: {}, balancesByCurrency: { USD: { depositVolume: 12.5, payoutVolume: 0, fees: 0.38, withdrawals: 0, availableBalance: 12.12 } }, currencies: ['USD'] };
  r = await render([m3]); const o3 = r.rows.map((x) => x.map(norm));
  check('marchand sans ligne d\'opérateur : repli par devise, USD avec centimes', o3[1] && o3[1][2] === '12,50 USD' && o3[1][6] === '12,12 USD', o3);
  r = await render([]); check('aucun marchand : message « Aucun marchand »', /Aucun marchand/.test(r.html));

  for (const g of groups) log(`${g.fails.length ? '✗' : '✓'} ${g.n.padEnd(58)} ${g.pass} réussis${g.fails.length ? ', ' + g.fails.length + ' ÉCHEC(S)' : ''}`);
  log(`\n${ok} / ${total} vérifications réussies`);
  if (ok !== total) { log('\nÉCHECS :'); groups.forEach((g) => g.fails.forEach((f) => log(`  ✗ [${g.n}] ${f}`))); }
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { log('ERREUR', e && e.stack || e); process.exit(2); });
