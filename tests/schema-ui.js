// Test des schémas synoptiques du dashboard : les VRAIS fichiers docs.html, admin.html et synoptique.js dans JSDOM.
//  A. docs.html : schéma PUBLIC (11 blocs, 9 flèches), sans pawaPay, fichier ni route ; géométrie propre ; cliquable
//  B. synoptique.js : données hostiles affichées comme du texte, configuration invalide refusée
//  C. admin.html : onglet « Schéma » chargé avec la clé admin, une seule fois, refus 401/403/réseau gérés, effacé à la déconnexion
//  D. Fuite : rien du schéma interne n'est écrit dans un fichier public (docs.html, admin.html, synoptique.js)
const { JSDOM, VirtualConsole } = require('jsdom');          // voir tests/README.md
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(process.env[f.toUpperCase().replace('.', '_')] || path.join(ROOT, f), 'utf8');
const SYN = read('synoptique.js'); const DOCS = read('docs.html'); const ADMIN = read('admin.html');
const inline = (html) => html.replace('<script src="synoptique.js"></script>', () => '<script>' + SYN + '</script>');
const log = console.log.bind(console); const flush = () => new Promise((r) => setTimeout(r, 30));
const groups = []; let G; let total = 0; let ok = 0;
const group = (n) => { G = { n, pass: 0, fails: [] }; groups.push(G); };
const check = (name, cond, detail) => { total++; if (cond) { ok++; G.pass++; } else G.fails.push(name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();

function page(html, url, fetchImpl) {
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation to another Document|Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(inline(html), { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); if (fetchImpl) w.fetch = fetchImpl; } });
  return { w: dom.window, d: dom.window.document, errors };
}
const rects = (d) => [...d.querySelectorAll('.nsyn-svg .nd')].filter((g) => !g.querySelector('.cont')).map((g) => { const r = g.querySelector('rect'); return { id: g.dataset.id, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }; });
const onBorder = (pt, b) => { const [x, y] = pt, e = 2; return x >= b.x - e && x <= b.x + b.w + e && y >= b.y - e && y <= b.y + b.h + e && (Math.abs(x - b.x) <= e || Math.abs(x - b.x - b.w) <= e || Math.abs(y - b.y) <= e || Math.abs(y - b.y - b.h) <= e); };
const click = (w, el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));

