// Test de la page canope.html (le vrai fichier) dans JSDOM, avec un faux serveur
const { JSDOM } = require('jsdom');                      // npm i jsdom (voir tests/README.md)
const fs = require('fs');
const path = require('path');
const FILE = process.env.CANOPE_HTML || path.resolve(__dirname, '..', 'canope.html');
const HTML = fs.readFileSync(FILE, 'utf8');
const API = 'https://ndsgpay-backend.vercel.app/api/demo/canope';
const log = console.log.bind(console);
const flush = () => new Promise((r) => setTimeout(r, 25));

const groups = []; let G; let total = 0; let ok = 0;
const group = (n) => { G = { n, pass: 0, fails: [] }; groups.push(G); };
const check = (name, cond, detail) => { total++; if (cond) { ok++; G.pass++; } else G.fails.push(name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };

const OFFERS = [1, 3, 6, 12].map((m, i) => ({ months: m, amount: [100, 200, 300, 500][i], currency: 'XAF' }));
const unitOf = (over = {}) => ({ serial: '12345', vehicle: 'Toyota Hilux – GA 1234 AB', active: true, until: '2026-12-02T10:00:00.000Z', ...over });

function load({ pending = null, cfg = {} } = {}) {
  const timers = []; const calls = []; let now = Date.now();
  const config = { unit: unitOf(), lookupStatus: 200, pay: { status: 200, body: { success: true, depositId: 'dep-1', months: 3, amount: 200 } }, statuses: [], renewals: null, code: 'code-ok', ...cfg };
  const dom = new JSDOM(HTML, {
    url: 'https://ndsgpay.ndsgservices.com/canope.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(win) {
      win.scrollTo = () => {};
      win.fetch = async (url, opts = {}) => {
        const call = { method: opts.method || 'GET', url, body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} };
        calls.push(call);
        let r;
        if (/\/unit\//.test(url)) r = config.lookupStatus === 200 ? { status: 200, body: { success: true, unit: config.unit, offers: OFFERS, correspondents: ['AIRTEL_GAB', 'MOOV_GAB'] } } : config.lookupStatus === 0 ? 'network' : { status: config.lookupStatus, body: { success: false, error: 'Boîtier introuvable. Vérifiez le numéro de série.' } };
        else if (/\/pay$/.test(url)) r = config.pay;
        else if (/\/status\//.test(url)) r = config.statuses.length > 1 ? config.statuses.shift() : config.statuses[0] || { status: 200, body: { success: true, state: 'PENDING', message: 'En attente de la validation sur votre téléphone…' } };
        else if (/\/renewals/.test(url)) r = (call.headers.Authorization === 'Bearer ' + config.code) ? { status: 200, body: { success: true, renewals: config.renewals || [] } } : { status: 401, body: { success: false, error: 'Code d\'accès invalide.' } };
        else r = { status: 404, body: { success: false } };
        if (r === 'network') throw new TypeError('Failed to fetch');
        return { status: r.status, json: async () => { if (r.body === undefined) throw new Error('pas de JSON'); return r.body; } };
      };
      win.setInterval = (fn, ms) => { timers.push({ fn, ms, active: true }); return timers.length; };
      win.clearInterval = (id) => { if (timers[id - 1]) timers[id - 1].active = false; };
      win.Date.now = () => now;
      if (pending) win.sessionStorage.setItem('canope.pending', JSON.stringify(typeof pending === 'function' ? pending(now) : pending));
    },
  });
  const win = dom.window; const doc = win.document;
  const $ = (id) => doc.getElementById(id);
  const shown = (id) => !$(id).classList.contains('hidden');
  const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new win.Event('input', { bubbles: true })); };
  const click = async (id) => { $(id).click(); await flush(); };
  const pick = (sel) => { const r = doc.querySelector(sel); r.checked = true; r.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const poll = async () => { for (const t of timers.filter((x) => x.active && x.ms === 3000)) t.fn(); await flush(); };
  const activeTimers = () => timers.filter((t) => t.active).length;
  const visibleStep = () => ['step-serial', 'step-offer', 'step-wait', 'step-result'].filter(shown);
  return { win, doc, $, shown, type, click, pick, poll, calls, timers, config, activeTimers, visibleStep, advance: (ms) => { now += ms; }, now: () => now };
}
async function toOffer(opts) { const p = load(opts); p.type('serial', '12345'); await p.click('btn-lookup'); return p; }
async function toWait(opts, months = 3, op = 'MOOV_GAB', phone = '062709401') {
  const p = await toOffer(opts); p.pick(`input[name=months][value="${months}"]`); p.pick(`input[name=operator][value="${op}"]`); p.type('msisdn', phone); await p.click('btn-pay'); return p;
}
const PAID = { status: 200, body: { success: true, state: 'PAID', serial: '12345', vehicle: 'Toyota Hilux – GA 1234 AB', months: 3, amount: 200, previousExpiry: '2026-12-02T10:00:00.000Z', newExpiry: '2027-03-02T10:00:00.000Z', message: 'Abonnement prolongé de 3 mois.' } };
const FAILED = { status: 200, body: { success: true, state: 'FAILED', message: 'Le paiement n\'a pas abouti (refusé, annulé ou délai dépassé). Vous pouvez réessayer.' } };
const PENDING = (m) => ({ status: 200, body: { success: true, state: 'PENDING', message: m || 'En attente de la validation sur votre téléphone…' } });

