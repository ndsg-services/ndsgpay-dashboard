// Test de la fenêtre QR et du panneau « Caisses POS » (app.html : le VRAI fichier) dans JSDOM.
// Le QR est dessiné dans la page, puis RELU avec un décodeur (jsqr) : il doit redonner exactement le lien d'activation.
const { JSDOM, VirtualConsole } = require('jsdom');          // npm i jsdom jsqr (voir tests/README.md)
let jsQR = null; try { jsQR = require('jsqr'); } catch (e) { /* le décodage est alors ignoré */ }
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const FILE = process.env.APP_HTML || path.resolve(__dirname, '..', 'app.html');
const LIBFILE = path.resolve(__dirname, '..', 'vendor', 'qrcode-generator.js');
const HTML = fs.readFileSync(FILE, 'utf8'); const LIB = fs.readFileSync(LIBFILE, 'utf8');
const vm = require('vm'); const libQr = vm.runInNewContext(LIB + '\nqrcode');   // la bibliothèque, pour comparer le dessin de la page à sa matrice
const API = 'https://ndsgpay-backend.vercel.app/api';
const log = console.log.bind(console); const flush = () => new Promise((r) => setTimeout(r, 30));

const groups = []; let G; let total = 0; let ok = 0;
const group = (n) => { G = { n, pass: 0, fails: [] }; groups.push(G); };
const check = (name, cond, detail) => { total++; if (cond) { ok++; G.pass++; } else G.fails.push(name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

function load({ lib = true, qr = { status: 200, body: { success: true, activationUrl: 'https://ndsgpay.ndsgservices.com/pos.html?key=sk_pos_aaaa1111bbbb2222&label=Caisse%201&keyid=p1', label: 'Caisse 1' } }, list = { status: 200, body: { success: true, keys: [] } }, network = false } = {}) {
  const state = { qr, list }; const calls = []; const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation to another Document/.test(e.message)) errors.push(e.message); });   // la page redirige vers la connexion au démarrage : JSDOM ne sait pas naviguer
  const dom = new JSDOM(HTML, {
    url: 'https://ndsgpay.ndsgservices.com/app.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) {
      win.scrollTo = () => {};
      win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      win.fetch = async (url, opts = {}) => {
        calls.push({ url: String(url), headers: opts.headers || {}, method: opts.method || 'GET' });
        if (network && /\/pos-keys/.test(url)) throw new TypeError('Failed to fetch');
        const r = /\/pos-keys\/[^/]+\/qr$/.test(url) ? state.qr : /\/pos-keys$/.test(url) ? state.list : { status: 401, body: { success: false } };
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
      };
      if (lib) win.eval(LIB);   // la page charge ce fichier par <script src="/vendor/qrcode-generator.js"> ; JSDOM ne charge pas les fichiers externes
    },
  });
  const win = dom.window; const doc = win.document; const $ = (id) => doc.getElementById(id);
  win.eval("jwtToken = 'tok-test'");
  return { win, doc, $, state, calls, qrCalls: () => calls.filter((c) => /\/pos-keys/.test(c.url)), errors, shown: () => $('poskey-qr-modal').style.display === 'flex', svg: () => $('qr-container').querySelector('svg'), msg: () => $('qr-container').textContent.trim(),
    open: async (id = 'p1', label = 'Caisse 1') => { await win.showQRCode(id, label); await flush(); }, currentUrl: () => win.eval('currentQRUrl') };
}

// Relit l'image : reconstruit les pixels à partir du tracé du SVG puis décode
function decode(svg) {
  const [, , w] = svg.getAttribute('viewBox').split(' ').map(Number); const S = 8; const px = w * S;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  const d = svg.querySelector('path').getAttribute('d'); const re = /M(\d+),(\d+)h1v1h-1z/g; let m; let count = 0;
  while ((m = re.exec(d))) { count++; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (((+m[2]) * S + y) * px + (+m[1]) * S + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } }
  const res = jsQR(data, px, px); return { text: res ? res.data : null, modules: count };
}

// Compare le dessin de la page à la matrice de la bibliothèque, case par case (ligne r, colonne c) : un QR transposé ou
// décalé serait relu par un décodeur (c'est un miroir), mais il ne serait pas fidèle. On exige aussi la zone blanche autour.
function matrixCheck(svg, url) {
  const q = libQr(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount();
  const size = Number(svg.getAttribute('viewBox').split(' ')[2]); const margin = (size - n) / 2;
  const dark = new Set(); const re = /M(\d+),(\d+)h1v1h-1z/g; let m; const d = svg.querySelector('path').getAttribute('d');
  while ((m = re.exec(d))) dark.add(m[1] + ',' + m[2]);
  let wrong = 0; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark.has((c + margin) + ',' + (r + margin)) !== !!q.isDark(r, c)) wrong++;
  return { n, size, margin, wrong, drawn: dark.size };
}