(async () => {
  // ── A ──────────────────────────────────────────────────────────────────────
  group('A. docs.html — schéma public');
  const D = page(DOCS, 'https://ndsgpay.ndsgservices.com/docs.html'); const d = D.d, w = D.w;
  check('aucune erreur de script', D.errors.length === 0, D.errors);
  const sec = d.getElementById('comment-ca-marche'); check('section « Comment fonctionne NDSGPay » présente', !!sec && /Comment fonctionne NDSGPay/.test(txt(sec)));
  const base = [...d.querySelectorAll('.api-section-title')].find((x) => /Base URL/.test(x.textContent));
  check('placée avant « Base URL » (juste sous l\'introduction)', !!base && !!(sec.compareDocumentPosition(base.parentElement) & w.Node.DOCUMENT_POSITION_FOLLOWING));
  check('11 blocs (conteneur compris) et 9 flèches avec libellé', d.querySelectorAll('#syn-public .nd').length === 11 && d.querySelectorAll('#syn-public polyline.e').length === 9 && d.querySelectorAll('#syn-public text.el').length === 9);
  check('bloc « Contrôles et frais » sélectionné au départ, détail affiché', d.querySelector('#syn-public .nd.on').dataset.id === 'ctrl' && /Contrôles et frais/.test(txt(d.querySelector('.nsyn-detail'))));
  const shown = txt(sec);
  check('aucune mention de pawaPay', !/pawa/i.test(shown) && !/pawa/i.test(DOCS.slice(DOCS.indexOf('id="comment-ca-marche"'), DOCS.indexOf('Base URL'))));
  check('aucun fichier, route ni code technique', !/\.js\b|\/pay\/|\/webhooks|\/admin\/|Prisma|Supabase|Vercel|RFC/.test(shown) && !d.querySelector('.nsyn-detail code'));
  const R = rects(d); const ov = []; R.forEach((a, i) => R.slice(i + 1).forEach((b) => { if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) ov.push(a.id + '/' + b.id); }));
  check('aucune boîte ne recouvre une autre', ov.length === 0, ov);
  const W = +d.querySelector('.nsyn-svg').getAttribute('viewBox').split(' ')[2], H = +d.querySelector('.nsyn-svg').getAttribute('viewBox').split(' ')[3];
  check('toutes les boîtes dans le cadre', R.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H));
  const allRects = [...d.querySelectorAll('#syn-public .nd rect')].map((r) => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }));
  const bad = []; d.querySelectorAll('#syn-public polyline.e').forEach((pl, i) => { const pts = pl.getAttribute('points').split(' ').map((p) => p.split(',').map(Number)); [pts[0], pts[pts.length - 1]].forEach((pt, k) => { if (!allRects.some((b) => onBorder(pt, b))) bad.push(i + (k ? ' arrivée' : ' départ')); }); });
  check('chaque extrémité de flèche touche le bord d\'un bloc', bad.length === 0, bad);
  click(w, d.querySelector('#syn-public .nd[data-id="merch"]'));
  check('clic sur Marchand : un seul bloc actif, flèches en surbrillance, détail mis à jour', d.querySelectorAll('#syn-public .nd.on').length === 1 && d.querySelector('#syn-public .nd.on').dataset.id === 'merch' && d.querySelectorAll('#syn-public polyline.e.on').length >= 3 && /Marchand/.test(txt(d.querySelector('.nsyn-detail'))));
  d.querySelector('#syn-public .nd[data-id="wd"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('clavier : Entrée sur « Retraits bancaires »', d.querySelector('#syn-public .nd.on').dataset.id === 'wd');
  d.querySelector('#syn-public .nd[data-id="ndsg"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  check('clavier : Espace sur le conteneur NDSGPay', d.querySelector('#syn-public .nd.on').dataset.id === 'ndsg');
  check('légende = aria-label du schéma', d.querySelector('.nsyn-cap').textContent.length > 40 && d.querySelector('.nsyn-svg').getAttribute('aria-label') === d.querySelector('.nsyn-cap').textContent);
  check('la page de documentation garde ses autres sections', /Base URL/.test(txt(d.body)) && /Documentation API NDSGPay/.test(txt(d.body)));
  check('docs.html n\'appelle aucune API pour afficher le schéma', !/fetch\(/.test(DOCS.slice(DOCS.indexOf('id="comment-ca-marche"'), DOCS.indexOf('Base URL'))));

  // ── B ──────────────────────────────────────────────────────────────────────
  group('B. synoptique.js — robustesse');
  const B = page('<!doctype html><html><head></head><body><div id="m"></div><script src="synoptique.js"></script></body></html>', 'https://x.test/');
  const evil = { W: 400, H: 200, caption: '<img src=x onerror=window.PWN=1> légende', first: 'a', nodes: [
    { id: 'a', t: '<b>Gras</b>|"ligne"', s: "<script>window.PWN=2</script>", x: 10, y: 10, w: 150, h: 60, d: { k: '<i>k</i>', x: '<img src=x onerror=window.PWN=3>', f: ['<u>f</u>'], r: ['</code><img src=x onerror=window.PWN=4>'] } },
    { id: 'b', t: 'B', x: 220, y: 10, w: 100, h: 60 }], edges: [{ from: 'a', to: 'b', p: [[160, 40], [220, 40]], l: '<svg onload=window.PWN=5>', lx: 190, ly: 30 }] };
  B.w.NDSGSyn.mount(B.d.getElementById('m'), evil);
  check('données hostiles : aucune balise injectée, aucun script exécuté', !B.d.querySelector('#m img, #m script, #m b, #m i, #m u') && !B.w.PWN && /<img src=x/.test(B.d.getElementById('m').textContent), B.w.PWN);
  check('données hostiles : affichées comme du texte', /<b>Gras<\/b>/.test(txt(B.d.querySelector('.nsyn-svg'))) && /<svg onload/.test(txt(B.d.querySelector('.nsyn-svg'))));
  let threw = 0; for (const bad of [null, {}, { nodes: [] }, { nodes: [], edges: 'x' }, 'x']) { try { B.w.NDSGSyn.mount(B.d.getElementById('m'), bad); } catch (_) { threw++; } }
  check('configuration invalide refusée (5 cas)', threw === 5, threw);
  const B2 = page('<!doctype html><html><head></head><body><div id="m"></div><div id="n"></div><script src="synoptique.js"></script></body></html>', 'https://x.test/');
  B2.w.NDSGSyn.mount(B2.d.getElementById('m'), { W: 300, H: 100, caption: 'c', nodes: [{ id: 'a', t: 'A', x: 1, y: 1, w: 80, h: 40 }], edges: [] });
  B2.w.NDSGSyn.mount(B2.d.getElementById('n'), { W: 300, H: 100, caption: 'c', nodes: [{ id: 'a', t: 'A', x: 1, y: 1, w: 80, h: 40 }], edges: [] });
  check('deux schémas sur la même page : une seule feuille de style, identifiants de flèches distincts', B2.d.querySelectorAll('#nsyn-css').length === 1 && new Set([...B2.d.querySelectorAll('marker')].map((m) => m.id)).size === 4);
  check('un bloc sans détail ni sélection initiale : aucun plantage', B2.d.querySelector('#m .nsyn-detail').innerHTML === '');

  // ── C ──────────────────────────────────────────────────────────────────────
  group('C. admin.html — onglet Schéma');
  const SCHEMA = { W: 600, H: 300, caption: 'Schéma de test assez long pour la légende du schéma synoptique interne.', first: 'b', nodes: [
    { id: 'a', k: 'actor', t: 'Acteur', x: 10, y: 20, w: 120, h: 60, d: { k: 'Externe', x: 'Un acteur.' } },
    { id: 'b', t: 'Module B', x: 250, y: 20, w: 140, h: 60, d: { x: 'Détail de B.', f: ['b.js'], r: ['/b/route'] } },
    { id: 'c', k: 'actor', t: 'Base', x: 250, y: 150, w: 140, h: 60 }], edges: [
    { from: 'a', to: 'b', p: [[130, 50], [250, 50]], l: 'appel', lx: 190, ly: 42 }, { from: 'b', to: 'c', p: [[320, 80], [320, 150]], l: 'écrit', lx: 332, ly: 120, a: 'start' }] };
  const calls = []; let mode = 'ok';
  const fetchImpl = async (url, opts) => { calls.push({ url: String(url), headers: (opts && opts.headers) || {} });
    if (/\/admin\/schema$/.test(url)) {
      if (mode === 'ok') return { ok: true, status: 200, json: async () => ({ success: true, schema: SCHEMA }) };
      if (mode === '401') return { ok: false, status: 401, json: async () => ({ success: false, error: 'Accès admin requis' }) };
      if (mode === '403') return { ok: false, status: 403, json: async () => ({ success: false, error: 'Accès réservé' }) };
      if (mode === '500') return { ok: false, status: 500, json: async () => ({ success: false }) };
      throw new Error('réseau coupé');
    }
    return { ok: true, status: 200, json: async () => ({ success: true, merchants: [], logs: [], deliveries: [], stats: {}, wallets: [], withdrawals: [], transactions: [] }) }; };
  const A = page(ADMIN, 'https://ndsgpay.ndsgservices.com/admin.html', fetchImpl); const ad = A.d, aw = A.w;
  await flush(); aw.eval("adminKey = 'cle-admin-test'");
  check('aucune erreur de script', A.errors.length === 0, A.errors);
  check('bouton « 🗺️ Schéma » présent après « Audit »', /Schéma/.test(txt(ad.getElementById('tab-schema'))) && ad.getElementById('tab-audit').nextElementSibling === ad.getElementById('tab-schema'));
  check('panneau caché au départ, aucun appel au schéma avant le clic', ad.getElementById('panel-schema').style.display === 'none' && !calls.some((c) => /admin\/schema/.test(c.url)), calls.map((c) => c.url));
  aw.switchTab('schema'); await flush();
  const sc = calls.filter((c) => /admin\/schema/.test(c.url));
  check('clic : un appel GET /admin/schema avec la clé admin dans l\'en-tête x-admin-key', sc.length === 1 && sc[0].headers['x-admin-key'] === 'cle-admin-test', sc);
  check('panneau visible, onglet actif, autres panneaux cachés', ad.getElementById('panel-schema').style.display === 'block' && ad.getElementById('tab-schema').classList.contains('active') && ['merchants', 'transactions', 'withdrawals', 'balances', 'operators', 'reconcile', 'audit', 'webhooks'].every((t) => ad.getElementById('panel-' + t).style.display === 'none' && !ad.getElementById('tab-' + t).classList.contains('active')));
  check('schéma affiché : 3 blocs, 2 flèches, bloc « b » sélectionné, fichiers et routes listés', ad.querySelectorAll('#schema-mount .nd').length === 3 && ad.querySelectorAll('#schema-mount polyline.e').length === 2 && ad.querySelector('#schema-mount .nd.on').dataset.id === 'b' && /b\.js/.test(txt(ad.querySelector('.nsyn-detail'))) && /\/b\/route/.test(txt(ad.querySelector('.nsyn-detail'))));
  check('message de chargement effacé', txt(ad.getElementById('schema-status')) === '');
  click(aw, ad.querySelector('#schema-mount .nd[data-id="c"]')); check('clic sur un bloc fonctionne dans l\'admin', ad.querySelector('#schema-mount .nd.on').dataset.id === 'c');
  aw.switchTab('audit'); await flush(); aw.switchTab('schema'); await flush();
  check('retour sur l\'onglet : pas de nouvel appel, sélection conservée', calls.filter((c) => /admin\/schema/.test(c.url)).length === 1 && ad.querySelector('#schema-mount .nd.on').dataset.id === 'c');
  aw.doLogout(); await flush();
  check('déconnexion : schéma effacé de la page', ad.getElementById('schema-mount').innerHTML === '' && txt(ad.getElementById('schema-status')) === '' && !ad.querySelector('.nsyn-svg'));
  check('déconnexion : plus aucun texte du schéma dans la page', !/Module B|b\.js|\/b\/route/.test(ad.body.textContent));
  for (const [m, expect] of [['401', /Accès refusé/], ['403', /Accès refusé/], ['500', /indisponible/], ['net', /Erreur de connexion/]]) {
    mode = m; aw.eval("adminKey = 'cle'"); aw.switchTab('schema'); await flush();
    check(`réponse ${m} : message clair, aucun schéma, pas de plantage`, expect.test(txt(ad.getElementById('schema-status'))) && !ad.querySelector('#schema-mount .nd'), txt(ad.getElementById('schema-status')));
  }
  mode = 'ok'; const before = calls.filter((c) => /admin\/schema/.test(c.url)).length; aw.switchTab('merchants'); aw.switchTab('schema'); await flush();
  check('après un refus, un nouveau clic réessaie et affiche le schéma', calls.filter((c) => /admin\/schema/.test(c.url)).length === before + 1 && ad.querySelectorAll('#schema-mount .nd').length === 3);
  // données hostiles venant du serveur
  const A2 = page(ADMIN, 'https://ndsgpay.ndsgservices.com/admin.html', async (u) => /schema$/.test(u) ? { ok: true, status: 200, json: async () => ({ success: true, schema: evil }) } : { ok: true, status: 200, json: async () => ({ success: true, merchants: [], logs: [], deliveries: [], stats: {}, wallets: [], withdrawals: [], transactions: [] }) });
  await flush(); A2.w.eval("adminKey = 'k'"); A2.w.switchTab('schema'); await flush();
  check('admin : schéma hostile venant du serveur affiché comme du texte, rien d\'exécuté', !A2.d.querySelector('#schema-mount img, #schema-mount script, #schema-mount b') && !A2.w.PWN && /<b>Gras<\/b>/.test(txt(A2.d.querySelector('#schema-mount .nsyn-svg'))), A2.w.PWN);

  // ── D ──────────────────────────────────────────────────────────────────────
  group('D. Aucune fuite du schéma interne dans un fichier public');
  const MARKS = ['Supabase, PostgreSQL', 'cron-job.org', 'transaction-completion', 'RFC-9421', 'Callbacks signés', 'callback signé', 'webhooks.controller', 'Webhooks marchand', 'Droits, limites, solde', 'Dashboard, admin, caisses', 'NDSGPay (Vercel, Express)', 'dépôt, paiement v1'];
  for (const [n, src] of [['docs.html', DOCS], ['admin.html', ADMIN], ['synoptique.js', SYN]]) {
    const hit = MARKS.filter((m) => src.includes(m)); check(`${n} : aucun texte du schéma interne`, hit.length === 0, hit);
  }
  check('docs.html : aucune mention de pawaPay du tout', !/pawa/i.test(DOCS));
  check('admin.html : le schéma est demandé au serveur (route protégée), jamais écrit dans la page', /\/admin\/schema/.test(ADMIN) && !/"nodes"\s*:/.test(ADMIN) && !/nodes\s*:\s*\[/.test(ADMIN));
  check('synoptique.js : aucune donnée, aucun appel réseau', !/fetch\(|XMLHttpRequest|localStorage|sessionStorage/.test(SYN));

  const bad2 = groups.filter((g) => g.fails.length);
  groups.forEach((g) => log((g.fails.length ? '✗ ' : '✓ ') + g.n + `  (${g.pass}/${g.pass + g.fails.length})`));
  bad2.forEach((g) => g.fails.forEach((f) => log('   ✗ ' + g.n.split('.')[0] + ' · ' + f)));
  log(`\n${ok} / ${total} vérifications réussies`); process.exit(ok === total ? 0 : 1);
})().catch((e) => { log('ERREUR', e.stack); process.exit(2); });