(async () => {
  group('A. Départ et numéro de série');
  let p = load();
  check('la page s\'ouvre sur la saisie du numéro de série, seule étape visible', JSON.stringify(p.visibleStep()) === '["step-serial"]', p.visibleStep());
  check('bouton « Vérifier » désactivé au départ', p.$('btn-lookup').disabled === true);
  check('badge DÉMO affiché', /DÉMO/.test(p.doc.querySelector('.badge-demo').textContent));
  check('page non indexée par les moteurs de recherche', /noindex/.test(p.doc.querySelector('meta[name=robots]').content));
  p.type('serial', 'ab12-3'); check('lettres et signes retirés : « ab12-3 » → « 123 »', p.$('serial').value === '123' && p.$('btn-lookup').disabled === true, p.$('serial').value);
  p.type('serial', '123456789'); check('coupé à 5 chiffres', p.$('serial').value === '12345' && p.$('btn-lookup').disabled === false, p.$('serial').value);
  check('l\'adresse du serveur est bien celle de la démo', fs.readFileSync(FILE, 'utf8').includes('var API = "' + API + '"'));
  check('aucune injection de HTML dans le code de la page', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(HTML));

  group('B. Consultation du boîtier');
  p = await toOffer();
  check('la requête vise /unit/12345', p.calls[0].method === 'GET' && p.calls[0].url === API + '/unit/12345', p.calls[0]);
  check('on passe à l\'étape durée / opérateur', JSON.stringify(p.visibleStep()) === '["step-offer"]');
  check('véhicule et numéro affichés', /Toyota Hilux/.test(p.$('unit-vehicle').textContent) && p.$('unit-serial').textContent === '12345');
  check('abonnement actif : pastille verte avec la date', p.$('unit-chip').classList.contains('active') && /actif jusqu’au 02\/12\/2026/.test(p.$('unit-chip').textContent), p.$('unit-chip').textContent);
  check('4 durées proposées avec leur prix', [...p.doc.querySelectorAll('#offers .option')].map((l) => l.textContent.replace(/\s+/g, ' ').replace(/\u202f|\u00a0/g, ' ').trim()).join('|') === '1 mois 100 FCFA|3 mois 200 FCFA|6 mois 300 FCFA|12 mois 500 FCFA', [...p.doc.querySelectorAll('#offers .option')].map((l) => l.textContent));
  check('3 mois présélectionné, total 200 FCFA', p.doc.querySelector('input[name=months]:checked').value === '3' && /200/.test(p.$('total').textContent));
  check('2 opérateurs : Airtel Money et Moov Money', [...p.doc.querySelectorAll('#operators .option')].map((l) => l.textContent.trim()).join('|') === 'Airtel Money|Moov Money');
  check('« Payer » désactivé tant que l\'opérateur et le numéro manquent', p.$('btn-pay').disabled === true);
  p = await toOffer({ cfg: { unit: unitOf({ active: false, until: '2026-11-01T10:00:00.000Z' }) } });
  check('abonnement expiré : pastille rouge « expiré depuis le 01/11/2026 »', p.$('unit-chip').classList.contains('expired') && /expiré depuis le 01\/11\/2026/.test(p.$('unit-chip').textContent), p.$('unit-chip').textContent);
  const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
  p = await toOffer({ cfg: { unit: unitOf({ vehicle: evil }) } });
  check('nom de véhicule hostile : affiché comme texte, aucun élément injecté', p.$('unit-vehicle').textContent === evil && p.doc.querySelectorAll('#unit-vehicle *').length === 0 && !p.win.__pwned, p.$('unit-vehicle').innerHTML);
  p = load({ cfg: { lookupStatus: 404 } }); p.type('serial', '99999'); await p.click('btn-lookup');
  check('boîtier inconnu : message du serveur, on reste sur la saisie', /introuvable/i.test(p.$('serial-error').textContent) && JSON.stringify(p.visibleStep()) === '["step-serial"]');
  check('…et le bouton redevient utilisable', p.$('btn-lookup').disabled === false && p.$('btn-lookup').textContent === 'Vérifier mon boîtier');
  p = load({ cfg: { lookupStatus: 0 } }); p.type('serial', '12345'); await p.click('btn-lookup');
  check('coupure réseau : message clair, aucune erreur', /Connexion impossible/.test(p.$('serial-error').textContent) && JSON.stringify(p.visibleStep()) === '["step-serial"]', p.$('serial-error').textContent);
  p = await toOffer(); await p.click('btn-change');
  check('« Changer de boîtier » : retour à la saisie, champ vidé', JSON.stringify(p.visibleStep()) === '["step-serial"]' && p.$('serial').value === '' && p.$('btn-lookup').disabled === true);

  group('C. Durée, opérateur et numéro');
  p = await toOffer(); p.pick('input[name=months][value="6"]');
  check('6 mois : total 300 FCFA et bouton « Payer 300 FCFA »', /300/.test(p.$('total').textContent) && /Payer 300/.test(p.$('btn-pay').textContent), p.$('btn-pay').textContent);
  check('l\'option choisie est mise en évidence', p.doc.querySelector('input[value="6"]').parentElement.classList.contains('selected') && !p.doc.querySelector('input[value="3"]').parentElement.classList.contains('selected'));
  p.type('msisdn', '062709401'); check('numéro en 06… : Moov présélectionné', p.doc.querySelector('input[name=operator]:checked').value === 'MOOV_GAB');
  check('…le bouton « Payer » devient actif', p.$('btn-pay').disabled === false);
  p = await toOffer(); p.type('msisdn', '077000000'); check('numéro en 07… : Airtel présélectionné', p.doc.querySelector('input[name=operator]:checked').value === 'AIRTEL_GAB');
  p = await toOffer(); p.pick('input[name=operator][value="AIRTEL_GAB"]'); p.type('msisdn', '062709401');
  check('un choix explicite du client n\'est pas écrasé par la devinette', p.doc.querySelector('input[name=operator]:checked').value === 'AIRTEL_GAB');
  p = await toOffer(); p.pick('input[name=operator][value="MOOV_GAB"]'); p.type('msisdn', '123'); check('numéro trop court : « Payer » reste désactivé', p.$('btn-pay').disabled === true);

  group('D. Lancement du paiement');
  p = await toWait(undefined, 6, 'MOOV_GAB', '062 70 94 01');
  const payCall = p.calls.find((c) => /\/pay$/.test(c.url));
  check('requête de paiement : numéro de série, durée, opérateur, numéro tel que saisi', payCall && payCall.method === 'POST' && JSON.stringify(payCall.body) === JSON.stringify({ serial: '12345', months: 6, correspondent: 'MOOV_GAB', msisdn: '062 70 94 01' }), payCall && payCall.body);
  check('la page n\'envoie JAMAIS de montant ni de prix', payCall && !('amount' in payCall.body) && !('price' in payCall.body) && !('currency' in payCall.body));
  check('étape d\'attente affichée', JSON.stringify(p.visibleStep()) === '["step-wait"]');
  check('suivi mémorisé pour une reprise (identifiant du paiement)', JSON.parse(p.win.sessionStorage.getItem('canope.pending')).depositId === 'dep-1');
  check('consultation toutes les 3 s + compte à rebours chaque seconde', p.timers.some((t) => t.active && t.ms === 3000) && p.timers.some((t) => t.active && t.ms === 1000));
  check('compte à rebours démarré à 2:00', p.$('countdown').textContent === '2:00', p.$('countdown').textContent);
  p = await toOffer({ cfg: { pay: { status: 400, body: { success: false, error: 'Numéro invalide. Exemple : 062 70 94 01' } } } }); p.pick('input[name=operator][value="MOOV_GAB"]'); p.type('msisdn', '0627094'); p.type('msisdn', '062709401'); await p.click('btn-pay');
  check('refus du serveur : message affiché, on reste sur l\'étape durée', /Numéro invalide/.test(p.$('offer-error').textContent) && JSON.stringify(p.visibleStep()) === '["step-offer"]');
  check('…et le bouton « Payer » redevient utilisable', p.$('btn-pay').disabled === false && /Payer 200/.test(p.$('btn-pay').textContent), p.$('btn-pay').textContent);
  check('…rien n\'est mémorisé pour la reprise', p.win.sessionStorage.getItem('canope.pending') === null);
  p = await toOffer({ cfg: { pay: { status: 409, body: { success: false, error: 'Un paiement est déjà en cours pour ce boîtier.' } } } }); p.pick('input[name=operator][value="AIRTEL_GAB"]'); p.type('msisdn', '077000000'); await p.click('btn-pay');
  check('paiement déjà en cours : message du serveur affiché', /déjà en cours/.test(p.$('offer-error').textContent));

  p = await toOffer(); p.pick('input[name=operator][value="MOOV_GAB"]'); p.type('msisdn', '062709401'); p.$('btn-pay').click();
  check('pendant l\'envoi : « Payer » désactivé et libellé « Envoi en cours… »', p.$('btn-pay').disabled === true && /Envoi en cours/.test(p.$('btn-pay').textContent), p.$('btn-pay').textContent);
  p.$('btn-pay').click(); await flush(); check('un second clic pendant l\'envoi ne lance pas un second paiement', p.calls.filter((c) => /\/pay$/.test(c.url)).length === 1, p.calls.length);
  p = load(); p.type('serial', '12345'); p.$('btn-lookup').click(); check('pendant la vérification : bouton désactivé « Vérification… »', p.$('btn-lookup').disabled === true && /Vérification/.test(p.$('btn-lookup').textContent)); await flush();

  group('E. Attente et résultat');
  p = await toWait({ cfg: { statuses: [PENDING('Paiement reçu, prolongation en cours…'), PAID] } });
  check('en attente : le message du serveur s\'affiche, on reste en attente', /prolongation en cours/.test(p.$('wait-msg').textContent) && JSON.stringify(p.visibleStep()) === '["step-wait"]', p.$('wait-msg').textContent);
  await p.poll();
  check('payé : écran de succès avec le véhicule et « +3 mois »', JSON.stringify(p.visibleStep()) === '["step-result"]' && /Abonnement prolongé/.test(p.$('result-title').textContent) && /Toyota Hilux/.test(p.$('result-text').textContent) && /\+3 mois/.test(p.$('result-text').textContent), p.$('result-text').textContent);
  check('anciennes et nouvelles échéances affichées', /02\/12\/2026/.test(p.$('date-old').textContent) && /02\/03\/2027/.test(p.$('date-new').textContent), [p.$('date-old').textContent, p.$('date-new').textContent]);
  check('suivi effacé et minuteries arrêtées', p.win.sessionStorage.getItem('canope.pending') === null && p.activeTimers() === 0, p.activeTimers());
  check('l\'identifiant du paiement est dans l\'adresse interrogée', p.calls.filter((c) => /\/status\//.test(c.url)).every((c) => c.url === API + '/status/dep-1'));
  await p.click('btn-again'); check('« Renouveler un autre boîtier » : retour à la saisie', JSON.stringify(p.visibleStep()) === '["step-serial"]' && p.$('serial').value === '');
  p = await toWait({ cfg: { statuses: [FAILED] } }); await p.poll();
  check('échec : écran « Paiement non abouti » avec le message', JSON.stringify(p.visibleStep()) === '["step-result"]' && /non abouti/.test(p.$('result-title').textContent) && /n'a pas abouti/.test(p.$('result-text').textContent) && p.$('result-dates').classList.contains('hidden'));
  check('échec : suivi effacé, minuteries arrêtées', p.win.sessionStorage.getItem('canope.pending') === null && p.activeTimers() === 0, p.activeTimers());
  check('échec : bouton « Réessayer »', p.$('btn-again').textContent === 'Réessayer');
  await p.click('btn-again'); check('« Réessayer » ramène à l\'étape durée avec le même boîtier', JSON.stringify(p.visibleStep()) === '["step-offer"]' && p.$('unit-serial').textContent === '12345');
  p = await toWait({ cfg: { statuses: [{ status: 404, body: { success: false, error: 'Paiement introuvable.' } }] } }); await p.poll();
  check('paiement introuvable : résultat clair, minuteries arrêtées', JSON.stringify(p.visibleStep()) === '["step-result"]' && /introuvable/i.test(p.$('result-title').textContent) && p.activeTimers() === 0);
  p = await toWait({ cfg: { statuses: [PENDING()] } }); p.advance(121000); await p.poll();
  check('délai dépassé : message rassurant, minuteries arrêtées', /pas encore reçu/.test(p.$('wait-msg').textContent) && /prolongé automatiquement/.test(p.$('wait-error').textContent) && p.activeTimers() === 0, p.$('wait-error').textContent);
  check('…et le bouton « Vérifier maintenant » apparaît', !p.$('btn-check').classList.contains('hidden'));
  p.config.statuses = [PAID]; await p.click('btn-check'); check('« Vérifier maintenant » relance le suivi et affiche le succès', JSON.stringify(p.visibleStep()) === '["step-result"]' && /Abonnement prolongé/.test(p.$('result-title').textContent));
  p = await toWait({ cfg: { statuses: [{ status: 500, body: null }] } }); for (let i = 0; i < 5; i++) await p.poll();
  check('5 coupures de suite : message réseau, minuteries arrêtées, bouton « Vérifier maintenant »', /Connexion impossible/.test(p.$('wait-error').textContent) && p.activeTimers() === 0 && !p.$('btn-check').classList.contains('hidden'), p.$('wait-error').textContent);
  p = await toWait({ cfg: { statuses: [{ status: 500, body: null }, { status: 500, body: null }, PENDING()] } }); for (let i = 0; i < 4; i++) await p.poll();
  check('2 coupures puis une réponse : on continue sans message d\'erreur', p.$('wait-error').textContent === '' && p.activeTimers() === 2);
  p = await toWait(); await p.click('btn-wait-back'); check('« Renouveler un autre boîtier » pendant l\'attente : retour, minuteries arrêtées, suivi oublié', JSON.stringify(p.visibleStep()) === '["step-serial"]' && p.activeTimers() === 0 && p.win.sessionStorage.getItem('canope.pending') === null);

  group('F. Reprise après rechargement de la page');
  p = load({ pending: (now) => ({ depositId: 'dep-9', serial: '12345', months: 3, at: now - 30000 }), cfg: { statuses: [PAID] } }); await flush();
  check('un paiement en cours est repris : étape d\'attente directement', JSON.stringify(p.visibleStep()) === '["step-result"]' || JSON.stringify(p.visibleStep()) === '["step-wait"]');
  check('…en interrogeant le bon paiement', p.calls.some((c) => c.url === API + '/status/dep-9'), p.calls.map((c) => c.url));
  check('…et le succès s\'affiche', JSON.stringify(p.visibleStep()) === '["step-result"]' && /Abonnement prolongé/.test(p.$('result-title').textContent));
  p = load({ pending: (now) => ({ depositId: 'dep-old', serial: '12345', months: 3, at: now - 11 * 60 * 1000 }) });
  check('un suivi vieux de plus de 10 minutes est ignoré et effacé', JSON.stringify(p.visibleStep()) === '["step-serial"]' && p.win.sessionStorage.getItem('canope.pending') === null && p.calls.length === 0);
  p = load({ pending: '{pas du json' }); check('suivi illisible : ignoré sans erreur', JSON.stringify(p.visibleStep()) === '["step-serial"]');

  group('G. Espace Canopé (liste des renouvellements)');
  const rows = [{ createdAt: '2026-11-20T10:05:00.000Z', serial: '12345', vehicle: evil, months: 3, amount: 200, correspondent: 'MOOV_GAB', payerLast4: '9401', status: 'APPLIED', newExpiry: '2027-03-02T10:00:00.000Z', emailSent: true },
    { createdAt: '2026-11-20T09:00:00.000Z', serial: '34567', vehicle: 'Renault Duster – GA 3456 EF', months: 1, amount: 100, correspondent: 'AIRTEL_GAB', payerLast4: '7700', status: 'PENDING', newExpiry: null, emailSent: false },
    { createdAt: '2026-11-19T09:00:00.000Z', serial: '23456', vehicle: null, months: 12, amount: 500, correspondent: 'AIRTEL_GAB', payerLast4: null, status: 'FAILED', newExpiry: null, emailSent: false }];
  p = load({ cfg: { renewals: rows } });
  check('l\'espace Canopé est caché par défaut', !p.shown('admin') === true);
  await p.click('btn-admin-toggle'); check('il s\'affiche sur demande', p.shown('admin'));
  p.$('admin-code').value = 'mauvais'; await p.click('btn-admin-load');
  check('mauvais code : message, la liste reste cachée', /invalide/i.test(p.$('admin-error').textContent) && p.$('admin-list').classList.contains('hidden') && !p.$('admin-login').classList.contains('hidden'), p.$('admin-error').textContent);
  p.$('admin-code').value = 'code-ok'; await p.click('btn-admin-load');
  const rc = p.calls.filter((c) => /\/renewals/.test(c.url)).pop();
  check('le code part dans l\'en-tête Authorization (jamais dans l\'adresse)', rc.headers.Authorization === 'Bearer code-ok' && !/code-ok/.test(rc.url), rc);
  check('bon code : liste affichée avec 3 lignes', !p.$('admin-list').classList.contains('hidden') && p.doc.querySelectorAll('#admin-rows tr').length === 3 && p.$('admin-login').classList.contains('hidden'));
  const cells = [...p.doc.querySelectorAll('#admin-rows tr')[0].children].map((c) => c.textContent);
  check('1re ligne : boîtier, durée, montant, opérateur, payeur, statut, échéance, e-mail', cells[1] === '12345' && cells[3] === '3 mois' && /200/.test(cells[4]) && cells[5] === 'Moov' && cells[6] === '•••• 9401' && cells[7] === 'Prolongé' && cells[8] === '02/03/2027' && cells[9] === 'Envoyé', cells);
  check('véhicule hostile dans le tableau : texte seulement, aucun élément injecté', cells[2] === evil && p.doc.querySelectorAll('#admin-rows img, #admin-rows script').length === 0 && !p.win.__pwned);
  check('statuts colorés : Prolongé, En attente, Échoué', [...p.doc.querySelectorAll('#admin-rows tr')].map((tr) => tr.children[7].textContent).join('|') === 'Prolongé|En attente|Échoué' && p.doc.querySelector('#admin-rows tr:nth-child(2) td:nth-child(8)').className === 'st-PENDING');
  check('véhicule absent : tiret', p.doc.querySelectorAll('#admin-rows tr')[2].children[2].textContent === '—');
  check('en-têtes dans l\'ordre : « Payeur » juste après « Opérateur »', [...p.doc.querySelectorAll('#admin-list thead th')].map((t) => t.textContent).join('|') === 'Date|Boîtier|Véhicule|Durée|Montant|Opérateur|Payeur|Statut|Nouvelle échéance|E-mail', [...p.doc.querySelectorAll('#admin-list thead th')].map((t) => t.textContent));
  check('chaque ligne a autant de cases que d\'en-têtes (10)', [...p.doc.querySelectorAll('#admin-rows tr')].every((tr) => tr.children.length === 10));
  check('payeur : « •••• 7700 » ; payeur absent (null) : tiret', p.doc.querySelectorAll('#admin-rows tr')[1].children[6].textContent === '•••• 7700' && p.doc.querySelectorAll('#admin-rows tr')[2].children[6].textContent === '—');
  p.config.renewals = []; await p.click('btn-admin-refresh');
  check('« Actualiser » recharge, liste vide : message « Aucun renouvellement »', p.doc.querySelectorAll('#admin-rows tr').length === 0 && !p.$('admin-empty').classList.contains('hidden'));
  check('le code n\'est stocké nulle part (ni session, ni stockage local)', p.win.sessionStorage.length === 0 && p.win.localStorage.length === 0);

  group('G2. Colonne « Payeur » : formats reçus');
  const payerRows = [9401, '7700', 'abc', '12345', '', null, undefined, evil, '12 3', '9401 '].map((v, i) => ({ createdAt: '2026-11-20T10:0' + i + ':00.000Z', serial: '12345', vehicle: 'V', months: 1, amount: 100, correspondent: 'AIRTEL_GAB', status: 'APPLIED', newExpiry: null, emailSent: false, payerLast4: v }));
  p = load({ cfg: { renewals: payerRows } }); await p.click('btn-admin-toggle'); p.$('admin-code').value = 'code-ok'; await p.click('btn-admin-load');
  const shownPayers = [...p.doc.querySelectorAll('#admin-rows tr')].map((tr) => tr.children[6].textContent);
  check('seuls 4 chiffres exacts s\'affichent (nombre ou texte) ; tout le reste → tiret', JSON.stringify(shownPayers) === JSON.stringify(['•••• 9401', '•••• 7700', '—', '—', '—', '—', '—', '—', '—', '—']), shownPayers);
  check('valeur hostile reçue pour le payeur : jamais affichée, aucun élément injecté', !shownPayers.includes(evil) && p.doc.querySelectorAll('#admin-rows img, #admin-rows script').length === 0 && !p.win.__pwned);
  check('le numéro entier n\'apparaît nulle part dans le tableau', !/24162709401|062709401/.test(p.$('admin-rows').textContent));

  group('H. Divers');
  p = load(); p.$('logo-img').dispatchEvent(new p.win.Event('error')); check('logo qui ne charge pas : le nom Canopé s\'affiche à la place', p.$('logo-img').classList.contains('hidden') && p.$('logo-text').style.display === 'inline');
  p = load(); await p.click('btn-lookup'); check('clic sur « Vérifier » sans 5 chiffres : aucune requête', p.calls.length === 0);
  p = await toOffer(); const before = p.calls.length; await p.click('btn-pay'); check('« Payer » désactivé : aucun clic ne part', p.calls.length === before);
  p = load(); p.type('serial', '12345'); const pr = p.$('serial').dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush(); check('touche Entrée dans le champ : lance la vérification', p.calls.length === 1 && /\/unit\/12345$/.test(p.calls[0].url), p.calls.length);

  for (const g of groups) log(`${g.fails.length ? '✗' : '✓'} ${g.n.padEnd(60)} ${g.pass} réussis${g.fails.length ? ', ' + g.fails.length + ' ÉCHEC(S)' : ''}`);
  log(`\n${ok} / ${total} vérifications réussies`);
  if (ok !== total) { log('\nÉCHECS :'); groups.forEach((g) => g.fails.forEach((f) => log(`  ✗ [${g.n}] ${f}`))); }
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { log('ERREUR DE TEST :', (e && e.stack) || e); process.exit(2); });