(async () => {
  group('A. QR code dessiné dans la page');
  let p = load(); await p.open();
  check('la page se charge sans erreur', p.errors.length === 0, p.errors.slice(0, 2));
  check('la fenêtre s\'ouvre avec le nom de la caisse', p.shown() && p.$('qr-label').textContent === 'Caisse 1');
  check('le lien d\'activation est affiché sous le QR', p.$('qr-url').textContent.includes('key=sk_pos_aaaa1111bbbb2222') && p.currentUrl() === p.$('qr-url').textContent);
  check('le QR est un dessin (svg avec un tracé), pas une image externe', !!p.svg() && !!p.svg().querySelector('path') && p.$('qr-container').querySelectorAll('img').length === 0);
  check('une seule requête pour le QR, vers le serveur NDSGPay, avec la session de l\'utilisateur', p.qrCalls().length === 1 && p.qrCalls()[0].url === API + '/pos-keys/p1/qr' && p.qrCalls()[0].headers.Authorization === 'Bearer tok-test', p.calls.map((c) => c.url));
  check('aucune requête vers un autre site (le lien secret ne sort pas de la page)', p.calls.every((c) => c.url.startsWith(API + '/')), p.calls.map((c) => c.url));
  const mc = matrixCheck(p.svg(), p.currentUrl());
  check('chaque case du dessin est à sa place (ligne, colonne) par rapport à la matrice de la bibliothèque', mc.wrong === 0 && mc.drawn > 100, mc);
  check('une zone blanche d\'au moins 2 cases entoure le QR (nécessaire à la lecture au téléphone)', Number.isInteger(mc.margin) && mc.margin >= 2, mc);
  if (jsQR) {
    const dec = decode(p.svg());
    check('relu avec un décodeur : le QR redonne EXACTEMENT le lien d\'activation, clé comprise', dec.text === 'https://ndsgpay.ndsgservices.com/pos.html?key=sk_pos_aaaa1111bbbb2222&label=Caisse%201&keyid=p1', dec);
    const long = 'https://ndsgpay.ndsgservices.com/pos.html?key=sk_pos_' + 'f'.repeat(48) + '&label=' + encodeURIComponent('Caisse très longue — Libreville centre ' + 'x'.repeat(40)) + '&keyid=4ce4ed2d-7e58-480e-b13d-c904f694a345';
    p = load({ qr: { status: 200, body: { success: true, activationUrl: long } } }); await p.open(); const d2 = decode(p.svg());
    check('lien long (clé de 48 signes, nom accentué de 80 signes) : décodé à l\'identique', d2.text === long, [d2.text && d2.text.length, long.length]);
    p = load({ qr: { status: 200, body: { success: true, activationUrl: 'https://ndsgpay.ndsgservices.com/pos.html?key=sk_pos_zzzz9999&label=B&keyid=p9' } } }); await p.open(); const d3 = decode(p.svg());
    check('deux clés différentes donnent deux QR différents, chacun décodé correctement', d3.text.includes('sk_pos_zzzz9999') && !d3.text.includes('aaaa1111'), d3.text);
  } else log('  (jsqr non installé : contrôle de relecture du QR ignoré)');
  p = load(); await p.open(); await p.open('p1', 'Caisse 1'); check('rouvrir la fenêtre remplace le QR (un seul dessin à l\'écran)', p.$('qr-container').querySelectorAll('svg').length === 1);
  const evil = '<img src=x onerror="window.__pwned=1">';
  p = load(); await p.open('p1', evil); check('nom de caisse hostile : affiché comme texte, aucun élément injecté', p.$('qr-label').textContent === evil && p.$('qr-label').querySelectorAll('img').length === 0 && !p.win.__pwned);
  p = load(); await p.open(); p.win.closeQRModal(); check('fermer la fenêtre la cache et efface le lien en mémoire', p.shown() === false && p.currentUrl() === '');

  group('B. Échecs : messages clairs, aucune clé affichée');
  p = load({ qr: { status: 403, body: { success: false, error: 'Permission insuffisante' } } }); await p.open();
  check('rôle sans droit (403) : message « Réservé au propriétaire et aux administrateurs »', /Réservé au propriétaire et aux administrateurs/.test(p.msg()) && !p.svg(), p.msg());
  check('403 : aucun lien affiché ni gardé en mémoire', p.$('qr-url').textContent === '' && p.currentUrl() === '');
  p = load(); await p.open(); p.state.qr = { status: 403, body: { success: false, error: 'Permission insuffisante' } }; await p.open();
  check('après un succès puis un refus : l\'ancien lien et l\'ancien QR disparaissent', !p.svg() && p.currentUrl() === '' && p.$('qr-url').textContent === '' && /Réservé/.test(p.msg()), [!!p.svg(), p.currentUrl(), p.msg()]);
  p = load({ qr: { status: 400, body: { success: false, error: 'Clé inactive' } } }); await p.open(); check('clé inactive : le message du serveur s\'affiche, pas de QR', /Clé inactive/.test(p.msg()) && !p.svg() && p.$('qr-url').textContent === '', p.msg());
  p = load({ qr: { status: 404, body: { success: false, error: 'Clé introuvable' } } }); await p.open(); check('clé introuvable : message, pas de QR', /Clé introuvable/.test(p.msg()) && !p.svg());
  p = load({ network: true }); await p.open(); check('réseau coupé : « Erreur », pas de QR, aucune exception', p.msg() === 'Erreur' && !p.svg() && p.errors.length === 0, [p.msg(), p.errors]);
  p = load({ lib: false }); await p.open();
  check('bibliothèque absente : le lien reste copiable et la page l\'explique, sans appeler un service extérieur', /QR code indisponible/.test(p.msg()) && !p.svg() && p.$('qr-url').textContent.includes('sk_pos_') && p.qrCalls().length === 1 && p.calls.every((c) => c.url.startsWith(API + '/')), [p.msg(), p.calls.map((c) => c.url)]);
  p = load({ qr: { status: 400, body: { success: false, error: evil } } }); await p.open(); check('message d\'erreur hostile du serveur : affiché comme texte', p.msg() === evil && p.$('qr-container').querySelectorAll('img').length === 0 && !p.win.__pwned);

  group('C. Panneau « Caisses POS »');
  p = load({ list: { status: 403, body: { success: false, error: 'Permission insuffisante' } } }); await p.win.loadPosKeys(); await flush();
  check('rôle sans droit : le panneau l\'explique au lieu de rester sur « Chargement »', /Réservé au propriétaire et aux administrateurs du compte/.test(p.$('poskeys-list').textContent) && !/Chargement/.test(p.$('poskeys-list').textContent), p.$('poskeys-list').textContent);
  p = load({ list: { status: 200, body: { success: true, keys: [{ id: 'p1', label: 'Caisse 1', scopeDeposit: true, scopePayout: false, isActive: true, lastUsedAt: null }, { id: 'p2', label: 'Caisse payout', scopeDeposit: true, scopePayout: true, isActive: false, lastUsedAt: '2026-11-20T10:00:00Z' }] } } }); await p.win.loadPosKeys(); await flush();
  check('propriétaire ou administrateur : la liste des caisses s\'affiche (nom, permissions, statut)', p.doc.querySelectorAll('#poskeys-list tbody tr').length === 2 && /Caisse payout/.test(p.$('poskeys-list').textContent) && /Payout/.test(p.$('poskeys-list').textContent) && /Inactive/.test(p.$('poskeys-list').textContent));
  check('la liste n\'affiche aucune clé secrète', !/sk_pos_/.test(p.$('poskeys-list').innerHTML));
  check('chaque ligne propose le bouton QR pour obtenir le lien', [...p.doc.querySelectorAll('#poskeys-list tbody tr')].every((tr) => /QR/.test(tr.textContent)));

  group('D. Contrôles du code');
  check('plus aucun service extérieur de QR code (qrserver) dans aucune page', !fs.readdirSync(path.resolve(__dirname, '..')).filter((f) => f.endsWith('.html')).some((f) => /qrserver/i.test(fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'))));
  check('le QR de la fenêtre n\'est pas une <img> venant d\'une adresse extérieure', !/<img[^>]+src=["']https?:\/\/[^"']*qr/i.test(HTML));
  check('la bibliothèque est chargée depuis le dépôt, pas depuis un autre site', /<script src="\/vendor\/qrcode-generator\.js"><\/script>/.test(HTML) && !/<script[^>]+src=["']https?:\/\/[^"']*qr/i.test(HTML));
  const sha = crypto.createHash('sha256').update(fs.readFileSync(LIBFILE)).digest('hex');
  check('la bibliothèque copiée est celle documentée (somme de contrôle de vendor/README.md)', fs.readFileSync(path.resolve(__dirname, '..', 'vendor', 'README.md'), 'utf8').includes(sha), sha);
  check('la bibliothèque ne contient aucun appel réseau, eval ni document.write', !/XMLHttpRequest|fetch\(|\beval\(|document\.write|new Function/.test(LIB));
  const fn = HTML.slice(HTML.indexOf('function renderQR'), HTML.indexOf('function setQRMessage'));
  check('le dessin du QR n\'injecte aucun HTML (ni innerHTML ni outerHTML)', fn.length > 200 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(fn));

  for (const g of groups) log(`${g.fails.length ? '✗' : '✓'} ${g.n.padEnd(58)} ${g.pass} réussis${g.fails.length ? ', ' + g.fails.length + ' ÉCHEC(S)' : ''}`);
  log(`\n${ok} / ${total} vérifications réussies`);
  if (ok !== total) { log('\nÉCHECS :'); groups.forEach((g) => g.fails.forEach((f) => log(`  ✗ [${g.n}] ${f}`))); }
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { log('ERREUR DE TEST :', (e && e.stack) || e); process.exit(2); });
